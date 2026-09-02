import { describe, expect, it } from 'vitest';
import { COVERAGE_TABLE, coverageFor } from './coverage';

describe('coverageFor', () => {
  it('0 字覆盖率为 0', () => {
    expect(coverageFor(0)).toBe(0);
  });

  it('超出表范围取 100', () => {
    expect(coverageFor(10000)).toBe(100);
    expect(coverageFor(6763)).toBe(100);
  });

  it('表内已知点精确命中', () => {
    expect(coverageFor(500)).toBeCloseTo(78.53202, 4);
    expect(coverageFor(3500)).toBeCloseTo(99.82015, 4);
  });

  it('两点之间线性插值', () => {
    // 500→78.53, 1000→91.92，中点应为约 85.22
    expect(coverageFor(750)).toBeGreaterThan(78.53202);
    expect(coverageFor(750)).toBeLessThan(91.91527);
    expect(coverageFor(750)).toBeCloseTo((78.53202 + 91.91527) / 2, 2);
  });

  it('覆盖率单调递增', () => {
    let prev = -1;
    for (const p of COVERAGE_TABLE) {
      expect(p.coverage).toBeGreaterThanOrEqual(prev);
      prev = p.coverage;
    }
  });
});
