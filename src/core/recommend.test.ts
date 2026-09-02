import { describe, expect, it } from 'vitest';
import { chunkPlan, recommend } from './recommend';
import type { FontInfo } from './types';

const font = (over: Partial<FontInfo> = {}): FontInfo => ({
  id: 'x',
  fileName: 'f.ttf',
  bytes: Math.round(1.3 * 1048576), // 1.3MB
  family: 'FZJin',
  subfamily: 'Regular',
  weight: 400,
  style: 'normal',
  numGlyphs: 8104,
  outline: 'glyf',
  isVariable: false,
  fontNumber: 0,
  ...over,
});

describe('chunkPlan', () => {
  it('按递增序列切到耗尽', () => {
    const sizes = chunkPlan(1000, { mode: 'hybrid', baseSize: 200, growth: 2, maxSize: 800, fallback: 'none' });
    expect(sizes).toEqual([200, 400, 400]);
  });

  it('空字符集返回 [0]', () => {
    expect(chunkPlan(0, { mode: 'hybrid', baseSize: 200, growth: 1, maxSize: 800, fallback: 'none' })).toEqual([0]);
  });
});

describe('recommend', () => {
  it('默认输出 woff2 与 hybrid 策略', () => {
    const r = recommend({ font: font(), charCount: 5000 });
    expect(r.format).toEqual(['woff2']);
    expect(r.strategy.mode).toBe('hybrid');
  });

  it('每条建议都有 id 与 evidence', () => {
    const r = recommend({ font: font(), charCount: 5000 });
    expect(r.reasons.length).toBeGreaterThan(0);
    for (const reason of r.reasons) {
      expect(reason.id).toMatch(/^R\d$/);
      expect(reason.evidence.length).toBeGreaterThan(0);
    }
  });

  it('首屏估算小于全集估算', () => {
    const r = recommend({ font: font(), charCount: 8000 });
    expect(r.estimate.typicalPageLoad).toBeGreaterThan(0);
    expect(r.estimate.typicalPageLoad).toBeLessThan(r.estimate.totalSize);
  });

  it('复杂轮廓字体会缩小单片刻数', () => {
    // 17MB / 8104 字形 ≈ 2200 B/字 > 600 → 触发 complex
    const r = recommend({
      font: font({ bytes: Math.round(17 * 1048576) }),
      charCount: 5000,
    });
    expect(r.strategy.baseSize).toBe(100);
    expect(r.strategy.maxSize).toBe(400);
  });

  it('字符集接近字形数时给出缺字预警', () => {
    const r = recommend({ font: font({ numGlyphs: 8000 }), charCount: 8000 });
    expect(r.reasons.some((x) => x.id === 'R8')).toBe(true);
  });

  it('估算片数合理（8000 字 / 200 基础 ≈ 数十片）', () => {
    const r = recommend({ font: font(), charCount: 8000 });
    expect(r.estimate.chunkCount).toBeGreaterThan(10);
    expect(r.estimate.chunkCount).toBeLessThan(200);
  });
});
