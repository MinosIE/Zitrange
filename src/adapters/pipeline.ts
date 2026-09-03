import { readFileSync, mkdirSync } from 'node:fs';
import type {
  Chunk,
  CharFreq,
  FontInfo,
  OutputFormat,
  PartitionStrategy,
  ValidationIssue,
  Recommendation,
} from '../core/types';
import {
  applyFallback,
  extractCharFreq,
  FALLBACK_SIZES,
  mergeCharFreq,
  sortByFrequency,
  sortByGlobalRank,
} from '../core/charset';
import { charFreqCodepoints } from '../core/assets/charfreq-zh';
import { partition } from '../core/partition';
import { toUnicodeRange } from '../core/unicodeRange';
import { estimateChunkSize, simulateLoad, type SimulateResult } from '../core/simulate';
import { recommend } from '../core/recommend';
import { validate } from '../core/validate';
import { inspectFont, subsetChunks } from './fontEngine';

/** 任何页面都会用到的 ASCII 与常用标点，保底纳入，确保产物含数字/字母 */
const ASCII_PUNCT: readonly number[] = (() => {
  const out: number[] = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) out.push(cp); // ASCII 可打印
  for (let cp = 0x3000; cp <= 0x303f; cp++) out.push(cp); // CJK 符号和标点
  for (let cp = 0xff01; cp <= 0xff5e; cp++) out.push(cp); // 全角 ASCII 变体
  return out;
})();

export interface ProcessRequest {
  fontPath: string;
  fontNumber?: number;
  /** 字符集来源：直接文本，或若干文本文件（取其内容扫描字符） */
  text?: string;
  files?: string[];
  format: OutputFormat[];
  strategy: PartitionStrategy;
  /** 用于模拟加载的样本文本（可选） */
  sampleText?: string;
  outDir: string;
  baseName: string;
  /** 静态资源 URL 前缀（API 侧用于拼接可访问的字体文件地址） */
  publicBase?: string;
}

export interface ChunkResult {
  index: number;
  codepoints: number[];
  unicodeRange: string;
  files: Partial<Record<OutputFormat, { url: string; bytes: number }>>;
}

export interface ProcessResult {
  font: FontInfo;
  charsetSize: number;
  chunks: ChunkResult[];
  css: string;
  simulation?: SimulateResult;
  recommendation: Recommendation;
  issues: ValidationIssue[];
}

/** 完整处理管线：检视 → 取字 → 分片 → 生成 unicode-range → 子集化 → 组装 */
export async function processFont(req: ProcessRequest): Promise<ProcessResult> {
  const font = await inspectFont(req.fontPath, req.fontNumber ?? 0);

  // 1. 字符集（按模式构建，规则见 PRD §6.2.1）
  const freqs: CharFreq[] = [];
  if (req.text) freqs.push(extractCharFreq(req.text));
  if (req.files) {
    for (const fp of req.files) freqs.push(extractCharFreq(readFileSync(fp, 'utf-8')));
  }
  const siteFreq = mergeCharFreq(...freqs);

  const supported = new Set(font.codepoints);
  // 全局字频降序表，与字体支持的码位取交集（字体不含的字自动跳过，不会缺字）。
  const table = charFreqCodepoints().filter((cp) => supported.has(cp));

  // 2. 按模式组合「字源 × 兜底字表 × ASCII 保底」
  const mode = req.strategy.mode;
  const fbSize = FALLBACK_SIZES[req.strategy.fallback] ?? 0;
  const freq: CharFreq = new Map(siteFreq);

  if (req.strategy.useFontCmap) {
    // 全量模式：直接纳入字体 cmap 的全部码位，绕过兜底字表上限，
    // 保证不漏任何字形（生僻字、扩展区、符号等一律切出）。
    for (const cp of font.codepoints) {
      if (!freq.has(cp)) freq.set(cp, 0);
    }
  } else if (mode !== 'site' && fbSize > 0) {
    // 站点模式：只用扫描到的字，不补兜底。
    // 混合 / 字频模式：按所选档位用全局字频表补全生僻字。
    applyFallback(freq, table, fbSize);
  }
  // ASCII 与常用标点保底：所有模式都纳入，确保产物含数字/字母/标点。
  for (const cp of ASCII_PUNCT) {
    if (supported.has(cp) && !freq.has(cp)) freq.set(cp, 0);
  }

  // 排序：字频模式忽略站点真实频次，一律按全局字频表名次（§6.2.1）；
  // 站点 / 混合模式按实际频次，站点用字优先进入高频片。
  const ordered =
    mode === 'frequency' ? sortByGlobalRank(freq) : sortByFrequency(freq);
  const charsetSize = ordered.length;

  // 3. 分片
  const chunks: Chunk[] = partition(ordered, req.strategy);

  // 4. 子集化（交给 Python engine）
  mkdirSync(req.outDir, { recursive: true });
  const subset = await subsetChunks({
    path: req.fontPath,
    fontNumber: req.fontNumber ?? 0,
    chunks: chunks.map((c) => c.codepoints),
    formats: req.format,
    outDir: req.outDir,
    baseName: req.baseName,
  });

  const avg = font.numGlyphs > 0 ? font.bytes / font.numGlyphs : 270;

  // 5. 组装每片结果
  const chunkResults: ChunkResult[] = chunks.map((c, i) => {
    const sub = subset.chunks.find((s) => s.index === i);
    const files: ChunkResult['files'] = {};
    if (sub) {
      for (const fmt of req.format) {
        const f = sub.files[fmt];
        if (f) {
          const base = req.publicBase ?? '/output';
          files[fmt] = {
            url: `${base}/${req.baseName}-${i}.${fmt === 'ttf' ? 'ttf' : fmt}`,
            bytes: f.bytes,
          };
        }
      }
    }
    return {
      index: c.index,
      codepoints: c.codepoints,
      unicodeRange: toUnicodeRange(c.codepoints),
      files,
    };
  });

  const css = toCss(chunkResults, font.family, req.format, req.baseName);

  const realSizes = chunkResults.map(
    (c) => Object.values(c.files)[0]?.bytes ?? estimateChunkSize(c.codepoints.length, avg),
  );
  const simulation = req.sampleText
    ? simulateLoad(chunks, req.sampleText, { chunkSizes: realSizes })
    : undefined;
  const recommendation = recommend({ font, charCount: charsetSize, strategy: req.strategy });
  const issues = validate({ charCount: charsetSize, strategy: req.strategy, format: req.format, font });

  return { font, charsetSize, chunks: chunkResults, css, simulation, recommendation, issues };
}

function toCss(
  chunks: ChunkResult[],
  family: string,
  formats: OutputFormat[],
  baseName: string,
): string {
  return chunks
    .map((c) => {
      const srcs = formats
        .map((f) => {
          const ext = f === 'ttf' ? 'ttf' : f;
          const fmt = f === 'ttf' ? 'truetype' : f;
          return `url('${baseName}-${c.index}.${ext}') format('${fmt}')`;
        })
        .join(', ');
      return `@font-face {\n  font-family: '${family}';\n  src: ${srcs};\n  font-display: swap;\n  unicode-range: ${c.unicodeRange};\n}`;
    })
    .join('\n\n');
}
