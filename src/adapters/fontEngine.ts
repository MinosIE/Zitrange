import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runPython } from './python';
import type { FontInfo, OutputFormat } from '../core/types';

export interface InspectResult extends FontInfo {
  /** 字体实际支持的码位（升序），可作为兜底字表来源 */
  codepoints: number[];
}

/** 检视字体：元信息 + 支持的码位集合 */
export async function inspectFont(path: string, fontNumber = 0): Promise<InspectResult> {
  const raw = await runPython('font_inspect.py', { path, fontNumber });
  const bytes = statSync(path).size;
  return {
    id: randomUUID(),
    fileName: basename(path),
    bytes,
    family: raw.family || raw.subfamily || basename(path),
    subfamily: raw.subfamily || '',
    weight: raw.weight ?? 400,
    style: raw.style ?? 'normal',
    numGlyphs: raw.numGlyphs,
    outline: raw.outline,
    isVariable: raw.isVariable,
    fontNumber,
    codepoints: raw.codepoints,
  };
}

export interface SubsetChunkFile {
  path: string;
  bytes: number;
}

export interface SubsetResult {
  chunks: Array<{
    index: number;
    unicodes: number;
    files: Partial<Record<OutputFormat, SubsetChunkFile>>;
  }>;
}

/** 分片子集化：把字体按多组码位切成多个 woff2/woff/ttf 文件 */
export function subsetChunks(opts: {
  path: string;
  fontNumber?: number;
  chunks: number[][];
  formats: OutputFormat[];
  outDir: string;
  baseName: string;
}): Promise<SubsetResult> {
  return runPython('subset.py', {
    path: opts.path,
    fontNumber: opts.fontNumber ?? 0,
    chunks: opts.chunks,
    formats: opts.formats,
    outDir: opts.outDir,
    baseName: opts.baseName,
  });
}
