import { useMemo, useState } from 'react';
import type { OutputFormat, PartitionStrategy } from '@core/types';
import {
  inspectFont,
  processFont,
  type ChunkResult,
  type InspectResult,
  type ProcessResult,
} from './api';

const DEFAULT_STRATEGY: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 200,
  growth: 1.35,
  maxSize: 800,
  fallback: 'common-3500',
};

const SAMPLE_TEXT =
  '中文网页字体优化是一种针对中文字体文件体积过大的有效方案。' +
  '通过按使用频率拆分并配合 unicode-range，浏览器只会下载当前页面真正需要的字形，' +
  '首屏不再被迫加载数 MB 的完整字体。';

function fmtKB(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export default function App() {
  const [fontPath, setFontPath] = useState('demo/FZJinHJW.TTF');
  const [info, setInfo] = useState<InspectResult | null>(null);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [sampleText, setSampleText] = useState('');
  const [format, setFormat] = useState<OutputFormat[]>(['woff2']);
  const [strategy, setStrategy] = useState<PartitionStrategy>(DEFAULT_STRATEGY);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const totalOut = useMemo(
    () =>
      result
        ? result.chunks.reduce(
            (s, c) => s + (c.files[format[0]]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0),
            0,
          )
        : 0,
    [result, format],
  );

  async function doInspect() {
    setError('');
    setBusy(true);
    try {
      setInfo(await inspectFont(fontPath));
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function doProcess() {
    setError('');
    setBusy(true);
    try {
      const r = await processFont({
        path: fontPath,
        text,
        format,
        strategy,
        sampleText: sampleText || text,
      });
      setResult(r);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function toggleFormat(f: OutputFormat) {
    setFormat((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">中文字体子集化工具</h1>
        <p className="mt-1 text-sm text-gray-500">
          按使用频率拆分 + unicode-range 按需加载 + woff2 压缩。源字体越完整，节省越可观。
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 字体 */}
      <Section title="1 · 字体">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={fontPath}
            onChange={(e) => setFontPath(e.target.value)}
            placeholder="字体文件路径，如 demo/FZJinHJW.TTF"
          />
          <button
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={doInspect}
            disabled={busy}
          >
            检视
          </button>
        </div>
        {info && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge>字体：{info.family}</Badge>
            <Badge>字形：{info.numGlyphs.toLocaleString()}</Badge>
            <Badge>大小：{fmtKB(info.bytes)}</Badge>
            <Badge>轮廓：{info.outline}</Badge>
            {info.isVariable && <Badge>可变字体</Badge>}
          </div>
        )}
      </Section>

      {/* 字符集来源 */}
      <Section title="2 · 字符集来源（站点文本）">
        <textarea
          className="h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴站点正文 / 导航 / 标题文本……"
        />
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-500">模拟加载用的样本文本（默认同上方）</summary>
          <textarea
            className="mt-2 h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="留空则使用上方文本"
          />
        </details>
      </Section>

      {/* 策略 */}
      <Section title="3 · 输出格式与分片策略">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="输出格式">
            <div className="flex gap-3">
              {(['woff2', 'woff', 'ttf'] as OutputFormat[]).map((f) => (
                <label key={f} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={format.includes(f)} onChange={() => toggleFormat(f)} />
                  {f}
                </label>
              ))}
            </div>
          </Field>
          <Field label="分片模式">
            <select
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={strategy.mode}
              onChange={(e) => setStrategy({ ...strategy, mode: e.target.value as any })}
            >
              <option value="hybrid">频次递增（推荐）</option>
              <option value="frequency">固定频次</option>
              <option value="site">整站一锅</option>
            </select>
          </Field>
          <Field label="单片字数 baseSize">
            <NumberInput value={strategy.baseSize} onChange={(v) => setStrategy({ ...strategy, baseSize: v })} />
          </Field>
          <Field label="递增系数 growth">
            <NumberInput
              value={strategy.growth}
              step={0.05}
              onChange={(v) => setStrategy({ ...strategy, growth: v })}
            />
          </Field>
          <Field label="单片上限 maxSize">
            <NumberInput value={strategy.maxSize} onChange={(v) => setStrategy({ ...strategy, maxSize: v })} />
          </Field>
          <Field label="兜底字表">
            <select
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={strategy.fallback}
              onChange={(e) => setStrategy({ ...strategy, fallback: e.target.value as any })}
            >
              <option value="none">不兜底</option>
              <option value="common-3500">常用字前 3500</option>
              <option value="common-7000">常用字前 7000</option>
              <option value="gb2312">GB2312 全集</option>
            </select>
          </Field>
        </div>
        <button
          className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          onClick={doProcess}
          disabled={busy || !info}
        >
          {busy ? '处理中…' : '生成分片'}
        </button>
      </Section>

      {/* 结果 */}
      {result && (
        <Section title="4 · 结果与建议">
          {result.recommendation.reasons.length > 0 && (
            <div className="mb-4 space-y-2">
              {result.recommendation.reasons.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    r.level === 'warn'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-gray-500">{r.id}</span>{' '}
                  {r.text}
                  <span className="ml-1 text-xs text-gray-400">（{r.evidence}）</span>
                </div>
              ))}
            </div>
          )}

          {result.issues.length > 0 && (
            <div className="mb-4 space-y-1">
              {result.issues.map((i) => (
                <div key={i.id} className="text-sm text-amber-700">
                  ⚠ {i.text}
                </div>
              ))}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="字符集" value={result.charsetSize.toLocaleString() + ' 字'} />
            <Stat label="分片数" value={String(result.chunks.length)} />
            <Stat label="输出合计" value={fmtKB(totalOut)} />
            <Stat
              label="源字体"
              value={info ? fmtKB(info.bytes) : '—'}
              sub={info ? `压缩 ${(info.bytes / Math.max(totalOut, 1)).toFixed(1)}×` : ''}
            />
          </div>

          {result.simulation && (
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Stat label="模拟命中片" value={`${result.simulation.hitIndices.length}/${result.chunks.length}`} />
              <Stat label="模拟传输量" value={fmtKB(result.simulation.totalBytes)} />
              <Stat label="字符覆盖率" value={`${(result.simulation.coverage * 100).toFixed(1)}%`} />
            </div>
          )}

          <h3 className="mb-1 text-sm font-semibold">分片清单</h3>
          <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">unicode-range</th>
                  <th className="px-2 py-1.5 text-right">大小</th>
                </tr>
              </thead>
              <tbody>
                {result.chunks.map((c) => (
                  <ChunkRow key={c.index} chunk={c} format={format[0]} />
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-1 mt-4 text-sm font-semibold">@font-face CSS（可直接复制）</h3>
          <pre className="max-h-72 overflow-auto rounded-md bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
            {result.css}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  step = 1,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      step={step}
      min={1}
      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{children}</span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function ChunkRow({ chunk, format }: { chunk: ChunkResult; format: OutputFormat }) {
  const bytes = chunk.files[format]?.bytes ?? Object.values(chunk.files)[0]?.bytes ?? 0;
  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1.5">{chunk.index}</td>
      <td className="px-2 py-1.5 font-mono text-gray-600">{chunk.unicodeRange}</td>
      <td className="px-2 py-1.5 text-right">{fmtKB(bytes)}</td>
    </tr>
  );
}
