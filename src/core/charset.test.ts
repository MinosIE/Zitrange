import { describe, expect, it } from 'vitest';
import {
  applyFallback,
  extractCharFreq,
  isTargetCodepoint,
  sortByFrequency,
  sortByGlobalRank,
  FALLBACK_SIZES,
} from './charset';
import { charFreqCodepoints } from './assets/charfreq-zh';

describe('sortByGlobalRank（字频模式）', () => {
  it('按全局字频名次升序，忽略站点真实频次', () => {
    // '的' 全局最高频、count 仅 1；'齉' 不在表中（名次最大）却 count 极大
    const freq = new Map<number, number>([
      [0x9f49, 1000], // 齉（生僻，不在字频表）
      [0x7684, 1], // 的
    ]);
    expect(sortByGlobalRank(freq)[0]).toBe(0x7684);
  });

  it('名次相同按码位升序，结果稳定', () => {
    const freq = new Map<number, number>([
      [0x4e00, 5], // 一
      [0x7684, 9], // 的
    ]);
    expect(sortByGlobalRank(freq)).toEqual([0x7684, 0x4e00]);
  });
});

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

describe('charFreqCodepoints（兜底字频表）', () => {
  it('按字频降序排，而非码位序（的 必须排在 一 之前）', () => {
    const cps = charFreqCodepoints();
    const di = cps.indexOf(0x7684); // 的
    const yi = cps.indexOf(0x4e00); // 一
    expect(di).toBeGreaterThanOrEqual(0);
    expect(yi).toBeGreaterThanOrEqual(0);
    // 码位序下 一(0x4e00) 会早于 的(0x7684)，此处必须相反——这是本表的唯一正确性契约
    expect(di).toBeLessThan(yi);
  });

  it('兜底 common-3500 时，最高频的「的」一定落在字符集内', () => {
    const freq = extractCharFreq(''); // 模拟「留空」
    applyFallback(freq, charFreqCodepoints(), FALLBACK_SIZES['common-3500']);
    // 旧实现直接取 font.codepoints（码位升序），会把 的 排除在 3500 之外
    expect(freq.has(0x7684)).toBe(true);
  });

  it('是一份去重、纯 CJK 基本区汉字的频率表', () => {
    const cps = charFreqCodepoints();
    expect(new Set(cps).size).toBe(cps.length); // 无重复
    expect(cps.every((c) => c >= 0x4e00 && c <= 0x9fff)).toBe(true);
  });
});
