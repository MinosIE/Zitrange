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
} from '../core/charset';
import { partition } from '../core/partition';
import { toUnicodeRange } from '../core/unicodeRange';
import { estimateChunkSize, simulateLoad, type SimulateResult } from '../core/simulate';
import { recommend } from '../core/recommend';
import { validate } from '../core/validate';
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
  recommendation: Recommendation;
  issues: ValidationIssue[];
}

/** 完整处理管线：检视 → 取字 → 分片 → 生成 unicode-range → 子集化 → 组装 */
export async function processFont(req: ProcessRequest): Promise<ProcessResult> {
  const font = await inspectFont(req.fontPath, req.fontNumber ?? 0);

  // 1. 字符集
  const freqs: CharFreq[] = [];
  if (req.text) freqs.push(extractCharFreq(req.text));
  if (req.files) {
    for (const fp of req.files) freqs.push(extractCharFreq(readFileSync(fp, 'utf-8')));
  }
  const freq = mergeCharFreq(...freqs);

  // 2. 兜底字表（取自字体支持的码位，按码位升序）
  const fbSize = FALLBACK_SIZES[req.strategy.fallback] ?? 0;
  if (fbSize > 0) applyFallback(freq, font.codepoints, fbSize);

  const ordered = sortByFrequency(freq);
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
  const recommendation = recommend({ font, charCount: charsetSize });
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
