import { describe, expect, it } from 'vitest';
import { validate } from './validate';
import type { FontInfo, PartitionStrategy } from './types';

const strategy: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 200,
  growth: 1.35,
  maxSize: 800,
  fallback: 'common-3500',
};

const font: FontInfo = {
  id: 'x',
  fileName: 'f.ttf',
  bytes: 2_000_000,
  family: 'F',
  subfamily: 'R',
  weight: 400,
  style: 'normal',
  numGlyphs: 8104,
  outline: 'glyf',
  isVariable: false,
  fontNumber: 0,
};

describe('validate', () => {
  it('合法输入不产生任何提示', () => {
    expect(
      validate({ charCount: 5000, strategy, format: ['woff2'], font }),
    ).toEqual([]);
  });

  it('空字符集报 E_EMPTY', () => {
    const issues = validate({ charCount: 0, strategy, format: ['woff2'] });
    expect(issues.some((i) => i.id === 'E_EMPTY')).toBe(true);
  });

  it('maxSize < baseSize 报 E_MAX', () => {
    const issues = validate({
      charCount: 100,
      strategy: { ...strategy, baseSize: 500, maxSize: 100 },
      format: ['woff2'],
    });
    expect(issues.some((i) => i.id === 'E_MAX')).toBe(true);
  });

  it('growth < 1 报 E_GROWTH', () => {
    const issues = validate({
      charCount: 100,
      strategy: { ...strategy, growth: 0.5 },
      format: ['woff2'],
    });
    expect(issues.some((i) => i.id === 'E_GROWTH')).toBe(true);
  });

  it('未选格式报 E_FMT', () => {
    const issues = validate({ charCount: 100, strategy, format: [] });
    expect(issues.some((i) => i.id === 'E_FMT')).toBe(true);
  });

  it('仅 TTF 报 W_TTF', () => {
    const issues = validate({ charCount: 100, strategy, format: ['ttf'] });
    expect(issues.some((i) => i.id === 'W_TTF')).toBe(true);
  });

  it('字频模式 + 不兜底 报 W_FREQ_NO_FB', () => {
    const issues = validate({
      charCount: 100,
      strategy: { ...strategy, mode: 'frequency', fallback: 'none' },
      format: ['woff2'],
    });
    expect(issues.some((i) => i.id === 'W_FREQ_NO_FB')).toBe(true);
  });

  it('maxSize 过大报 W_BIGCHUNK', () => {
    const issues = validate({
      charCount: 100,
      strategy: { ...strategy, maxSize: 9000 },
      format: ['woff2'],
    });
    expect(issues.some((i) => i.id === 'W_BIGCHUNK')).toBe(true);
  });

  it('字符集超字体字形报 W_MISS', () => {
    const issues = validate({
      charCount: 9000,
      strategy,
      format: ['woff2'],
      font,
    });
    expect(issues.some((i) => i.id === 'W_MISS')).toBe(true);
  });

  it('所有提示都有 info/warn 级别（绝不阻断）', () => {
    const issues = validate({ charCount: 9000, strategy: { ...strategy, maxSize: 9000 }, format: ['ttf'] });
    for (const i of issues) {
      expect(['info', 'warn']).toContain(i.level);
    }
  });
});
