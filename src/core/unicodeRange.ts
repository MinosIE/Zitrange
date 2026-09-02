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
 * 仅使用「单值 + 区间」两种形式，不使用通配符（U+4E??）。
 * 通配符会声明字体中可能不存在的码位，浏览器下载后找不到字形会回退到下一个 font，
 * 导致同段落内字体不一致——这是正确性问题，不是性能问题。
 *
 * @param codepoints 无需预先排序，函数内部会排序去重
 */
export function toUnicodeRange(codepoints: readonly number[]): string {
  if (codepoints.length === 0) return '';

  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const parts: string[] = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const cp = sorted[i];
    if (cp === prev + 1) {
      prev = cp;
      continue;
    }
    parts.push(formatRange(start, prev));
    start = cp;
    prev = cp;
  }

  return parts.join(', ');
}
