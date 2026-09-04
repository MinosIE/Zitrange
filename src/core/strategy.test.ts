import { describe, it, expect } from 'vitest';
import { normalizeStrategy } from './strategy';
import type { PartitionStrategy } from './types';

const base = (over: Partial<PartitionStrategy> = {}): PartitionStrategy => ({
  baseSize: 4000,
  fallback: 'none',
  ...over,
});

describe('normalizeStrategy', () => {
  it('缺失字段给默认值', () => {
    const s = normalizeStrategy({ baseSize: 4000, fallback: 'none' });
    expect(s.useFontCmap).toBe(false);
    expect(s.includeAsciiPunct).toBe(true);
    expect(s.asciiFirst).toBe(true);
    expect(s.asciiAlwaysLoad).toBe(false);
  });

  it('保留显式合法字段', () => {
    const s = normalizeStrategy(
      base({ fallback: 'common', useFontCmap: true, asciiFirst: false, asciiAlwaysLoad: true, maxChunks: 16 }),
    );
    expect(s.fallback).toBe('common');
    expect(s.useFontCmap).toBe(true);
    expect(s.asciiFirst).toBe(false);
    expect(s.asciiAlwaysLoad).toBe(true);
    expect(s.maxChunks).toBe(16);
  });

  it('baseSize < 1 回退到 4000', () => {
    expect(normalizeStrategy(base({ baseSize: -5 })).baseSize).toBe(4000);
    expect(normalizeStrategy(base({ baseSize: 0 })).baseSize).toBe(4000);
  });

  it('maxChunks 仅在显式 > 0 时保留', () => {
    expect(normalizeStrategy(base()).maxChunks).toBeUndefined();
  });

  it('commonFirst 默认 false，显式值保留', () => {
    expect(normalizeStrategy(base()).commonFirst).toBe(false);
    expect(normalizeStrategy(base({ commonFirst: true })).commonFirst).toBe(true);
  });
});
