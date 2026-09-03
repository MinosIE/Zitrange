import type { OutputFormat, PartitionStrategy } from '@core/types';

const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `${path} 失败 (${r.status})`);
  }
  return r.json() as Promise<T>;
}

export interface InspectResult {
  id: string;
  fileName: string;
  bytes: number;
  family: string;
  subfamily: string;
  weight: number;
  style: 'normal' | 'italic';
  numGlyphs: number;
  outline: 'glyf' | 'cff';
  isVariable: boolean;
  fontNumber: number;
  codepoints: number[];
}

export interface ChunkResult {
  index: number;
  codepoints: number[];
  unicodeRange: string;
  files: Partial<Record<OutputFormat, { url: string; bytes: number }>>;
}

export interface ProcessResult {
  jobId: string;
  font: Omit<InspectResult, 'codepoints' | 'id'>;
  charsetSize: number;
  chunks: ChunkResult[];
  css: string;
  simulation?: { hitIndices: number[]; totalBytes: number; hitRate: number; coverage: number };
  recommendation: {
    strategy: PartitionStrategy;
    format: OutputFormat[];
    reasons: { id: string; level: 'info' | 'warn'; text: string; evidence: string }[];
    estimate: { chunkCount: number; totalSize: number; typicalPageLoad: number };
  };
  issues: { id: string; level: 'info' | 'warn'; text: string }[];
}

export function inspectFont(path: string, fontNumber = 0): Promise<InspectResult> {
  return post<InspectResult>('/inspect', { path, fontNumber });
}

export function processFont(payload: {
  path: string;
  fontNumber?: number;
  text?: string;
  files?: string[];
  format: OutputFormat[];
  strategy: PartitionStrategy;
  sampleText?: string;
}): Promise<ProcessResult> {
  return post<ProcessResult>('/process', payload);
}

export interface UploadResult {
  path: string;
  fileName: string;
  bytes: number;
}

/** 上传字体文件：请求体直接是 File 二进制，服务端流式落盘，不占前端内存 */
export async function uploadFont(file: File): Promise<UploadResult> {
  const r = await fetch(`${BASE}/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `上传失败 (${r.status})`);
  }
  return r.json() as Promise<UploadResult>;
}

/** 源字体的可读 URL（字形预览用），path 为工作区相对路径 */
export function rawFontUrl(path: string): string {
  return `${BASE}/raw?path=${encodeURIComponent(path)}`;
}
