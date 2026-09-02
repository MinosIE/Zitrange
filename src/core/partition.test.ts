import { describe, expect, it } from 'vitest';
import { applyOverrides, isAsciiOrPunct, partition } from './partition';
import type { PartitionStrategy } from './types';

/** 关闭递增，便于断言固定大小 */
const fixed: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 100,
  growth: 1,
  maxSize: 800,
  fallback: 'none',
};

/** 1000 个连续汉字码位，从 U+4E00（一）开始 */
const han = Array.from({ length: 1000 }, (_, i) => 0x4e00 + i);

describe('isAsciiOrPunct', () => {
  it('识别 ASCII、CJK 标点与全角变体', () => {
    expect(isAsciiOrPunct(0x41)).toBe(true); // A
    expect(isAsciiOrPunct(0x3002)).toBe(true); // 。
    expect(isAsciiOrPunct(0xff0c)).toBe(true); // ，
    expect(isAsciiOrPunct(0x4e00)).toBe(false); // 一
  });
});

describe('partition', () => {
  it('把 ASCII 与标点单独切成第 0 片', () => {
    const chunks = partition([0x41, 0x3002, ...han], fixed);
    expect(chunks[0].codepoints).toContain(0x41);
    expect(chunks[0].codepoints).toContain(0x3002);
    expect(chunks[0].codepoints).not.toContain(0x4e00);
  });

  it('纯汉字输入时第 0 片就是汉字片', () => {
    const chunks = partition(han.slice(0, 250), fixed);
    expect(chunks[0].codepoints).toContain(0x4e00);
  });

  it('固定分片按 baseSize 切分，不丢不重', () => {
    const chunks = partition(han, { ...fixed, baseSize: 100 });
    expect(chunks.map((c) => c.codepoints.length)).toEqual(Array(10).fill(100));
    const all = chunks.flatMap((c) => c.codepoints);
    expect(all).toHaveLength(1000);
    expect(new Set(all).size).toBe(1000);
  });

  it('递增分片逐片变大且受 maxSize 约束', () => {
    const chunks = partition(han, { ...fixed, baseSize: 10, growth: 2, maxSize: 100 });
    const sizes = chunks.map((c) => c.codepoints.length);
    expect(sizes.slice(0, 4)).toEqual([10, 20, 40, 80]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  });

  it('尾片过小时并入前一片', () => {
    // 105 字 / 每片 50 → 50, 50, 5；5 < 50/3 应并入
    const chunks = partition(han.slice(0, 105), { ...fixed, baseSize: 50 });
    expect(chunks).toHaveLength(2);
    expect(chunks[1].codepoints).toHaveLength(55);
  });

  it('字符集小于单片上限时只出一片', () => {
    const chunks = partition(han.slice(0, 30), { ...fixed, baseSize: 200 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].codepoints).toHaveLength(30);
  });

  it('下标连续且从 0 开始', () => {
    const chunks = partition(han, { ...fixed, baseSize: 100 });
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
});

describe('applyOverrides', () => {
  const chunksOf = (n: number) =>
    partition(han.slice(0, n), fixed).map((c) => c.codepoints);

  it('merge 合并两个片', () => {
    const out = applyOverrides(chunksOf(300), [{ kind: 'merge', chunks: [0, 1] }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(200);
  });

  it('merge 遇到非法下标时安全跳过', () => {
    const base = chunksOf(300);
    expect(applyOverrides(base, [{ kind: 'merge', chunks: [0, 99] }])).toEqual(base);
    expect(applyOverrides(base, [{ kind: 'merge', chunks: [1, 1] }])).toEqual(base);
  });

  it('split 按中位数拆分', () => {
    const out = applyOverrides(chunksOf(100), [{ kind: 'split', chunk: 0, at: 'median' }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(50);
    expect(out[1]).toHaveLength(50);
  });

  it('split 的下标会被 clamp 到合法范围', () => {
    const out = applyOverrides(chunksOf(100), [{ kind: 'split', chunk: 0, at: 999 }]);
    expect(out[0]).toHaveLength(99);
    expect(out[1]).toHaveLength(1);
  });

  it('pin 把字符移到指定片首且不产生重复', () => {
    const out = applyOverrides(chunksOf(300), [{ kind: 'pin', chars: ['一'], to: 0 }]);
    expect(out[0][0]).toBe(0x4e00); // 一
    const all = out.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(300);
  });

  it('pin 到高频片后，样本文本只命中该片', () => {
    // 把「一」从第 0 片钉到第 1 片，第 0 片就不再包含它
    const out = applyOverrides(chunksOf(300), [{ kind: 'pin', chars: ['一'], to: 1 }]);
    expect(out[0]).not.toContain(0x4e00);
    expect(out[1][0]).toBe(0x4e00);
  });

  it('exclude 移除字符并丢掉空片', () => {
    const out = applyOverrides([[0x41, 0x42]], [{ kind: 'exclude', chars: ['A', 'B'] }]);
    expect(out).toHaveLength(0);
  });

  it('多个 override 按顺序依次生效', () => {
    const out = applyOverrides(chunksOf(300), [
      { kind: 'merge', chunks: [0, 1] },
      { kind: 'split', chunk: 0, at: 'median' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(100);
    expect(out[1]).toHaveLength(100);
    expect(out[2]).toHaveLength(100);
  });
});
