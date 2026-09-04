import { describe, expect, it } from 'vitest';
import { analyzeCoverage, CJK_LO, CJK_HI } from './coverage';

/** 生成 [lo, hi] 闭区间的所有码位 */
function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let cp = lo; cp <= hi; cp++) out.push(cp);
  return out;
}

describe('analyzeCoverage', () => {
  it('完整连续 CJK 字体判定为全量连续', () => {
    const c = analyzeCoverage(range(CJK_LO, CJK_HI));
    expect(c.cjkCount).toBe(CJK_HI - CJK_LO + 1);
    expect(c.cjkDensity).toBeGreaterThanOrEqual(0.85);
    expect(c.isFullContiguous).toBe(true);
    expect(c.isSparse).toBe(false);
  });

  it('7900 散点字形判定为稀疏子集', () => {
    // 在 4E00–9FFF 内均匀散点 7900 个（密度约 0.376，模拟文本子集字体）
    const N = 7900;
    const cps: number[] = [];
    for (let i = 0; i < N; i++) cps.push(CJK_LO + Math.round((i * (CJK_HI - CJK_LO)) / (N - 1)));
    const c = analyzeCoverage(cps);
    expect(c.cjkCount).toBe(N);
    expect(c.cjkDensity).toBeLessThan(0.5);
    expect(c.isSparse).toBe(true);
    expect(c.isFullContiguous).toBe(false);
  });

  it('小块连续（3000 字）既非全量也非稀疏', () => {
    const c = analyzeCoverage(range(CJK_LO, CJK_LO + 2999));
    expect(c.cjkDensity).toBeGreaterThanOrEqual(0.85);
    expect(c.isFullContiguous).toBe(false);
    expect(c.isSparse).toBe(false);
  });

  it('空集合不产生任何判定', () => {
    const c = analyzeCoverage([]);
    expect(c.isFullContiguous).toBe(false);
    expect(c.isSparse).toBe(false);
    expect(c.totalCovered).toBe(0);
  });
});
