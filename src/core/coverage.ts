/**
 * 字体覆盖形态分析：上传字体后，仅凭其 cmap 码位集合即可判断它是
 * 「全量连续 CJK 字体」（如完整 Noto / 思源，CJK 基本区铺满且连续）
 * 还是「稀疏子集字体」（如先按某段文本子集化出的散点字形）。
 *
 * 判据只看 CJK 统一汉字区 4E00–9FFF（共 20992 个码位）：
 * - cjkRatio   = 落在该区的码位数 / 20992        （覆盖比例）
 * - cjkDensity = 落在该区的码位数 / 覆盖跨度       （连续密度）
 * 全量连续需 ratio≥0.9 且 density≥0.85；稀疏为 density<0.5。
 *
 * 这个判定驱动前端提示：全量连续才适合「常用字优先」2 片短 range 方案，
 * 稀疏子集无论如何都压不出短 range（PRD §6.4 硬限制）。
 */

export const CJK_LO = 0x4e00;
export const CJK_HI = 0x9fff;
export const CJK_BLOCK_SIZE = CJK_HI - CJK_LO + 1; // 20992

export interface CoverageSummary {
  /** 字体支持的码位总数 */
  totalCovered: number;
  /** 落在 CJK 基本区 4E00–9FFF 的码位数 */
  cjkCount: number;
  /** 基本区覆盖比例：cjkCount / 20992 */
  cjkRatio: number;
  /** 覆盖跨度（区内最小~最大码位+1），无 CJK 时为 0 */
  cjkSpan: number;
  /** 连续密度：cjkCount / cjkSpan，越接近 1 越连续 */
  cjkDensity: number;
  /** 是否为完整连续 CJK 字体（ratio≥0.9 且 density≥0.85） */
  isFullContiguous: boolean;
  /** 是否为稀疏散点子集（有 CJK 但 density<0.5） */
  isSparse: boolean;
}

/** 全量连续的判定阈值 */
export const FULL_RATIO_MIN = 0.9;
export const FULL_DENSITY_MIN = 0.85;
/** 稀疏的判定阈值（与全量互斥） */
export const SPARSE_DENSITY_MAX = 0.5;

export function analyzeCoverage(codepoints: number[]): CoverageSummary {
  const totalCovered = codepoints.length;
  let cjkCount = 0;
  let minCjk = Infinity;
  let maxCjk = -Infinity;
  for (const cp of codepoints) {
    if (cp >= CJK_LO && cp <= CJK_HI) {
      cjkCount++;
      if (cp < minCjk) minCjk = cp;
      if (cp > maxCjk) maxCjk = cp;
    }
  }

  const cjkRatio = cjkCount / CJK_BLOCK_SIZE;
  const cjkSpan = cjkCount > 0 ? maxCjk - minCjk + 1 : 0;
  const cjkDensity = cjkSpan > 0 ? cjkCount / cjkSpan : 0;

  const isFullContiguous = cjkCount > 0 && cjkRatio >= FULL_RATIO_MIN && cjkDensity >= FULL_DENSITY_MIN;
  const isSparse = cjkCount > 0 && cjkDensity < SPARSE_DENSITY_MAX;

  return {
    totalCovered,
    cjkCount,
    cjkRatio,
    cjkSpan,
    cjkDensity,
    isFullContiguous,
    isSparse,
  };
}
