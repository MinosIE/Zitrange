import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PROJECT_ROOT, resolvePython } from './deps';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = resolve(here, '..', 'engine');

/** 常见缺依赖时 stderr 的稳定标记 → 可读的修复提示 */
function moduleHint(err: string): string | null {
  if (/No module named ['"]?fontTools/i.test(err)) {
    return 'Python 环境未安装 fonttools：请执行 npm run setup，或运行\n.venv/bin/python -m pip install fonttools brotli\n后重试。';
  }
  if (/No module named ['"]?brotli/i.test(err)) {
    return 'Python 环境未安装 brotli（woff2 压缩需要）：请执行 npm run setup，或运行\n.venv/bin/python -m pip install fonttools brotli\n后重试。';
  }
  return null;
}

/**
 * 调用一个 engine 下的 Python 脚本：把 input 序列化为 JSON 写入其 stdin，
 * 解析其 stdout 的 JSON 作为返回值。stderr 在失败时被透出。
 *
 * F5.1：解释器不再硬编码 .venv 路径，由 resolvePython() 自动解析并缓存；
 * 找不到 Python 或缺 fonttools/brotli 时抛出的都是带安装命令的友好错误。
 */
export async function runPython(script: string, input: unknown): Promise<any> {
  const py = await resolvePython(); // 找不到时抛「依赖缺失 + 安装步骤」
  const scriptPath = resolve(ENGINE_DIR, script);
  return new Promise((res, rej) => {
    const child = spawn(py, [scriptPath], { cwd: PROJECT_ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) =>
      rej(new Error(`无法启动 Python（${py}）：${e.message}\n请先安装依赖（npm run setup）。`)),
    );
    child.on('close', (code) => {
      if (code !== 0) {
        const hint = moduleHint(err);
        rej(new Error(hint ? `依赖缺失：${hint}` : `${script} 退出码 ${code}: ${err || out}`));
        return;
      }
      try {
        res(out.trim() ? JSON.parse(out) : {});
      } catch (e) {
        rej(new Error(`${script} 返回非 JSON: ${out}\n${err}`));
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
