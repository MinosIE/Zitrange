import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..');
const ENGINE_DIR = resolve(here, '..', 'engine');
const PYTHON = resolve(ROOT, '.venv', 'bin', 'python');

/**
 * 调用一个 engine 下的 Python 脚本：把 input 序列化为 JSON 写入其 stdin，
 * 解析其 stdout 的 JSON 作为返回值。stderr 在失败时被透出。
 */
export function runPython(script: string, input: unknown): Promise<any> {
  return new Promise((res, rej) => {
    const child = spawn(PYTHON, [resolve(ENGINE_DIR, script)], { cwd: ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => rej(e));
    child.on('close', (code) => {
      if (code !== 0) {
        rej(new Error(`${script} 退出码 ${code}: ${err || out}`));
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
