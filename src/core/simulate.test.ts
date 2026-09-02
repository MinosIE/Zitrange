import { describe, expect, it } from 'vitest';
import { estimateChunkSize, simulateLoad } from './simulate';
import type { Chunk } from './types';

/**
 * 由码位构造字符串。
 * 手写汉字极易引入编码歧义（如「丄」实际是 U+4E04 而非 U+4E03），
 * 所有测试文本一律用码位构造。
 */
const cp = (...cps: number[]) => String.fromCodePoint(...cps);

/** 三片，码位连续：片0 = U+0041,0042；片1 = U+4E00,4E01；片2 = U+4E02,4E03 */
const chunks: Chunk[] = [
  { index: 0, codepoints: [0x41, 0x42] },
  { index: 1, codepoints: [0x4e00, 0x4e01] },
  { index: 2, codepoints: [0x4e02, 0x4e03] },
];

describe('estimateChunkSize', () => {
  it('体积随字数增长，并含固定开销', () => {
    const a = estimateChunkSize(100);
    const b = estimateChunkSize(200);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('零字片仍有固定开销', () => {
    expect(estimateChunkSize(0)).toBeGreaterThan(0);
  });
});

describe('simulateLoad', () => {
  it('只统计命中了样本文本字符的分片', () => {
    const r = simulateLoad(chunks, cp(0x41, 0x4e00), { chunkSizes: [100, 200, 300] });
    expect(r.hitIndices).toEqual([0, 1]);
    expect(r.totalBytes).toBe(300);
  });

  it('未命中的片不计入传输量', () => {
    const r = simulateLoad(chunks, cp(0x41), { chunkSizes: [100, 200, 300] });
    expect(r.hitIndices).toEqual([0]);
    expect(r.totalBytes).toBe(100);
  });

  it('缺字会拉低覆盖率', () => {
    // Z 属于 ASCII 范围，会被计入需求，但不在任何片中
    const r = simulateLoad(chunks, cp(0x4e00, 0x5a), { chunkSizes: [100, 200, 300] });
    expect(r.coverage).toBeCloseTo(0.5);
  });

  it('全部命中时覆盖率为 1', () => {
    const r = simulateLoad(chunks, cp(0x41, 0x42, 0x4e00, 0x4e01, 0x4e02, 0x4e03), {
      chunkSizes: [100, 200, 300],
    });
    expect(r.coverage).toBe(1);
    expect(r.hitRate).toBe(1);
    expect(r.totalBytes).toBe(600);
  });

  it('缺少真实大小时回退到估算', () => {
    const r = simulateLoad(chunks, cp(0x4e00));
    expect(r.totalBytes).toBeGreaterThan(0);
  });

  it('命中率按片数统计', () => {
    const r = simulateLoad(chunks, cp(0x41), { chunkSizes: [100, 200, 300] });
    expect(r.hitRate).toBeCloseTo(1 / 3);
  });

  it('空样本文本不产生命中', () => {
    const r = simulateLoad(chunks, '', { chunkSizes: [100, 200, 300] });
    expect(r.hitIndices).toEqual([]);
    expect(r.totalBytes).toBe(0);
    expect(r.coverage).toBe(1); // 无字符需要覆盖，视为全覆盖
  });
});
