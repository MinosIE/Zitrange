import { describe, expect, it } from 'vitest';
import { applyFallback, extractCharFreq, isTargetCodepoint, sortByFrequency } from './charset';

describe('isTargetCodepoint', () => {
  it('接受 ASCII、CJK 基本区与扩展区', () => {
    expect(isTargetCodepoint(0x41)).toBe(true); // A
    expect(isTargetCodepoint(0x4e00)).toBe(true); // 一
    expect(isTargetCodepoint(0x3002)).toBe(true); // 。
    expect(isTargetCodepoint(0x20000)).toBe(true); // 𠀀 Ext B
  });

  it('排除 ASCII 控制字符与私用区', () => {
    expect(isTargetCodepoint(0x00)).toBe(false);
    expect(isTargetCodepoint(0x0a)).toBe(false); // \n
    expect(isTargetCodepoint(0xe000)).toBe(false); // 私用区
  });
});

describe('extractCharFreq', () => {
  it('按码位统计出现次数', () => {
    const freq = extractCharFreq('的的的一');
    expect(freq.get(0x7684)).toBe(3); // 的
    expect(freq.get(0x4e00)).toBe(1); // 一
  });

  it('正确处理扩展区汉字（代理对）', () => {
    const freq = extractCharFreq('𠀀𠀀'); // U+20000，占两个 UTF-16 单元
    expect(freq.size).toBe(1);
    expect(freq.get(0x20000)).toBe(2);
  });

  it('忽略控制字符，但保留空格（排版依赖空格字形，不能剔除）', () => {
    const freq = extractCharFreq('一\n\t二 ');
    expect([...freq.keys()].sort((a, b) => a - b)).toEqual([0x20, 0x4e00, 0x4e8c]);
  });
});

describe('sortByFrequency', () => {
  it('按频次降序，同频次按码位升序（结果稳定可复现）', () => {
    const freq = extractCharFreq('乙甲甲');
    expect(sortByFrequency(freq)).toEqual([0x7532, 0x4e59]); // 甲 x2, 乙 x1
  });
});

describe('applyFallback', () => {
  it('补足字表前 N 字，且频次记为 0', () => {
    const freq = extractCharFreq('的的的一');
    const added = applyFallback(freq, [0x4e01, 0x4e02, 0x4e03], 2);
    expect(added).toBe(2);
    expect(freq.get(0x4e01)).toBe(0);
    expect(freq.has(0x4e03)).toBe(false);
  });

  it('兜底字排序时永远排在站点实际用字之后', () => {
    const freq = extractCharFreq('的的的一');
    applyFallback(freq, [0x4e01, 0x4e02], 2);
    expect(sortByFrequency(freq)).toEqual([0x7684, 0x4e00, 0x4e01, 0x4e02]);
  });

  it('已存在的字不重复计入', () => {
    const freq = extractCharFreq('一');
    expect(applyFallback(freq, [0x4e00, 0x4e01], 2)).toBe(1);
  });

  it('count 为 0 时不补字', () => {
    const freq = extractCharFreq('一');
    expect(applyFallback(freq, [0x4e01], 0)).toBe(0);
    expect(freq.has(0x4e01)).toBe(false);
  });
});
