import { readFileSync, mkdirSync } from 'node:fs';
import type {
  Chunk,
  CharFreq,
  FontInfo,
  OutputFormat,
  PartitionStrategy,
} from '../core/types';
import {
  applyFallback,
  ASCII_PUNCT,
  COMMON_TABLE,
  extractCharFreq,
  FALLBACK_SIZES,
  mergeCharFreq,
} from '../core/charset';
import { partition, isAsciiOrPunct } from '../core/partition';
import { toUnicodeRange } from '../core/unicodeRange';
import { estimateChunkSize, simulateLoad, type SimulateResult } from '../core/simulate';
import { inspectFont, subsetChunks } from './fontEngine';

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
}

/** 完整处理管线：检视 → 取字 → 分片 → 生成 unicode-range → 子集化 → 组装 */
export async function processFont(req: ProcessRequest): Promise<ProcessResult> {
  const font = await inspectFont(req.fontPath, req.fontNumber ?? 0);

  // 1. 字符集：扫描文本（若有）
  const freqs: CharFreq[] = [];
  if (req.text) freqs.push(extractCharFreq(req.text));
  if (req.files) {
    for (const fp of req.files) freqs.push(extractCharFreq(readFileSync(fp, 'utf-8')));
  }
  const siteFreq = mergeCharFreq(...freqs);

  const supported = new Set(font.codepoints);

  // 2. 组合「字源 × 兜底字表 × ASCII 保底」，得到最终字符集（顺序无关，partition 内部按码位重排）
  const freq: CharFreq = new Map(siteFreq);
  if (req.strategy.useFontCmap) {
    // 全量模式：直接纳入字体 cmap 的全部码位，绕过兜底字表上限，保证不漏任何字形。
    for (const cp of font.codepoints) {
      if (!freq.has(cp)) freq.set(cp, 0);
    }
  } else {
    // 仅用户内容：按所选档位用通用常用字表补全（'common' = 前 3500 字），'none' 不补。
    const fbSize = FALLBACK_SIZES[req.strategy.fallback] ?? 0;
    if (fbSize > 0) applyFallback(freq, COMMON_TABLE, fbSize);
  }
  // ASCII 与常用标点保底：默认纳入，确保产物含数字/字母/标点；可由 includeAsciiPunct 关闭。
  // 全量模式 cmap 已含这些字，此处无额外作用。
  if (req.strategy.includeAsciiPunct ?? true) {
    for (const cp of ASCII_PUNCT) {
      if (supported.has(cp) && !freq.has(cp)) freq.set(cp, 0);
    }
  }
  const ordered = [...freq.keys()];
  const charsetSize = ordered.length;

  // 3. 分片：按码位均匀切片（basic/common/rare 结构）
  const chunks: Chunk[] = partition(ordered, req.strategy, {
    asciiFirst: req.strategy.asciiFirst ?? true,
  });

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

  const css = toCss(chunkResults, font.family, req.format, req.baseName, {
    asciiFirst: req.strategy.asciiFirst ?? true,
    asciiAlwaysLoad: req.strategy.asciiAlwaysLoad ?? false,
  });

  const realSizes = chunkResults.map(
    (c) => Object.values(c.files)[0]?.bytes ?? estimateChunkSize(c.codepoints.length, avg),
  );
  const simulation = req.sampleText
    ? simulateLoad(chunks, req.sampleText, { chunkSizes: realSizes })
    : undefined;
  return { font, charsetSize, chunks: chunkResults, css, simulation };
}

function toCss(
  chunks: ChunkResult[],
  family: string,
  formats: OutputFormat[],
  baseName: string,
  opts: { asciiFirst: boolean; asciiAlwaysLoad: boolean } = {
    asciiFirst: true,
    asciiAlwaysLoad: false,
  },
): string {
  // 首屏片永载：ASCII/标点片省略 unicode-range，浏览器无条件下载（参考 demo 的 basic 片）
  const asciiIdx =
    opts.asciiFirst && opts.asciiAlwaysLoad
      ? chunks.findIndex(
          (c) => c.codepoints.length > 0 && c.codepoints.every(isAsciiOrPunct),
        )
      : -1;
  return chunks
    .map((c, i) => {
      const srcs = formats
        .map((f) => {
          const ext = f === 'ttf' ? 'ttf' : f;
          const fmt = f === 'ttf' ? 'truetype' : f;
          return `url('${baseName}-${c.index}.${ext}') format('${fmt}')`;
        })
        .join(', ');
      const rangeLine = i === asciiIdx ? '' : `  unicode-range: ${c.unicodeRange};\n`;
      return `@font-face {\n  font-family: '${family}';\n  src: ${srcs};\n  font-display: swap;\n${rangeLine}}`;
    })
    .join('\n\n');
}
