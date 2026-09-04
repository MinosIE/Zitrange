import { describe, it, expect } from 'vitest';
import type { PartitionStrategy } from './types';
import { partition } from './partition';
import {
  STRATEGY_PRESETS,
  STRATEGY_PRESET_ORDER,
  applyPreset,
  detectPreset,
  estimatePreset,
} from './presets';

const base: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 500,
  growth: 1.35,
  maxSize: 1000,
  fallback: 'none',
};

describe('F2.10 策略预设', () => {
  it('三档顺序与模板存在，且均衡档 = 应用当前默认参数（500/1.35/1000 + 目标片数 20）', () => {
    expect(STRATEGY_PRESET_ORDER).toEqual(['volume', 'balance', 'requests']);
    expect(STRATEGY_PRESETS.balance).toEqual({
      baseSize: 500,
      growth: 1.35,
      maxSize: 1000,
      targetSlices: 20,
    });
  });

  it('最小体积档：递增小首片，不设目标片数', () => {
    expect(STRATEGY_PRESETS.volume.targetSlices).toBeUndefined();
    expect(STRATEGY_PRESETS.volume.baseSize).toBeLessThan(STRATEGY_PRESETS.balance.baseSize);
    expect(STRATEGY_PRESETS.volume.growth).toBeGreaterThan(1);
  });

  it('最少请求档：大片固定，目标片数最少', () => {
    expect(STRATEGY_PRESETS.requests.targetSlices).toBe(8);
    expect(STRATEGY_PRESETS.requests.growth).toBe(1);
    expect(STRATEGY_PRESETS.requests.baseSize).toBeGreaterThan(
      STRATEGY_PRESETS.balance.baseSize,
    );
  });

  it('applyPreset 只覆盖尺寸四参，保留模式/兜底/ASCII 等其他字段', () => {
    const s: PartitionStrategy = {
      ...base,
      mode: 'codepoint',
      fallback: 'common-3500',
      includeAsciiPunct: true,
      asciiFirst: false,
      useFontCmap: true,
    };
    const out = applyPreset(s, 'requests');
    expect(out.baseSize).toBe(2500);
    expect(out.growth).toBe(1);
    expect(out.maxSize).toBe(2500);
    expect(out.targetSlices).toBe(8);
    expect(out.mode).toBe('codepoint');
    expect(out.fallback).toBe('common-3500');
    expect(out.includeAsciiPunct).toBe(true);
    expect(out.asciiFirst).toBe(false);
    expect(out.useFontCmap).toBe(true);
  });

  it('volume 档会清掉遗留的 targetSlices，避免被目标片数覆盖递增', () => {
    const out = applyPreset({ ...base, targetSlices: 20 }, 'volume');
    expect(out.targetSlices).toBeUndefined();
    expect(detectPreset(out)).toBe('volume');
  });

  it('detectPreset：模板值精确命中对应档', () => {
    expect(detectPreset(applyPreset(base, 'volume'))).toBe('volume');
    expect(detectPreset(applyPreset(base, 'balance'))).toBe('balance');
    expect(detectPreset(applyPreset(base, 'requests'))).toBe('requests');
  });

  it('detectPreset：任一尺寸字段被手调即判为 custom', () => {
    expect(detectPreset({ ...base, baseSize: 600 })).toBe('custom');
    expect(detectPreset({ ...base, growth: 2 })).toBe('custom');
    expect(detectPreset({ ...base, targetSlices: undefined })).toBe('custom');
    expect(detectPreset({ ...base, maxSize: 5000, targetSlices: 12 })).toBe('custom');
  });

  it('detectPreset：targetSlices 的 undefined 与 0 语义相同（都表示关闭目标片数）', () => {
    const v = applyPreset(base, 'volume');
    expect(detectPreset({ ...v, targetSlices: 0 })).toBe('volume');
  });

  it('estimatePreset：targetSlices 档 = 每片 max(100, ⌈N/T⌉)，片数收敛到目标以内', () => {
    expect(estimatePreset('balance', 20_000)).toEqual({ perSlice: 1000, slices: 20 });
    expect(estimatePreset('requests', 20_000)).toEqual({ perSlice: 2500, slices: 8 });
    // 小字符集：下限 100 字/片，片数少于目标（5 片而非 20 / 8）
    expect(estimatePreset('balance', 500)).toEqual({ perSlice: 100, slices: 5 });
    expect(estimatePreset('requests', 500)).toEqual({ perSlice: 100, slices: 5 });
  });

  it('estimatePreset：volume 按 200×1.4^k（cap 1500）累计到覆盖全集，无固定每片', () => {
    expect(estimatePreset('volume', 20_000)).toEqual({ slices: 18 });
    expect(estimatePreset('volume', 500)).toEqual({ slices: 3 });
    expect(estimatePreset('volume', 500)).not.toHaveProperty('perSlice');
  });

  it('estimatePreset：与真实 partition 片数相差 ≤1（尾片并入 / ASCII 首片浮动）', () => {
    const strat: PartitionStrategy = { ...base, mode: 'frequency' };
    const seq = (n: number) => Array.from({ length: n }, (_, i) => 0x4e00 + i);
    for (const [id, n] of [
      ['volume', 20_000],
      ['balance', 20_000],
      ['requests', 20_000],
      ['volume', 500],
      ['balance', 500],
    ] as const) {
      const est = estimatePreset(id, n);
      const real = partition(seq(n), applyPreset(strat, id), { asciiFirst: false }).length;
      expect(Math.abs(est.slices - real)).toBeLessThanOrEqual(1);
    }
  });

  it('estimatePreset：字形数 ≤0 视为无内容，不产出换算', () => {
    expect(estimatePreset('balance', 0)).toEqual({ slices: 0 });
    expect(estimatePreset('requests', -1)).toEqual({ slices: 0 });
  });
});
