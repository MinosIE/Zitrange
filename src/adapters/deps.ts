import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * F5.1 依赖自检：启动 / 前端加载时探测 Python 运行环境与 fonttools 等模块，
 * 缺失时给出可直接执行的安装命令，替代「.venv 路径硬编码 + 缺依赖直接报错」。
 *
 * 探测顺序（findPython）：
 *   1. $ZITRANGE_PYTHON（显式指定）
 *   2. 项目 .venv/bin/python（README 推荐，npm run setup 创建）
 *   3. PATH 上的 python3 / python
 * 首个能跑通探测脚本的解释器即被选中并缓存。
 */

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, '..', '..');
const VENV_DIR = join(PROJECT_ROOT, '.venv');
const REL_VENV_PY = process.platform === 'win32'
  ? join('.venv', 'Scripts', 'python.exe')
  : join('.venv', 'bin', 'python');
const VENV_PYTHON = join(PROJECT_ROOT, REL_VENV_PY);

export type DepKey = 'python' | 'fonttools' | 'brotli' | 'woff2_compress';
export type DepState = 'ok' | 'missing' | 'outdated';

export interface DepItem {
  key: DepKey;
  label: string;
  required: boolean;
  state: DepState;
  found: string | null;
  need: string | null;
  /** 只读文案用的修复命令（真正的可执行步骤统一收敛在 report.steps） */
  fix: string | null;
}

export interface EnvReport {
  /** 全部必需依赖就绪 */
  ok: boolean;
  /** 当前使用的解释器路径（解析成功时） */
  python: string | null;
  pythonKind: 'venv' | 'system' | null;
  items: DepItem[];
  /** 必需依赖缺失 / 版本过低时的安装步骤（按顺序去重） */
  steps: string[];
  /** 可选依赖建议（当前只有 woff2_compress） */
  optionalSteps: string[];
}

/* ------------------------------------------------------------------ */
/* 版本比较（纯函数，便于单测）                                         */
/* ------------------------------------------------------------------ */

export function versionTuple(v: string): number[] {
  const m = String(v ?? '').trim().match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [];
}

