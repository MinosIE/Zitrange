import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

/** 拆成「数字 / 单位」，供巨号数字排版使用 */
export function splitBytes(b: number): { value: string; unit: string } {
  if (!Number.isFinite(b) || b <= 0) return { value: '0', unit: 'B' };
  if (b < 1024) return { value: String(b), unit: 'B' };
  if (b < 1048576) return { value: (b / 1024).toFixed(1), unit: 'KB' };
  return { value: (b / 1048576).toFixed(2), unit: 'MB' };
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
      <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-2.5">
        {step && <span className="zr-eyebrow">{step}</span>}
        <h2 className="font-song text-[14px] font-semibold tracking-wide text-paper">{title}</h2>
        {hint && <div className="ml-auto text-[11px] text-paper-mute">{hint}</div>}
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
    <label className="block">
      <span className="mb-1 block text-[11px] tracking-wide text-paper-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] leading-snug text-paper-mute">{hint}</span>}
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
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        className="zr-field zr-num"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {suffix && (
        <span className="zr-num pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-paper-mute">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      className="zr-field"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-800">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 单选分段控件 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-[3px] border border-line bg-ink-900 p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`zr-btn flex-1 px-2 py-1 text-[12px] ${
              on
                ? 'bg-brass-500 font-semibold text-[#2a1c04]'
                : 'text-paper-dim hover:bg-ink-700 hover:text-paper'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
                ? 'border-brass-600 bg-brass-500/12 text-brass-300'
                : 'border-line bg-ink-900 text-paper-mute hover:border-ink-500 hover:text-paper-dim'
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

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brass' | 'jade' | 'danger';
}) {
  const tones = {
    neutral: 'border-line bg-ink-800 text-paper-dim',
    brass: 'border-brass-700/60 bg-brass-500/10 text-brass-300',
    jade: 'border-jade-500/50 bg-jade-500/10 text-jade-300',
    danger: 'border-danger-500/50 bg-danger-500/10 text-danger-400',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${tones[tone]}`}
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
  tone?: 'brass' | 'jade';
}) {
  const color = tone === 'brass' ? 'text-brass-400' : tone === 'jade' ? 'text-jade-400' : 'text-paper';
  return (
    <div className="rounded-[3px] border border-line-soft bg-ink-900/60 px-3 py-2">
      <div className="text-[10px] tracking-wide text-paper-mute">{label}</div>
      <div className={`zr-num mt-0.5 text-[17px] font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-paper-mute">{sub}</div>}
    </div>
  );
}

/** 提示条：校验告警与建议理由共用 */
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
      className={`flex gap-2 rounded-[3px] border-l-2 px-2.5 py-1.5 text-[12px] leading-relaxed ${
        warn
          ? 'border-brass-500 bg-brass-500/[0.07] text-brass-300/90'
          : 'border-jade-500/70 bg-jade-500/[0.05] text-paper-dim'
      }`}
    >
      {tag && (
        <span className="zr-num shrink-0 pt-[1px] text-[10px] opacity-60">{tag}</span>
      )}
      <div className="min-w-0">
        <div>{children}</div>
        {evidence && (
          <div className="zr-num mt-0.5 text-[10px] text-paper-mute">{evidence}</div>
        )}
      </div>
    </div>
  );
}

/** 空状态占位 */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center text-[12px] leading-relaxed text-paper-mute">
      {children}
    </div>
  );
}
