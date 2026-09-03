/** 每片 woff2 的固定表结构开销（cmap/hmtx/head/hhea/maxp/name/OS2/post），用于体积估算 */
export const PER_CHUNK_OVERHEAD_BYTES = 3 * 1024;

function hex(cp: number): string {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

function formatRange(lo: number, hi: number): string {
  const l = hex(lo);
  return lo === hi ? `U+${l}` : `U+${l}-${hex(hi)}`;
}

/** 256 码位对齐块大小 */
const BLOCK_SIZE = 256;

/** 返回码位所在的 256 块索引 */
function blockOf(cp: number): number {
  return Math.floor(cp / BLOCK_SIZE);
}

export interface ToUnicodeRangeOptions {
  /**
   * 需要按整块声明（U+XX00-XXFF）的 256 块索引集合。
   * 由调用方基于全局字符集判定：仅当某块的已含字符占比 ≥ 阈值、
   * 且该块的所有已含字符都落在同一片内（避免片间 range 重叠、导致字形被后声明者覆盖），
   * 才会被列入。传空或不传则退化为严格「单值 + 区间」，绝不声明不存在的码位。
   */
  wildcardBlocks?: ReadonlySet<number>;
}

/**
 * 生成 unicode-range（PRD §6.4）。
 *
 * 默认（不传 wildcardBlocks）仅使用「单值 + 区间」两种形式，不使用通配符（U+4E??）。
 * 通配符会声明字体中可能不存在的码位，浏览器下载后找不到字形会回退到下一个 font，
 * 导致同段落内字体不一致——这是正确性问题，不是性能问题。
 *
 * 紧凑模式（传 wildcardBlocks）下，对每个被列入的 256 块整体声明为 U+XX00-XXFF，
 * 以缩短单行 range；代价见上。该模式由 UI「紧凑模式」开关显式启用，默认关闭。
 *
 * @param codepoints 无需预先排序，函数内部会排序去重
 */
export function toUnicodeRange(
  codepoints: readonly number[],
  options: ToUnicodeRangeOptions = {},
): string {
  if (codepoints.length === 0) return '';

  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const wildcard = options.wildcardBlocks;

  const intervals: Array<[number, number]> = [];

  if (wildcard && wildcard.size > 0) {
    // 通配块整体声明
    for (const b of [...wildcard].sort((a, b) => a - b)) {
      intervals.push([b * BLOCK_SIZE, b * BLOCK_SIZE + BLOCK_SIZE - 1]);
    }
    // 非通配块内的字符按实际区间输出（排除已并入整块的字符，避免重复声明）
    const normal = sorted.filter((cp) => !wildcard.has(blockOf(cp)));
    pushRuns(intervals, normal);
  } else {
    pushRuns(intervals, sorted);
  }

  intervals.sort((a, b) => a[0] - b[0]);
  return intervals.map(([lo, hi]) => formatRange(lo, hi)).join(', ');
}

/** 把已排序的码位合并为连续区间，追加到 intervals */
function pushRuns(intervals: Array<[number, number]>, sorted: number[]): void {
  if (sorted.length === 0) return;
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cp = sorted[i];
    if (cp === prev + 1) {
      prev = cp;
      continue;
    }
    intervals.push([start, prev]);
    start = cp;
    prev = cp;
  }
  intervals.push([start, prev]);
}
