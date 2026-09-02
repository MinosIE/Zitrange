/**
 * 字频覆盖率对照表。
 * 来源：清华大学汉字频度表（6763 字样本、8640 万语料），公开统计资料。
 * 含义：取「现代汉语最常用前 N 字」可覆盖书面语的比例，
 * 用于智能建议（R7）与 UI 展示「取前 N 字即可覆盖 X%」。
 */
export interface CoveragePoint {
  count: number;
  /** 覆盖率，0–100 */
  coverage: number;
}

export const COVERAGE_TABLE: CoveragePoint[] = [
  { count: 500, coverage: 78.53202 },
  { count: 1000, coverage: 91.91527 },
  { count: 1500, coverage: 96.47563 },
  { count: 2000, coverage: 98.38765 },
  { count: 2500, coverage: 99.24388 },
  { count: 3000, coverage: 99.63322 },
  { count: 3500, coverage: 99.82015 },
  { count: 4000, coverage: 99.91645 },
  { count: 4500, coverage: 99.96471 },
  { count: 5000, coverage: 99.98633 },
  { count: 5500, coverage: 99.99553 },
  { count: 6000, coverage: 99.99901 },
  { count: 6763, coverage: 100 },
];

/**
 * 取前 n 个最常用汉字的覆盖率（相邻点线性插值），n 超出表范围时取两端。
 */
export function coverageFor(count: number): number {
  if (count <= 0) return 0;
  const last = COVERAGE_TABLE[COVERAGE_TABLE.length - 1];
  if (count >= last.count) return 100;
  for (let i = 1; i < COVERAGE_TABLE.length; i++) {
    const hi = COVERAGE_TABLE[i];
    const lo = COVERAGE_TABLE[i - 1];
    if (count <= hi.count) {
      const t = (count - lo.count) / (hi.count - lo.count);
      return lo.coverage + t * (hi.coverage - lo.coverage);
    }
  }
  return 100;
}
