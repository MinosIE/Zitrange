import { describe, it, expect } from 'vitest';
import { partition, isAsciiOrPunct } from './partition';
import { toUnicodeRange } from './unicodeRange';
import type { PartitionStrategy } from './types';

const strat = (over: Partial<PartitionStrategy> = {}): PartitionStrategy => ({
  baseSize: 200,
  fallback: 'none',
  ...over,
});

describe('partition（按码位均匀切片）', () => {
  it('连续段按定长装片，段内仍折叠为少量区间', () => {
    const cps = [0x4e00, 0x4e01, 0x4e02, 0x4e10, 0x4e11];
    const chunks = partition(cps, strat(), { asciiFirst: false });
    expect(chunks.length).toBe(1);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-4E02, U+4E10-4E11');
  });

  it('零散子集片数由 baseSize 直接控制，而非一字一片', () => {
    const cps = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i * 2); // 全部孤立
    const chunks = partition(cps, strat(), { asciiFirst: false });
    expect(chunks.length).toBe(5); // 1000 孤立字 / 单片 200 = 5 片
  });

  it('连续大块切成定长片，每片仍是单区间', () => {
    const cps = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i); // 连续块
    const chunks = partition(cps, strat(), { asciiFirst: false });
    expect(chunks.length).toBe(5);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-4EC7');
  });

  it('全量 cmap 连续块可折叠成极短 range（如 U+4E00-9FFF 单区间）', () => {
    const cps = Array.from({ length: 0x9fff - 0x4e00 + 1 }, (_, i) => 0x4e00 + i);
    const chunks = partition(cps, strat({ baseSize: 800 }), { asciiFirst: false });
    expect(chunks.length).toBe(27); // 20992 / 800 ≈ 27 片
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-511F');
  });

  it('片数超过 maxChunks 时合并相邻段以控制 @font-face 数量', () => {
    const cps = Array.from({ length: 5000 }, (_, i) => 0x4e00 + i * 2); // 全部孤立
    const chunks = partition(cps, strat({ maxChunks: 10 }), { asciiFirst: false });
    expect(chunks.length).toBeLessThanOrEqual(10);
  });

  it('ASCII/标点片置前且自身为短区间', () => {
    const cps = [0x41, 0x42, 0x4e00, 0x4e01, 0x4e02];
    const chunks = partition(cps, strat());
    expect(isAsciiOrPunct(chunks[0].codepoints[0])).toBe(true);
    expect(toUnicodeRange(chunks[0].codepoints)).toContain('U+0041-0042');
  });

  it('asciiFirst=false 时不单独成片，ASCII 并入正文', () => {
    const cps = [0x41, 0x42, 0x4e00, 0x4e01];
    const chunks = partition(cps, strat(), { asciiFirst: false });
    expect(chunks.length).toBe(1);
    expect(chunks[0].codepoints).toContain(0x41);
    expect(chunks[0].codepoints).toContain(0x4e00);
  });

  describe('常用字优先（commonFirst）', () => {
    it('常用 3500 字独立成首片且折叠为单条短区间 U+4E00-5BAB', () => {
      const common = Array.from({ length: 0x5bab - 0x4e00 + 1 }, (_, i) => 0x4e00 + i);
      const ext = [0x5bac, 0x5bad, 0x9fff];
      const chunks = partition([...common, ...ext], strat({ baseSize: 8000, commonFirst: true }), {
        asciiFirst: false,
      });
      expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-5BAB');
    });

    it('常用片排在剩余片之前', () => {
      const cps = [0x4e00, 0x4e01, 0x9fff, 0x9ffe]; // 2 常用 + 2 剩余
      const chunks = partition(cps, strat({ baseSize: 1, commonFirst: true }), { asciiFirst: false });
      expect(chunks.length).toBe(4); // baseSize 1 → 每字一片
      // 前两个片必为常用字，剩余字落在更后面的片
      expect(chunks[0].codepoints).toContain(0x4e00);
      expect(chunks[1].codepoints).toContain(0x4e01);
      const tail = chunks.slice(2).flatMap((c) => c.codepoints);
      expect(tail).toContain(0x9fff);
      expect(tail).toContain(0x9ffe);
    });

    it('与 ASCII 首屏片配合：ASCII 在前、常用次之', () => {
      const cps = [0x41, 0x4e00, 0x4e01, 0x9fff];
      const chunks = partition(cps, strat({ baseSize: 1, commonFirst: true }));
      expect(isAsciiOrPunct(chunks[0].codepoints[0])).toBe(true);
      expect(chunks[1].codepoints).toContain(0x4e00);
    });
  });
});
