import { useMemo, useState } from 'react';
import { extractCharFreq, FALLBACK_SIZES } from '@core/charset';
import type {
  ManualOverride,
  OutputFormat,
  PartitionStrategy,
} from '@core/types';
import { processFont, type ProcessResult } from './api';
import { useTheme } from './useTheme';
import { CharSourcePanel } from './components/CharSourcePanel';
import { FontSourcePanel, type LoadedFont } from './components/FontSourcePanel';
import { StrategyPanel } from './components/StrategyPanel';
import { SizeComparison } from './components/SizeComparison';
import { ChunkTable } from './components/ChunkTable';
import { FontPreview } from './components/FontPreview';
import { OutputPanel } from './components/OutputPanel';
import { Empty, Panel, Stat, ThemeToggle, baseNameFromUrl } from './components/ui';

const DEFAULT_STRATEGY: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 200,
  growth: 1.35,
  maxSize: 800,
  fallback: 'common-3500',
  useFontCmap: true,
  overrides: [],
};

export default function App() {
  const { theme, toggle } = useTheme();
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [text, setText] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [format, setFormat] = useState<OutputFormat[]>(['woff2']);
  const [strategy, setStrategy] = useState<PartitionStrategy>(DEFAULT_STRATEGY);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 字符集规模估算：文本去重 + 兜底字表将追加的量。
  // 全量模式直接取字体 cmap 码位数。
  // 只用于驱动前端实时校验，真实值以服务端返回的 charsetSize 为准。
  const charCount = useMemo(() => {
    if (strategy.useFontCmap && font?.codepoints) return font.codepoints.length;
    return extractCharFreq(text).size + (FALLBACK_SIZES[strategy.fallback] ?? 0);
  }, [text, strategy.fallback, strategy.useFontCmap, font]);

  const totalOut = useMemo(() => {
    if (!result) return 0;
    const f = format[0];
    return result.chunks.reduce(
      (s, c) => s + (c.files[f]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0),
      0,
    );
  }, [result, format]);

  async function runProcess(strat: PartitionStrategy) {
    if (!font) return;
    setError('');
    setBusy(true);
    try {
      setResult(
        await processFont({
          path: font.path,
          text,
          format,
          strategy: strat,
          sampleText: sampleText || text,
        }),
      );
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function doProcess() {
    runProcess(strategy);
  }

  // 分片手动编辑（F2.11）：在自动分片结果之上追加一条 override，
  // 索引始终指向当前可见分片，因此叠加一致。见 PRD §6.3.1。
  function applyOverride(ov: ManualOverride) {
    const next = { ...strategy, overrides: [...(strategy.overrides ?? []), ov] };
    setStrategy(next);
    runProcess(next);
  }
  function pinChars(target: number, chars: string) {
    const list = Array.from(chars.trim());
    if (list.length === 0) return;
    applyOverride({ kind: 'pin', chars: list, to: target });
  }
  function excludeChars(chars: string) {
    const list = Array.from(chars.trim());
    if (list.length === 0) return;
    applyOverride({ kind: 'exclude', chars: list });
  }
  function resetOverrides() {
    const next = { ...strategy, overrides: [] };
    setStrategy(next);
    runProcess(next);
  }

  function toggleFormat(f: OutputFormat) {
    setFormat((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  // 产物下载文件名基于首片 URL 反推基础名（如 FZJinHJW）
  const baseName = baseNameFromUrl(
    result?.chunks[0] ? Object.values(result.chunks[0].files)[0]?.url : undefined,
  );

  return (
    <div className="flex justify-center px-6 py-7">
      <div className="flex w-full max-w-[1440px] flex-col gap-4">
        <header className="flex items-end justify-between gap-4 border-b border-line pb-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="font-song text-[26px] font-bold leading-none tracking-wide text-ink-900">
              Zitrange
            </h1>
            <p className="text-[11px] text-ink-400">
              中文字体分包与优化 · 本地运行，字体文件全程不出本机
            </p>
          </div>

          <div className="flex shrink-0 items-end gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="zr-eyebrow">ENGINE</span>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    busy ? 'zr-dot-live bg-brand' : 'bg-success'
                  }`}
                />
                {busy ? '处理中' : '就绪'}
              </span>
            </div>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </header>

        {error && (
          <div className="rounded-lg border-l-2 border-danger bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {error}
          </div>
        )}

        {/* minmax(0,1fr) 而非 1fr：1fr 的最小尺寸是 auto，会被 <pre> 与长
            unicode-range 撑破列宽，吃掉容器右侧 padding。 */}
        <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* ---- 左：配置 ---- */}
          <div className="flex min-w-0 flex-col gap-4">
            <FontSourcePanel font={font} onLoaded={setFont} onError={setError} busy={busy} />
            <CharSourcePanel
              text={text}
              onTextChange={setText}
              sampleText={sampleText}
              onSampleChange={setSampleText}
              useFontCmap={strategy.useFontCmap ?? false}
              onUseFontCmapChange={(v) => setStrategy({ ...strategy, useFontCmap: v })}
              fontCodepoints={font?.codepoints.length}
            />
            <StrategyPanel
              font={font}
              charCount={charCount}
              strategy={strategy}
              onStrategy={setStrategy}
              format={format}
              onToggleFormat={toggleFormat}
            />

            <button
              type="button"
              className="zr-btn zr-btn-primary w-full py-2.5 text-[13px]"
              onClick={doProcess}
              disabled={busy || !font}
            >
              {busy ? (
                <>
                  <span className="zr-spinner" aria-hidden />
                  处理中…
                </>
              ) : (
                '生成分片'
              )}
            </button>
            {!font && <span className="text-center text-[10px] text-ink-300">先加载一个字体文件</span>}
          </div>

          {/* ---- 右：结果 ---- */}
          <div className="flex min-w-0 flex-col gap-4">
            {font && <FontPreview font={font} />}

            {!result ? (
              <Panel title="结果" delay={180}>
                <Empty>
                  {font ? (
                    <>
                      点击左侧「生成分片」，这里会给出体积对比、分片清单，
                      <br />
                      以及可以直接复制的 @font-face CSS。
                    </>
                  ) : (
                    <>
                      加载字体并生成分片后，这里会给出体积对比、分片清单，
                      <br />
                      以及可以直接复制的 @font-face CSS。
                    </>
                  )}
                </Empty>
              </Panel>
            ) : (
              <>
                <Panel
                  title="体积对比"
                  delay={0}
                  hint={
                    <span className="zr-num">字符集 {result.charsetSize.toLocaleString()} 字</span>
                  }
                >
                  <div className="flex flex-col gap-4">
                    <SizeComparison
                      original={font?.bytes ?? result.font.bytes}
                      total={totalOut}
                      actual={result.simulation ? result.simulation.totalBytes : null}
                      hitIndices={result.simulation?.hitIndices ?? []}
                      chunkCount={result.chunks.length}
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat label="分片数" value={String(result.chunks.length)} />
                      <Stat
                        label="模拟命中"
                        value={
                          result.simulation
                            ? `${result.simulation.hitIndices.length}/${result.chunks.length}`
                            : '—'
                        }
                      />
                      <Stat
                        label="字符覆盖率"
                        value={
                          result.simulation
                            ? `${(result.simulation.coverage * 100).toFixed(1)}%`
                            : '—'
                        }
                        tone="success"
                      />
                      <Stat
                        label="分片合计"
                        value={`${(totalOut / 1024).toFixed(0)} KB`}
                        tone="brand"
                      />
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="分片清单"
                  delay={120}
                  hint={<span className="text-ink-400">高亮行 = 样本文本会命中的片</span>}
                >
                  <ChunkTable
                    chunks={result.chunks}
                    format={format[0]}
                    hitIndices={result.simulation?.hitIndices ?? []}
                    overrides={strategy.overrides}
                    css={result.css}
                    baseName={baseName}
                    onPin={pinChars}
                    onExclude={excludeChars}
                    onReset={resetOverrides}
                  />
                </Panel>

                <Panel title="产物预览" delay={180}>
                  <OutputPanel css={result.css} baseName={baseName} />
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
