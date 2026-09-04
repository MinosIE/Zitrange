import { describe, expect, it } from 'vitest';
import { validate } from './validate';
import type { FontInfo, PartitionStrategy } from './types';

const strategy: PartitionStrategy = { baseSize: 4000, fallback: 'common' };

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
    expect(validate({ charCount: 5000, strategy, format: ['woff2'], font })).toEqual([]);
  });

  it('空字符集报 E_EMPTY', () => {
    const issues = validate({ charCount: 0, strategy, format: ['woff2'] });
    expect(issues.some((i) => i.id === 'E_EMPTY')).toBe(true);
  });

  it('未选格式报 E_FMT', () => {
    const issues = validate({ charCount: 100, strategy, format: [] });
    expect(issues.some((i) => i.id === 'E_FMT')).toBe(true);
  });

  it('仅 TTF 报 W_TTF', () => {
    const issues = validate({ charCount: 100, strategy, format: ['ttf'] });
    expect(issues.some((i) => i.id === 'W_TTF')).toBe(true);
  });

  it('字符集超字体字形报 W_MISS', () => {
    const issues = validate({ charCount: 9000, strategy, format: ['woff2'], font });
    expect(issues.some((i) => i.id === 'W_MISS')).toBe(true);
  });

  it('字符数 ≤ 每片字数报 W_ONE_SLICE', () => {
    const issues = validate({ charCount: 7900, strategy: { ...strategy, baseSize: 8000 }, format: ['woff2'] });
    expect(issues.some((i) => i.id === 'W_ONE_SLICE')).toBe(true);
  });

  it('字符数 > 每片字数不报 W_ONE_SLICE', () => {
    const issues = validate({ charCount: 7900, strategy, format: ['woff2'] });
    expect(issues.some((i) => i.id === 'W_ONE_SLICE')).toBe(false);
  });

  it('完整连续 CJK 字体报 I_FULL_CJK', () => {
    const codepoints: number[] = [];
    for (let cp = 0x4e00; cp <= 0x9fff; cp++) codepoints.push(cp);
    const issues = validate({ charCount: codepoints.length, strategy, format: ['woff2'], codepoints });
    expect(issues.some((i) => i.id === 'I_FULL_CJK')).toBe(true);
    expect(issues.some((i) => i.id === 'W_SPARSE')).toBe(false);
  });

  it('稀疏子集字体报 W_SPARSE', () => {
    const N = 7900;
    const codepoints: number[] = [];
    for (let i = 0; i < N; i++) codepoints.push(0x4e00 + Math.round((i * (0x9fff - 0x4e00)) / (N - 1)));
    const issues = validate({ charCount: codepoints.length, strategy, format: ['woff2'], codepoints });
    expect(issues.some((i) => i.id === 'W_SPARSE')).toBe(true);
    expect(issues.some((i) => i.id === 'I_FULL_CJK')).toBe(false);
  });

  it('常用字优先时即使字符数≤每片字数也不报 W_ONE_SLICE', () => {
    const issues = validate({
      charCount: 7900,
      strategy: { ...strategy, baseSize: 8000, commonFirst: true },
      format: ['woff2'],
    });
    expect(issues.some((i) => i.id === 'W_ONE_SLICE')).toBe(false);
  });

  it('所有提示都有 info/warn 级别（绝不阻断）', () => {
    const issues = validate({ charCount: 9000, strategy, format: ['ttf'] });
    for (const i of issues) {
      expect(['info', 'warn']).toContain(i.level);
    }
  });
});
