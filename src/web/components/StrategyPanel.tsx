import { useMemo } from 'react';
import { validate } from '@core/validate';
import type {
  FallbackCharset,
  FontInfo,
  OutputFormat,
  PartitionStrategy,
  StrategyMode,
} from '@core/types';
import { ChipGroup, Dropdown, Field, Note, NumberField, Panel, Segmented, Switch } from './ui';

const MODES: { value: StrategyMode; label: string }[] = [
  { value: 'hybrid', label: '混合' },
  { value: 'frequency', label: '字频' },
  { value: 'site', label: '站点' },
  { value: 'codepoint', label: '码位' },
];

const MODE_HINT: Record<StrategyMode, string> = {
  hybrid: '站点用字优先排前，字频表兜底补全生僻字。兼顾二者，适合大多数站点。',
  frequency: '完全按通用字频降序切分。适合内容不可预知的博客、CMS 与 UGC。',
  site: '只打包扫描到的字符，通常 500–5000 字。适合文案固定的落地页与活动页。',
  codepoint:
    '按码位升序聚类，让每片尽量聚集相邻字，unicode-range 折叠成少量区间（单行更短）。代价：高频字不再集中于小首屏片，F4.3 首屏收益减弱。适合全量字体（cmap 多为连续块）分片。',
};

/**
 * 全量模式（拆分全量字体）下，字符集已含字体全部字形，且「你的网站会出现哪些字」面板里的
 * 文案输入框会被隐藏（不读取任何样本/站点文本）。模式只影响排序优先级，而缺少文本时
 * 唯一可行的排序就是按通用字频，故此处只保留一个选项。
 */
const MODES_FULL: { value: StrategyMode; label: string }[] = [
  { value: 'frequency', label: '按通用字频' },
  { value: 'codepoint', label: '按码位邻近' },
];

const MODE_HINT_FULL =
  '全量模式已包含字体全部字形，且不读取任何样本/站点文本。两种排序：按通用字频（高频字在前，无论页面内容如何都稳定命中前面的片）或按码位邻近（每片聚集相邻字，unicode-range 折叠成少量区间，单行更短）。适合内容不可预知（博客 / UGC / CMS）。';

const FALLBACKS: { value: FallbackCharset; label: string }[] = [
  { value: 'none', label: '不兜底' },
  { value: 'common-3500', label: '常用字前 3500' },
  { value: 'common-7000', label: '常用字前 7000' },
  { value: 'gb2312', label: 'GB2312 全集' },
];

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: 'woff2', label: 'woff2', hint: '默认。比 TTF 小 3–5 倍，覆盖约 97% 浏览器' },
  { value: 'woff', label: 'woff', hint: '需兼容 IE11 / 老 Safari 时追加' },
  { value: 'ttf', label: 'ttf', hint: '无压缩，供原生 App、PDF 内嵌等非 Web 场景' },
];

