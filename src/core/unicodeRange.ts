/** 每片 woff2 的固定表结构开销（cmap/hmtx/head/hhea/maxp/name/OS2/post），用于体积估算 */
export const PER_CHUNK_OVERHEAD_BYTES = 3 * 1024;

function hex(cp: number): string {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

function formatRange(lo: number, hi: number): string {
  const l = hex(lo);
  return lo === hi ? `U+${l}` : `U+${l}-${hex(hi)}`;
}

/**
 * 生成 unicode-range（PRD §6.4）。
 *
 * 仅使用「单值 + 区间」两种形式，绝不声明字体中可能不存在的码位。
 * 通配符（U+4E??、U+XX00-XXFF）会声明字体中没有的码位，浏览器下载后找不到字形
 * 会回退到下一个 font，导致同段落内字体不一致——这是正确性问题，故不提供。
 *
 * @param codepoints 无需预先排序，函数内部会排序去重
 */
export function toUnicodeRange(codepoints: readonly number[]): string {
  if (codepoints.length === 0) return '';

  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  pushRuns(intervals, sorted);

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
