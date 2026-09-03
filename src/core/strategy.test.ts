import { describe, it, expect } from 'vitest';
import { normalizeStrategy } from './strategy';
import type { PartitionStrategy } from './types';

const base: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 500,
  growth: 1.35,
  maxSize: 1000,
  fallback: 'none',
};

describe('normalizeStrategy', () => {
  it('全量模式：保留 frequency/codepoint/block，把 hybrid/site 收敛为 frequency', () => {
    expect(normalizeStrategy({ ...base, useFontCmap: true, mode: 'frequency' }).mode).toBe(
      'frequency',
    );
    expect(normalizeStrategy({ ...base, useFontCmap: true, mode: 'codepoint' }).mode).toBe(
      'codepoint',
    );
    expect(normalizeStrategy({ ...base, useFontCmap: true, mode: 'block' }).mode).toBe('block');
    // 默认 DEFAULT_STRATEGY 就是 hybrid + 全量，必须收敛，否则界面与实际不一致
    expect(normalizeStrategy({ ...base, useFontCmap: true }).mode).toBe('frequency');
    expect(normalizeStrategy({ ...base, useFontCmap: true, mode: 'site' }).mode).toBe('frequency');
  });

  it('纯输入 + 不兜底：恒为 hybrid（界面据此隐藏「分片模式」）', () => {
    expect(normalizeStrategy({ ...base, mode: 'hybrid' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...base, mode: 'frequency' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...base, mode: 'codepoint' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...base, mode: 'block' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...base, mode: 'site' }).mode).toBe('hybrid');
  });

  it('纯输入 + 有兜底：保留 hybrid/frequency/codepoint，收敛 block 与 site', () => {
    const fb = { ...base, fallback: 'common-3500' as const };
    expect(normalizeStrategy({ ...fb, mode: 'hybrid' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...fb, mode: 'frequency' }).mode).toBe('frequency');
    expect(normalizeStrategy({ ...fb, mode: 'codepoint' }).mode).toBe('codepoint');
    expect(normalizeStrategy({ ...fb, mode: 'block' }).mode).toBe('hybrid');
    expect(normalizeStrategy({ ...fb, mode: 'site' }).mode).toBe('hybrid');
  });

  it('幂等，且已合法时返回入参引用（避免无谓重渲染）', () => {
    const s: PartitionStrategy = { ...base, fallback: 'common-3500', mode: 'frequency' };
    const once = normalizeStrategy(s);
    expect(once).toBe(s);
    expect(normalizeStrategy(once)).toBe(once);
  });

  it('不改动除 mode 以外的字段', () => {
    const s: PartitionStrategy = { ...base, mode: 'block', targetSlices: 20, asciiFirst: false };
    const out = normalizeStrategy(s);
    expect(out.targetSlices).toBe(20);
    expect(out.asciiFirst).toBe(false);
    expect(out.mode).toBe('hybrid');
  });
});