export function StrategyPanel({
  font,
  charCount,
  strategy,
  onStrategy,
  format,
  onToggleFormat,
  delay = 120,
}: {
  font: FontInfo | null;
  charCount: number;
  strategy: PartitionStrategy;
  onStrategy: (s: PartitionStrategy) => void;
  format: OutputFormat[];
  onToggleFormat: (f: OutputFormat) => void;
  delay?: number;
}) {
  // 切换模式时联动兜底字表：站点强制不兜底，字频不允许为空
  const handleModeChange = (mode: StrategyMode) => {
    const next: PartitionStrategy = { ...strategy, mode };
    if (mode === 'site') next.fallback = 'none';
    else if (mode === 'frequency' && strategy.fallback === 'none') {
      next.fallback = 'common-3500';
    }
    onStrategy(next);
  };

  // 字频模式下，「不兜底」会失去按通用字频覆盖的能力，标注「不推荐」引导但不禁止
  const fallbackOptions = useMemo(
    () =>
      strategy.mode === 'frequency'
        ? FALLBACKS.map((o) => (o.value === 'none' ? { ...o, note: '不推荐' } : o))
        : FALLBACKS,
    [strategy.mode],
  );

  // 校验是 core 里的纯函数，参数一改即时出结论，不打断输入
  const issues = useMemo(
    () => validate({ charCount, strategy, format, font: font ?? undefined }),
    [charCount, strategy, format, font],
  );

  // 全量模式下字符集已含全部字形且不读取文本；排序可选按通用字频或按码位邻近
  const fullMode = !!strategy.useFontCmap;
  const modeOptions = fullMode ? MODES_FULL : MODES;
  const displayMode: StrategyMode = fullMode
    ? modeOptions.some((o) => o.value === strategy.mode)
      ? strategy.mode
      : 'frequency'
    : strategy.mode;
  const modeHint = fullMode ? MODE_HINT_FULL : MODE_HINT[strategy.mode];

  // 紧凑模式（256 块通配符）：默认关闭，保证正确性；开启后由覆盖率阈值控制整块声明
  const compactOn = strategy.compact?.wildcard256 ?? false;
  const compactThreshold = strategy.compact?.coverageThreshold ?? 0.9;
  const handleCompactToggle = (on: boolean) =>
    onStrategy({ ...strategy, compact: { wildcard256: on, coverageThreshold: compactThreshold } });
  const handleCompactThreshold = (v: number) =>
    onStrategy({ ...strategy, compact: { wildcard256: compactOn, coverageThreshold: v } });

  // ASCII 优先片（第 0 片单独成片）：默认开启，保证拉丁/数字/标点首屏局部性
  const asciiFirstOn = strategy.asciiFirst ?? true;
  const handleAsciiFirstToggle = (on: boolean) =>
    onStrategy({ ...strategy, asciiFirst: on });

  return (
    <Panel step="03" title="分片策略" delay={delay}>
      <div className="flex flex-col gap-4">
        <Field label="输出格式">
          <ChipGroup values={format} onToggle={onToggleFormat} options={FORMATS} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Field label="分片模式">
            <Segmented
              value={displayMode}
              onChange={handleModeChange}
              options={modeOptions}
            />
          </Field>
          <span className="text-[10px] leading-snug text-ink-300">{modeHint}</span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="单片字数" hint="默认 500">
            <NumberField
              value={strategy.baseSize}
              onChange={(baseSize) => onStrategy({ ...strategy, baseSize })}
            />
          </Field>
          <Field label="递增系数" hint="1 = 固定分片">
            <NumberField
              value={strategy.growth}
              step={0.05}
              min={0}
              onChange={(growth) => onStrategy({ ...strategy, growth })}
            />
          </Field>
          <Field label="单片上限" hint="默认 1000">
            <NumberField
              value={strategy.maxSize}
              onChange={(maxSize) => onStrategy({ ...strategy, maxSize })}
            />
          </Field>
        </div>

        {strategy.mode === 'codepoint' && (
          <Field label="最大片数" hint="超过则合并相邻段，默认 512">
            <NumberField
              value={strategy.maxChunks ?? 512}
              min={1}
              onChange={(maxChunks) => onStrategy({ ...strategy, maxChunks })}
            />
          </Field>
        )}

        <Field
          label="兜底字表"
          hint={
            strategy.useFontCmap
              ? '全量模式已覆盖 cmap 全部字形，兜底字表不再生效'
              : strategy.mode === 'site'
                ? '站点模式只用你提供的字，不补兜底'
                : '站点未覆盖的字，按通用字频补全'
          }
        >
          <Dropdown
            value={strategy.fallback}
            onChange={(fallback) => onStrategy({ ...strategy, fallback })}
            options={fallbackOptions}
            disabled={strategy.mode === 'site' || strategy.useFontCmap}
          />
        </Field>

        <Field
          label="紧凑模式（unicode-range 折叠）"
          hint="默认关闭。开启后用 256 块通配符缩短单行 range"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-600">256 块通配符（U+XX00-XXFF）</span>
            <Switch checked={compactOn} onChange={handleCompactToggle} label="紧凑模式" />
          </div>
        </Field>

        <Field
          label="ASCII 优先片"
          hint="默认开启。把 ASCII/标点单独成第 0 片，命中率≈100% 且极小，利于首屏"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-600">ASCII/标点单独成首片</span>
            <Switch checked={asciiFirstOn} onChange={handleAsciiFirstToggle} label="ASCII 优先片" />
          </div>
        </Field>

        {compactOn && (
          <>
            <Field
              label="覆盖率阈值"
              hint="块内已含字符占比达到才整块声明；越高越安全，但越短收益越小"
            >
              <NumberField
                value={compactThreshold}
                step={0.05}
                min={0}
                onChange={handleCompactThreshold}
              />
            </Field>
            <Note level="warn">
              通配符会声明字体可能不含的缺口码位：当页面渲染到缺口字时，浏览器找不到字形会回退到下一个字体，可能造成同段落字体不一致。仅在内容封闭 / 静态、可接受回退风险的站点启用。
            </Note>
          </>
        )}

        {issues.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            {issues.map((i) => (
              <Note key={i.id} level={i.level}>
                {i.text}
              </Note>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
