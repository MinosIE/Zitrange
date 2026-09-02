import { isTargetCodepoint } from './charset';
import type { Chunk } from './types';
import { PER_CHUNK_OVERHEAD_BYTES } from './unicodeRange';

export interface SimulateResult {
  /** 会被下载的片下标 */
  hitIndices: number[];
  /** 模拟传输字节数 */
  totalBytes: number;
  /** 命中片数 / 总片数 */
  hitRate: number;
  /** 样本文本中被分片覆盖的码位比例（缺字会拉低它） */
  coverage: number;
}

/**
 * woff2 输出体积相对「源字体平均每字形字节数」的经验比例。
 * 实测区间 0.42–0.53（见 docs/benchmark.md），取中位。
 */
export const WOFF2_SIZE_RATIO = 0.47;

/**
 * 估算单片 woff2 体积。
 *
 * @param avgSourceBytesPerGlyph 源字体的平均每字形字节数（bytes / numGlyphs，来自 inspect）。
 *   该值在不同字体间差异极大约 13 倍：1.3MB 的简黑约 168，17MB 的书法体约 2198。
 *   因此调用方必须传入 inspect 得到的真实值，默认值仅供无元数据时的粗略兜底。
 */
export function estimateChunkSize(charCount: number, avgSourceBytesPerGlyph = 270): number {
  return (
    Math.round(charCount * avgSourceBytesPerGlyph * WOFF2_SIZE_RATIO) + PER_CHUNK_OVERHEAD_BYTES
  );
}

/**
 * 模拟浏览器的按需加载行为（PRD F4.3）。
 *
 * 浏览器只会下载 unicode-range 命中了页面字符的分片，
 * 因此「全部分片合计」是磁盘成本，「模拟传输量」才是首屏成本。
 *
 * @param chunkSizes 处理完成后可传入真实大小；缺省时用估算值
 */
export function simulateLoad(
  chunks: readonly Chunk[],
  sampleText: string,
  options: { avgSourceBytesPerGlyph?: number; chunkSizes?: readonly number[] } = {},
): SimulateResult {
  const { avgSourceBytesPerGlyph = 270, chunkSizes } = options;

  const textCps = new Set<number>();
  for (const ch of sampleText) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isTargetCodepoint(cp)) textCps.add(cp);
  }

  const covered = new Set<number>();
  const hitIndices: number[] = [];
  let totalBytes = 0;

  chunks.forEach((chunk, i) => {
    let hit = false;
    for (const cp of chunk.codepoints) {
      if (textCps.has(cp)) {
        hit = true;
        covered.add(cp);
      }
    }
    if (hit) {
      hitIndices.push(i);
      totalBytes +=
        chunkSizes?.[i] ?? estimateChunkSize(chunk.codepoints.length, avgSourceBytesPerGlyph);
    }
  });

  return {
    hitIndices,
    totalBytes,
    hitRate: chunks.length === 0 ? 0 : hitIndices.length / chunks.length,
    coverage: textCps.size === 0 ? 1 : covered.size / textCps.size,
  };
}
