import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Theme } from '../useTheme';

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export function splitBytes(b: number): { value: string; unit: string } {
  if (!Number.isFinite(b) || b <= 0) return { value: '0', unit: 'B' };
  if (b < 1024) return { value: String(b), unit: 'B' };
  if (b < 1048576) return { value: (b / 1024).toFixed(1), unit: 'KB' };
  return { value: (b / 1048576).toFixed(2), unit: 'MB' };
}

/* ------------------------------------------------------------------ */
/* 下载                                                                */
/* ------------------------------------------------------------------ */

/** 通过临时 <a download> 触发浏览器下载；filename 为空时取 URL 末段 */
export function downloadUrl(url: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 把一段文本作为文件下载（CSS 等） */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 从产物 URL（如 /output/job/FZ-0.woff2）反推基础名（FZ），用于下载文件名 */
export function baseNameFromUrl(url?: string): string {
  if (!url) return 'zitrange';
  const seg = url.split('/').pop() ?? '';
  return seg.replace(/-\d+\.\w+$/, '') || 'zitrange';
}

/* ------------------------------------------------------------------ */
/* 容器                                                                */
/* ------------------------------------------------------------------ */

export function Panel({
  step,
  title,
  hint,
  delay = 0,
  children,
  className = '',
}: {
  step?: string;
  title: string;
  hint?: ReactNode;
  delay?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`zr-panel zr-rise ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {step && <span className="zr-eyebrow">{step}</span>}
        <h2 className="font-song text-[15px] font-semibold tracking-wide text-ink-900">{title}</h2>
        {hint && (
          <>
            <div className="flex-1" />
            <div className="shrink-0 text-[11px] text-ink-400">{hint}</div>
          </>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] tracking-wide text-ink-400">{label}</span>
      {children}
      {hint && <span className="text-[10px] leading-snug text-ink-300">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* 输入控件                                                            */
/* ------------------------------------------------------------------ */

export function NumberField({
  value,
  onChange,
  step = 1,
  min = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <input
      type="number"
      className="zr-field zr-num"
      value={value}
      step={step}
      min={min}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

/**
 * 自定义下拉。原生下拉控件的选项样式由系统绘制，暗色主题下无法定制，
 * 因此统一改用触发器 + 浮层（纪律模式红线：禁用原生下拉控件）。
 */
export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; note?: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // 浮层用 portal 挂到 body，避免被面板的层叠上下文困住而画在后续面板之下
  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        popRef.current &&
        !popRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={`zr-field flex items-center justify-between gap-2 text-left ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        }`}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
      >
        <span className="truncate">{active?.label ?? '—'}</span>
        <svg
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className={`h-3 w-3 shrink-0 text-ink-400 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path d="M1 1.5L6 6.5L11 1.5" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 50 }}
            className="zr-pop z-50 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lift"
          >
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors bg-surface hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${
                    on ? 'bg-surface-2 font-medium text-brand' : 'text-ink-700'
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.note && (
                    <span className="ml-1 shrink-0 text-[10px] text-ink-300">{o.note}</span>
                  )}
                  {on && (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5 shrink-0"
                    >
                      <path d="M3 8.5L6.5 12L13 4.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** 单选分段控件 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex gap-1 rounded-lg border border-line bg-surface-2 p-1 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            onClick={() => !disabled && onChange(o.value)}
            className={`zr-btn min-w-0 flex-1 px-2 py-1 text-[12px] transition-colors ${
              on
                ? 'bg-brand font-semibold text-white'
                : 'text-ink-500 hover:bg-surface hover:text-ink-900'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 开关（纪律模式：自绘，禁用原生 checkbox） */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`zr-switch ${checked ? 'is-on' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span className="zr-switch-thumb" />
    </button>
  );
}

/** 多选标签组 */
export function ChipGroup<T extends string>({
  values,
  onToggle,
  options,
}: {
  values: T[];
  onToggle: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            onClick={() => onToggle(o.value)}
            className={`zr-btn border px-2.5 py-1 text-[12px] ${
              on
                ? 'border-brand bg-brand-100 font-medium text-brand'
                : 'border-line bg-surface text-ink-400 hover:border-line-strong hover:text-ink-700'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 展示                                                                */
/* ------------------------------------------------------------------ */

const BADGE_TONE = {
  neutral: 'bg-surface-2 text-ink-700',
  brand: 'bg-brand-100 text-brand',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[10px] tracking-wide ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'brand' | 'success';
}) {
  const color = tone === 'brand' ? 'text-brand' : tone === 'success' ? 'text-success' : 'text-ink-900';
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-2 px-3 py-2">
      <span className="text-[10px] tracking-wide text-ink-400">{label}</span>
      <span className={`zr-num truncate text-[17px] font-semibold ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-ink-300">{sub}</span>}
    </div>
  );
}

/** 提示条：校验告警与建议理由共用，语义色只表状态 */
export function Note({
  level,
  tag,
  children,
  evidence,
}: {
  level: 'info' | 'warn';
  tag?: string;
  children: ReactNode;
  evidence?: string;
}) {
  const warn = level === 'warn';
  return (
    <div
      className={`flex gap-2 rounded-lg border-l-2 px-2.5 py-1.5 text-[12px] leading-relaxed ${
        warn ? 'border-warning bg-warning-bg' : 'border-info bg-info-bg'
      }`}
    >
      {tag && <span className="zr-num shrink-0 pt-px text-[10px] text-ink-400">{tag}</span>}
      <div className="min-w-0">
        <div className={warn ? 'text-ink-700' : 'text-ink-700'}>{children}</div>
        {evidence && <div className="zr-num text-[10px] text-ink-400">{evidence}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center px-6 py-10 text-center text-[12px] leading-relaxed text-ink-300">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 主题切换                                                            */
/* ------------------------------------------------------------------ */

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
      aria-label={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
      className="zr-btn zr-btn-ghost h-8 w-8 shrink-0 p-0"
    >
      {theme === 'dark' ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
