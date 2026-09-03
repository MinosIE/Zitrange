import { describe, it, expect } from 'vitest';
import { partition, partitionByCodepoint, isAsciiOrPunct } from './partition';
import { toUnicodeRange } from './unicodeRange';
import type { PartitionStrategy } from './types';

const codepoint: PartitionStrategy = {
  mode: 'codepoint',
  baseSize: 200,
  growth: 1,
  maxSize: 800,
  fallback: 'none',
};

describe('partitionByCodepoint', () => {
  it('连续段按定长装片，段内仍折叠为少量区间', () => {
    const cps = [0x4e00, 0x4e01, 0x4e02, 0x4e10, 0x4e11];
    const chunks = partitionByCodepoint(cps, codepoint, { asciiFirst: false });
    // 5 字远小于单片字数，装进同一片；两段各自折叠为单区间
    expect(chunks.length).toBe(1);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-4E02, U+4E10-4E11');
  });

  it('零散子集片数由 baseSize 直接控制，而非一字一片', () => {
    const cps = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i * 2); // 全部孤立
    const chunks = partitionByCodepoint(cps, codepoint, { asciiFirst: false });
    // 1000 孤立字 / 单片 200 = 5 片，而非 1000 片
    expect(chunks.length).toBe(5);
  });

  it('连续大块切成定长片，每片仍是单区间（对比频率模式每行更短）', () => {
    const cps = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i); // 连续块
    const chunks = partitionByCodepoint(cps, codepoint, { asciiFirst: false });
    expect(chunks.length).toBe(5);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-4EC7');
  });

  it('全量 cmap 连续块可折叠成极短 range（如 U+4E00-9FFF 单区间）', () => {
    const cps = Array.from({ length: 0x9fff - 0x4e00 + 1 }, (_, i) => 0x4e00 + i);
    const chunks = partitionByCodepoint(cps, { ...codepoint, baseSize: 800 }, { asciiFirst: false });
    // 21000 连续字 / 800 ≈ 27 片，每片一个区间
    expect(chunks.length).toBe(27);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-511F');
  });

  it('片数超过 maxChunks 时合并相邻段以控制 @font-face 数量', () => {
    const cps = Array.from({ length: 5000 }, (_, i) => 0x4e00 + i * 2); // 全部孤立
    const chunks = partitionByCodepoint(cps, { ...codepoint, maxChunks: 10 }, {
      asciiFirst: false,
    });
    expect(chunks.length).toBeLessThanOrEqual(10);
  });

  it('ASCII/标点片置前且自身为短区间', () => {
    const cps = [0x41, 0x42, 0x4e00, 0x4e01, 0x4e02];
    const chunks = partitionByCodepoint(cps, { ...codepoint });
    expect(isAsciiOrPunct(chunks[0].codepoints[0])).toBe(true);
    expect(toUnicodeRange(chunks[0].codepoints)).toContain('U+0041-0042');
  });

  it('经 partition() 派发时同样生效', () => {
    const cps = [0x4e00, 0x4e01, 0x4e02];
    const chunks = partition(cps, codepoint, { asciiFirst: false });
    expect(chunks.length).toBe(1);
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-4E02');
  });
});
