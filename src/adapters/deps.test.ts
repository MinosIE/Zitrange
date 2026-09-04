import { describe, it, expect } from 'vitest';
import { buildEnvReport, versionAtLeast, type EnvProbe } from './deps';

const okProbe = (over: Partial<EnvProbe> = {}): EnvProbe => ({
  py: { path: '/repo/.venv/bin/python', kind: 'venv', version: '3.13.3' },
  venvDirExists: true,
  modules: { fonttools: '4.55.0', brotli: '1.1.0' },
  woff2Compress: true,
  ...over,
});

describe('F5.1 依赖自检', () => {
  describe('versionAtLeast', () => {
    it('比较纯数字段，支持不同长度', () => {
      expect(versionAtLeast('3.9', '3.9')).toBe(true);
      expect(versionAtLeast('3.13.3', '3.9')).toBe(true);
      expect(versionAtLeast('3.8', '3.9')).toBe(false);
      expect(versionAtLeast('4.50.0', '4.50')).toBe(true);
      expect(versionAtLeast('4.49', '4.50')).toBe(false);
      expect(versionAtLeast('3.10', '3.9.0')).toBe(true);
    });

    it('无版本号视为不满足', () => {
      expect(versionAtLeast('', '4.50')).toBe(false);
      expect(versionAtLeast('unknown', '4.50')).toBe(false);
    });
  });

  describe('buildEnvReport', () => {
    it('全部就绪（含 woff2_compress）→ ok 且无安装步骤', () => {
      const r = buildEnvReport(okProbe(), 'darwin');
      expect(r.ok).toBe(true);
      expect(r.pythonKind).toBe('venv');
      expect(r.steps).toEqual([]);
      expect(r.optionalSteps).toEqual([]);
    });

    it('找不到 Python → 给出系统安装命令与 npm run setup', () => {
      const r = buildEnvReport(
        { py: null, venvDirExists: false, modules: null, woff2Compress: false },
        'darwin',
      );
      expect(r.ok).toBe(false);
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toMatchObject({ key: 'python', state: 'missing', need: '>= 3.9' });
      expect(r.steps[0]).toContain('brew install python3');
      expect(r.steps[1]).toContain('npm run setup');
    });

    it('Python 版本过低 → 提示重建 .venv', () => {
      const r = buildEnvReport(okProbe({ py: { ...(okProbe().py as any), version: '3.8.10' } }), 'linux');
      expect(r.ok).toBe(false);
      const py = r.items.find((i) => i.key === 'python')!;
      expect(py.state).toBe('outdated');
      expect(r.steps.join('\n')).toContain('rm -rf .venv');
    });

    it('.venv 就绪但缺 fonttools → 直接在 venv 补装', () => {
      const r = buildEnvReport(
        okProbe({ modules: { fonttools: null, brotli: '1.1.0' } }),
        'linux',
      );
      expect(r.ok).toBe(false);
      expect(r.items.find((i) => i.key === 'fonttools')?.state).toBe('missing');
      expect(r.items.find((i) => i.key === 'brotli')?.state).toBe('ok');
      expect(r.steps).toEqual([
        `${'/repo/.venv/bin/python'} -m pip install --upgrade fonttools brotli`,
      ]);
    });

    it('fonttools 版本过低 → 标记 outdated 并走升级', () => {
      const r = buildEnvReport(
        okProbe({ modules: { fonttools: '4.44.0', brotli: '1.1.0' } }),
        'linux',
      );
      expect(r.ok).toBe(false);
      expect(r.items.find((i) => i.key === 'fonttools')).toMatchObject({
        state: 'outdated',
        found: '4.44.0',
        need: '>= 4.50',
      });
      expect(r.steps.length).toBeGreaterThan(0);
    });

    it('系统 Python 且还没有 .venv → 先建 venv 再补装', () => {
      const r = buildEnvReport(
        {
          py: { path: 'python3', kind: 'system', version: '3.12.1' },
          venvDirExists: false,
          modules: { fonttools: null, brotli: '1.1.0' },
          woff2Compress: false,
        },
        'linux',
      );
      expect(r.steps).toContain('python3 -m venv .venv');
      expect(r.steps[1]).toContain('.venv/bin/python -m pip install --upgrade fonttools brotli');
    });

    it('woff2_compress 缺失不阻塞，进入可选步骤', () => {
      const r = buildEnvReport(okProbe({ woff2Compress: false }), 'darwin');
      expect(r.ok).toBe(true);
      expect(r.optionalSteps).toHaveLength(1);
      expect(r.optionalSteps[0]).toContain('brew install woff2');
    });
  });
});
