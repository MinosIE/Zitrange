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

const base = (over: Partial<PartitionStrategy> = {}): PartitionStrategy => ({
  baseSize: 4000,
  fallback: 'none',
  ...over,
});

describe('策略预设', () => {
  it('三档顺序与每片字数', () => {
    expect(STRATEGY_PRESET_ORDER).toEqual(['fine', 'medium', 'coarse']);
    expect(STRATEGY_PRESETS.fine.baseSize).toBe(1500);
    expect(STRATEGY_PRESETS.medium.baseSize).toBe(4000);
    expect(STRATEGY_PRESETS.coarse.baseSize).toBe(8000);
  });

  it('applyPreset 只覆盖每片字数，保留其他字段', () => {
    const s = base({ fallback: 'common', asciiFirst: false, useFontCmap: true });
    const out = applyPreset(s, 'coarse');
    expect(out.baseSize).toBe(8000);
    expect(out.fallback).toBe('common');
    expect(out.asciiFirst).toBe(false);
    expect(out.useFontCmap).toBe(true);
  });

  it('detectPreset 模板命中对应档，否则判为 custom', () => {
    expect(detectPreset(applyPreset(base(), 'fine'))).toBe('fine');
    expect(detectPreset(applyPreset(base(), 'medium'))).toBe('medium');
    expect(detectPreset(applyPreset(base(), 'coarse'))).toBe('coarse');
    expect(detectPreset(base({ baseSize: 600 }))).toBe('custom');
  });

  it('estimatePreset 均匀切片：slices = ceil(N / 每片字数)，且与真实 partition 偏差 ≤ 1', () => {
    const seq = (n: number) => Array.from({ length: n }, (_, i) => 0x4e00 + i);
    for (const id of ['fine', 'medium', 'coarse'] as const) {
      const e = estimatePreset(id, 20_000);
      const real = partition(seq(20_000), applyPreset(base(), id), { asciiFirst: false }).length;
      expect(e.perSlice).toBe(STRATEGY_PRESETS[id].baseSize);
      expect(Math.abs(e.slices - real)).toBeLessThanOrEqual(1);
    }
    expect(estimatePreset('medium', 500).slices).toBe(1);
    expect(estimatePreset('medium', 0).slices).toBe(0);
  });
});