export function versionAtLeast(found: string, need: string): boolean {
  const a = versionTuple(found);
  const b = versionTuple(need);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 修复命令文案                                                        */
/* ------------------------------------------------------------------ */

function platformPythonHint(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'brew install python3   # macOS，或用 python.org 安装包';
  if (platform === 'win32')
    return '从 https://www.python.org/downloads/ 安装，勾选 “Add python.exe to PATH”';
  return 'sudo apt install python3 python3-venv   # Debian / Ubuntu 系';
}

function woff2OptionalStep(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'brew install woff2   # 可选：原生压缩更快';
  if (platform === 'linux') return 'sudo apt install woff2   # 可选：原生压缩更快（Debian/Ubuntu）';
  return 'woff2_compress（可选，windows 版见 GitHub google/woff2 releases）';
}

function pipCmd(bin: string, platform: NodeJS.Platform): string {
  const py = platform === 'win32' ? `"${bin}"` : bin;
  return `${py} -m pip install --upgrade fonttools brotli`;
}

/* ------------------------------------------------------------------ */
/* 报告组装（纯函数，输入由探测结果注入，便于单测）                      */
/* ------------------------------------------------------------------ */

export interface EnvProbe {
  /** 解析到的解释器；null = 所有候选都不可用 */
  py: { path: string; kind: 'venv' | 'system'; version: string } | null;
  /** .venv 目录是否存在（影响「先建 venv」还是「直接 pip」的引导） */
  venvDirExists: boolean;
  /** 探测脚本在解释器里的结果；python 不可用时为 null */
  modules: { fonttools: string | null; brotli: string | null } | null;
  woff2Compress: boolean;
}

/** 把探测结果翻译成 { items, steps, optionalSteps }，供 UI / 启动日志 / 守卫复用 */
export function buildEnvReport(
  probe: EnvProbe,
  platform: NodeJS.Platform = process.platform,
): EnvReport {
  if (!probe.py) {
    const hint = platformPythonHint(platform);
    return {
      ok: false,
      python: null,
      pythonKind: null,
      items: [
        {
          key: 'python',
          label: 'Python',
          required: true,
          state: 'missing',
          found: null,
          need: '>= 3.9',
          fix: hint,
        },
      ],
      steps: [hint, 'npm run setup   # 创建 .venv 并安装 fonttools / brotli'],
      optionalSteps: [],
    };
  }

  const pyOk = versionAtLeast(probe.py.version, '3.9');
  const ft = probe.modules?.fonttools ?? null;
  const br = probe.modules?.brotli ?? null;
  const ftOk = ft !== null && versionAtLeast(ft, '4.50');
  const brOk = br !== null;

  const items: DepItem[] = [
    {
      key: 'python',
      label: 'Python',
      required: true,
      state: pyOk ? 'ok' : 'outdated',
      found: probe.py.version,
      need: '>= 3.9',
      fix: pyOk ? null : platformPythonHint(platform),
    },
    {
      key: 'fonttools',
      label: 'fonttools',
      required: true,
      state: ft === null ? 'missing' : ftOk ? 'ok' : 'outdated',
      found: ft === null ? null : ft,
      need: '>= 4.50',
      fix: ftOk ? null : null,
    },
    {
      key: 'brotli',
      label: 'brotli（woff2 压缩）',
      required: true,
      state: brOk ? 'ok' : 'missing',
      found: br === null ? null : br || '(已安装)',
      need: brOk ? null : '>= 1.1',
      fix: null,
    },
    {
      key: 'woff2_compress',
      label: 'woff2_compress',
      required: false,
      state: probe.woff2Compress ? 'ok' : 'missing',
      found: probe.woff2Compress ? '(PATH)' : null,
      need: null,
      fix: woff2OptionalStep(platform),
    },
  ];

  const steps: string[] = [];
  if (!pyOk) {
    // 版本过低：重装解释器后重建 .venv（旧 venv 绑定旧解释器，pip 升级不解决）
    steps.push(platformPythonHint(platform));
    if (probe.venvDirExists) steps.push('rm -rf .venv && npm run setup   # 重建虚拟环境');
    else steps.push('npm run setup   # 创建 .venv 并安装 fonttools / brotli');
  } else {
    const needPip = !ftOk || !brOk;
    if (needPip) {
      if (probe.py.kind === 'venv') {
        // .venv 就绪但缺模块：直接在 venv 里补装
        const bin = probe.py.path.startsWith(PROJECT_ROOT)
          ? relative(PROJECT_ROOT, probe.py.path)
          : probe.py.path;
        steps.push(pipCmd(bin, platform));
      } else if (probe.venvDirExists) {
        // 系统解释器可用但 .venv 坏了（探测时已回退到系统）：重建并重装
        steps.push(`python3 -m venv --clear .venv   # 重建已损坏的虚拟环境`);
        steps.push(pipCmd(REL_VENV_PY, platform));
      } else {
        // 还没有虚拟环境：先建再装，避免污染系统 Python
        steps.push('python3 -m venv .venv');
        steps.push(pipCmd(REL_VENV_PY, platform));
      }
    }
  }

  const optionalSteps: string[] = [];
  if (!probe.woff2Compress) optionalSteps.push(woff2OptionalStep(platform));

  return {
    ok: items.every((it) => !it.required || it.state === 'ok'),
    python: probe.py.path,
    pythonKind: probe.py.kind,
    items,
    steps,
    optionalSteps,
  };
}

/* ------------------------------------------------------------------ */
/* 运行时探测（结果缓存到进程生命周期）                                 */
/* ------------------------------------------------------------------ */

/** 一次探测同时拿版本 + 模块：python 可用时一次性输出 JSON */
const PROBE_SCRIPT = [
  'import json, sys',
  'd = {"py": sys.version.split()[0]}',
  'try:',
  '  import fontTools',
  '  d["fonttools"] = getattr(fontTools, "version", "") or ""',
  'except Exception:',
  '  d["fonttools"] = None',
  'try:',
  '  import brotli',
  '  d["brotli"] = getattr(brotli, "__version__", "") or ""',
  'except Exception:',
  '  d["brotli"] = None',
  'print(json.dumps(d))',
].join('\n');

interface PythonCandidate {
  path: string;
  kind: 'venv' | 'system';
}

function candidates(): PythonCandidate[] {
  const list: PythonCandidate[] = [];
  if (process.env.ZITRANGE_PYTHON) {
    list.push({ path: process.env.ZITRANGE_PYTHON, kind: existsSync(VENV_PYTHON) ? 'venv' : 'system' });
  }
  if (existsSync(VENV_PYTHON)) list.push({ path: VENV_PYTHON, kind: 'venv' });
  list.push({ path: 'python3', kind: 'system' });
  if (process.platform === 'win32') list.push({ path: 'python', kind: 'system' });
  // 去重：优先保留靠前的（override > venv > system）
  return list.filter((c, i) => list.findIndex((x) => x.path === c.path) === i);
}

function runProbe(py: string): { py?: string; fonttools?: string | null; brotli?: string | null } | null {
  const r = spawnSync(py, ['-c', PROBE_SCRIPT], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (r.error || r.status !== 0) return null;
  try {
    const d = JSON.parse(r.stdout);
    if (typeof d?.py === 'string' && d.py) return d;
    return null;
  } catch {
    return null;
  }
}

let pickCache: { py: { path: string; kind: 'venv' | 'system'; version: string } | null } | null = null;

async function pickPython(force: boolean) {
  if (!force && pickCache) return pickCache;
  for (const c of candidates()) {
    const d = runProbe(c.path);
    if (d) {
      pickCache = { py: { path: c.path, kind: c.kind, version: d.py as string } };
      return pickCache;
    }
  }
  pickCache = { py: null };
  return pickCache;
}

function findOnPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter);
  const names =
    process.platform === 'win32' ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const n of names) {
      const f = join(dir, n);
      if (existsSync(f)) return f;
    }
  }
  return null;
}

let envCache: EnvReport | null = null;

/**
 * 依赖自检入口。进程内缓存结果；安装完依赖后前端点「重新检测」时传 force 重跑。
 */
export async function checkEnv(force = false): Promise<EnvReport> {
  if (!force && envCache) return envCache;
  const picked = await pickPython(force);
  let probe: EnvProbe;
  if (!picked.py) {
    probe = { py: null, venvDirExists: existsSync(VENV_DIR), modules: null, woff2Compress: false };
  } else {
    const d = runProbe(picked.py.path);
    probe = {
      py: picked.py,
      venvDirExists: existsSync(VENV_DIR),
      modules: d ? { fonttools: d.fonttools ?? null, brotli: d.brotli ?? null } : null,
      woff2Compress: findOnPath('woff2_compress') !== null,
    };
  }
  const report = buildEnvReport(probe);
  envCache = report;
  return report;
}

/** 取当前解释器路径（runPython 用）。找不到时抛出带安装步骤的友好错误 */
export async function resolvePython(): Promise<string> {
  const picked = await pickPython(false);
  if (!picked.py) {
    const report = buildEnvReport({ py: null, venvDirExists: false, modules: null, woff2Compress: false });
    throw new Error(`引擎依赖缺失：未找到 Python。\n${report.steps.join('\n')}`);
  }
  return picked.py.path;
}
