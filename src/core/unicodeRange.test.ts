import { describe, expect, it } from 'vitest';
import { toUnicodeRange } from './unicodeRange';

describe('toUnicodeRange', () => {
  it('合并连续码位为区间', () => {
    expect(toUnicodeRange([0x4e00, 0x4e01, 0x4e02])).toBe('U+4E00-4E02');
  });

  it('孤立码位保留为单值', () => {
    expect(toUnicodeRange([0x4e00, 0x4e05])).toBe('U+4E00, U+4E05');
  });

  it('区间与单值混合输出', () => {
    expect(toUnicodeRange([0x4e00, 0x4e01, 0x4e05, 0x4e10, 0x4e11])).toBe(
      'U+4E00-4E01, U+4E05, U+4E10-4E11',
    );
  });

  it('输入无序时也正确（内部排序去重）', () => {
    expect(toUnicodeRange([0x4e05, 0x4e00])).toBe('U+4E00, U+4E05');
    expect(toUnicodeRange([0x4e00, 0x4e00])).toBe('U+4E00');
  });

  it('处理超出 BMP 的码位', () => {
    expect(toUnicodeRange([0x20000, 0x20001])).toBe('U+20000-20001');
  });

  it('码位补零到至少 4 位', () => {
    expect(toUnicodeRange([0x41])).toBe('U+0041');
  });

  it('空输入返回空串', () => {
    expect(toUnicodeRange([])).toBe('');
  });

  it('不使用通配符，避免声明字体中不存在的码位', () => {
    // U+4E00-4EFF 是完整 256 块，但仍输出区间而非 U+4E??
    const range = toUnicodeRange(
      Array.from({ length: 256 }, (_, i) => 0x4e00 + i),
    );
    expect(range).toBe('U+4E00-4EFF');
    expect(range).not.toContain('?');
  });
});
