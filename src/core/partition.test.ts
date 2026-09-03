import { describe, it, expect } from 'vitest';
import { partition, partitionByCodepoint, partitionByBlock, isAsciiOrPunct } from './partition';
import { toUnicodeRange } from './unicodeRange';
import type { PartitionStrategy } from './types';

const codepoint: PartitionStrategy = {
  mode: 'codepoint',
  baseSize: 200,
  growth: 1,
  maxSize: 800,
  fallback: 'none',
};

const hybrid: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 500,
  growth: 1.35,
  maxSize: 1000,
  fallback: 'none',
};

const block: PartitionStrategy = {
  mode: 'block',
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

  it('targetSlices 在未设 maxChunks 时作为片数上限（界面「按目标片数」档）', () => {
    const cps = Array.from({ length: 5000 }, (_, i) => 0x4e00 + i * 2); // 全部孤立
    const chunks = partitionByCodepoint(cps, { ...codepoint, targetSlices: 8 }, {
      asciiFirst: false,
    });
    // 码位模式不参与 partition() 里的 targetSlices 推导，此处自行消费为片数上限
    expect(chunks.length).toBeLessThanOrEqual(8);
  });

  it('显式 maxChunks 优先于 targetSlices（历史配置向后兼容）', () => {
    const cps = Array.from({ length: 5000 }, (_, i) => 0x4e00 + i * 2);
    const chunks = partitionByCodepoint(
      cps,
      { ...codepoint, targetSlices: 8, maxChunks: 20 },
      { asciiFirst: false },
    );
    expect(chunks.length).toBe(20);
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

describe('partitionByBlock（均匀码块模式）', () => {
  it('把覆盖区间等分为目标块数，每块单区间、无重叠', () => {
    const cps = Array.from({ length: 20000 }, (_, i) => 0x4e00 + i); // 连续 2 万
    const chunks = partitionByBlock(cps, { ...block, targetSlices: 20 }, { asciiFirst: false });
    expect(chunks.length).toBe(20);
    // 每块 1000 个连续字 → 单区间
    for (const c of chunks) {
      expect(c.codepoints.length).toBe(1000);
      expect(toUnicodeRange(c.codepoints)).not.toContain(',');
    }
    // 首块从 4E00 起，1000 连续字 → U+4E00-51E7
    expect(toUnicodeRange(chunks[0].codepoints)).toBe('U+4E00-51E7');
  });

  it('不传 targetSlices 时按字形总数给合理默认块数', () => {
    const cps = Array.from({ length: 20000 }, (_, i) => 0x4e00 + i);
    const chunks = partitionByBlock(cps, { ...block }, { asciiFirst: false });
    expect(chunks.length).toBeGreaterThanOrEqual(6);
    expect(chunks.length).toBeLessThanOrEqual(48);
  });

  it('经 partition() 派发时同样生效，且 ASCII 片置前', () => {
    const cps = [0x41, 0x42, ...Array.from({ length: 2000 }, (_, i) => 0x4e00 + i)];
    const chunks = partition(cps, { ...block, targetSlices: 10 });
    // ASCII 头片 + 10 个码块
    expect(chunks.length).toBe(11);
    expect(isAsciiOrPunct(chunks[0].codepoints[0])).toBe(true);
  });
});

describe('动态片数（targetSlices）', () => {
  it('按字形总数推导固定每片字数，覆盖 baseSize，避免几十片', () => {
    const cps = Array.from({ length: 20000 }, (_, i) => 0x4e00 + i);
    // baseSize=500 原本会切 40 片，targetSlices=20 应收敛到 20
    const chunks = partition(cps, { ...hybrid, targetSlices: 20 }, { asciiFirst: false });
    expect(chunks.length).toBe(20);
    // 每片约 1000 字（固定分片，递增系数被忽略）
    expect(chunks[0].codepoints.length).toBe(1000);
  });

  it('大字符集不被 maxSize 上限限死，仍按目标片数收敛', () => {
    const cps = Array.from({ length: 30000 }, (_, i) => 0x4e00 + i);
    // 默认 maxSize=1000：若派生值被 clamp，会变成 30 片而非目标的 20
    const chunks = partition(cps, { ...hybrid, targetSlices: 20 }, { asciiFirst: false });
    expect(chunks.length).toBe(20);
    expect(chunks[0].codepoints.length).toBe(1500);
  });

  it('targetSlices 为 0/未设时回退到 baseSize/growth 原行为', () => {
    const cps = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i);
    const chunks = partition(cps, { ...hybrid }, { asciiFirst: false });
    // 500 / 1.35^k：约 3 片，而非 20
    expect(chunks.length).toBeLessThan(10);
  });
});
