import type { EnvReport } from '../api';

/**
 * F5.1 引擎依赖引导条：
 * - 必需依赖缺失/版本过低 → danger 引导条（列出缺项 + 可直接复制的安装步骤）
 * - 全部必需依赖就绪、仅可选加速（woff2_compress）缺失 → 一行静默提示
 * - 完全就绪 → 返回 null（不留痕迹）
 */
export function EnvBanner({ report, onRetry }: { report: EnvReport; onRetry: () => void }) {
  const broken = report.items.filter((it) => it.required && it.state !== 'ok');

  if (broken.length === 0) {
    if (report.optionalSteps.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border-l-2 border-warning bg-warning-bg px-3 py-2 text-[12px] leading-relaxed text-ink-600">
        <span>可选加速依赖未安装，不影响生成 woff2/woff/ttf：</span>
        <code className="zr-num text-[11px] text-ink-700">{report.optionalSteps[0]}</code>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-l-2 border-danger bg-danger-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-danger">
          引擎依赖缺失 — 请先安装，再加载字体 / 生成分片
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="zr-btn zr-btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
        >
          重新检测
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {broken.map((it) => (
          <li key={it.key} className="text-[12px] leading-relaxed text-ink-700">
            ✗ {it.label}
            {it.need ? `（需要 ${it.need}）` : ''} —{' '}
            {it.state === 'outdated' && it.found ? `当前 ${it.found}` : '未检测到'}
          </li>
        ))}
      </ul>
      {report.steps.length > 0 && (
        <pre className="zr-num overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-700">
          {report.steps.join('\n')}
        </pre>
      )}
    </div>
  );
}
