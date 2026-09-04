import { useMemo, useState } from 'react';
import { validate } from '@core/validate';
import type {
  FallbackCharset,
  FontInfo,
  OutputFormat,
  PartitionStrategy,
  StrategyMode,
} from '@core/types';
import { STRATEGY_PRESET_ORDER, STRATEGY_PRESETS, applyPreset, detectPreset, estimatePreset, type StrategyPreset } from '@core/presets';
import { ChipGroup, Dropdown, Field, Note, NumberField, Panel, Segmented, Switch } from './ui';

/**
 * 纯输入（未开全量拆分）且选了兜底字表时的分片模式（「不兜底」时整个字段隐藏，见 showMode）。
 * 提供三档：按文本频次（用你文本的频次）、按通用字频（用通用字频表）、按码位邻近（按码位聚类）。
 */
const MODES: { value: StrategyMode; label: string }[] = [
  { value: 'hybrid', label: '按文本频次' },
  { value: 'frequency', label: '按通用字频' },
  { value: 'codepoint', label: '按码位邻近' },
];

const MODE_HINT: Record<StrategyMode, string> = {
  hybrid:
    '按你文本里的出现频次排序，最常用的字进最小首片。文案固定的页面（官网 / 落地页 / 固定菜单）首选，首屏命中率最高。',
  frequency:
    '按通用中文字频降序排序，忽略你的文本频次。适合内容不可预知、样本不具代表性的场景（UGC / 搜索结果）。注意：每片是某一频段的字，码位分散，会展开成几十条~上百条 unicode-range；想要紧凑 range 选另两种模式。',
  codepoint:
    '按码位升序聚类，连续段折叠成单区间，每片通常仅 1 条 unicode-range（单行最短），首屏解析最快。代价：高频字不再集中到小首屏片，首屏局域性收益减弱。',
  block:
    '把字体覆盖的码位区间等分为 N 个连续码块，片数严格 = 目标片数，最可预测；每块 1 条连续 unicode-range。适合需要稳定片数与紧凑 range 的全量拆分。',
  // 'site' 已不再作为界面选项（并入「按文本频次」），保留仅为满足类型，不会被渲染。
  site: '',
};

/**
 * 全量模式（拆分全量字体）下，字符集已含字体全部字形，且样本 / 站点文本输入框被隐藏（不读取任何文本）。
 * 提供三种排序：按通用字频、按码位邻近、按码块均分。
 */
const MODES_FULL: { value: StrategyMode; label: string }[] = [
  { value: 'frequency', label: '按通用字频' },
  { value: 'codepoint', label: '按码位邻近' },
  { value: 'block', label: '按码块均分' },
];

/** 分片尺寸档位：与「单片字数 / 递增系数」互斥，二者不同时出现 */
const SIZE_MODES: { value: 'base' | 'target'; label: string }[] = [
  { value: 'base', label: '按每片字数' },
  { value: 'target', label: '按目标片数' },
];

/** ASCII 首屏片档位：合并原「ASCII 优先片」与「首屏片永载」两个嵌套开关 */
const ASCII_SLICE_MODES: { value: 'inline' | 'first' | 'always'; label: string }[] = [
  { value: 'inline', label: '并入正文' },
  { value: 'first', label: '单独成片' },
  { value: 'always', label: '单独·永载' },
];

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

/** F2.10 三档预设的展示文案（尺寸口径见 @core/presets；数字量级随当前字符集联动，见下方换算） */
const PRESET_META: Record<StrategyPreset, { label: string; desc: string }> = {
  volume: {
    label: '最小体积',
    desc: '首片约 200 字起、按 ×1.4 递增到 1500 封顶：高频字集中在小首片，首屏只下载用到的那几片，传输量最小。',
  },
  balance: {
    label: '均衡',
    desc: '请求数与首屏体积折中，目标 20 片以内——即当前默认行为。',
  },
  requests: {
    label: '最少请求',
    desc: '@font-face 数量最少，目标 8 次请求以内，代价是单页要加载的字节更多。',
  },
};

/**
 * 简介里的「当前规模换算」短句：预设不再是「约 2 万字」式的固定假设，而是
 * 按当前字符集规模（全量 = 字体 cmap 码位数，纯输入 = 文本+兜底字数）实时给出量级。
 * 仅对按字数切分的模式（hybrid / frequency）换算；block 给码块数口径；
 * codepoint 片数由码位连续度决定、无法由字数推断，不换算。
 */
function presetScaleClause(
  preset: StrategyPreset,
  charCount: number,
  mode: StrategyMode,
): string {
  if (charCount <= 0) return '';
  const target = STRATEGY_PRESETS[preset].targetSlices;
  if (mode === 'block') {
    return target && target > 0
      ? `码位跨度均分约 ${target} 个码块（每块字数随字形分布不等）`
      : '';
  }
  if (mode === 'codepoint') return '';
  const n = charCount.toLocaleString('zh-CN');
  const e = estimatePreset(preset, charCount);
  if (e.slices <= 0) return '';
  return e.perSlice
    ? `按当前约 ${n} 字 → 约 ${e.slices} 片、单片约 ${e.perSlice} 字`
    : `按当前约 ${n} 字 → 全部载满约 ${e.slices} 片`;
}

export function StrategyPanel({
  font,
  charCount,
  asciiRelevant,
  strategy,
  onStrategy,
  format,
  onToggleFormat,
  delay = 120,
}: {
  font: FontInfo | null;
  charCount: number;
  asciiRelevant: boolean;
  strategy: PartitionStrategy;
  onStrategy: (s: PartitionStrategy) => void;
  format: OutputFormat[];
  onToggleFormat: (f: OutputFormat) => void;
  delay?: number;
}) {
  // F2.10 预设识别：尺寸参数与三档模板之一完全一致则高亮该档，否则为「自定义」
  const preset = detectPreset(strategy);
  const presetOptions: { value: StrategyPreset | 'custom'; label: string }[] = [
    ...STRATEGY_PRESET_ORDER.map((id) => ({ value: id, label: PRESET_META[id].label })),
    ...(preset === 'custom' ? [{ value: 'custom' as const, label: '自定义' }] : []),
  ];

  // 预设下的说明：取向句 + 随当前字符集规模的实时换算（无内容时退回取向句）
  const presetHint = useMemo(() => {
    if (preset === 'custom') {
      return '尺寸参数已手动调整，不再与三档预设一致；点选上方任一档可一键恢复默认组合。';
    }
    const clause = presetScaleClause(preset, charCount, strategy.mode);
    if (!clause) return PRESET_META[preset].desc;
    return `${PRESET_META[preset].desc.replace(/。$/, '')}；${clause}。`;
  }, [preset, charCount, strategy.mode]);

  // 切换模式不再联动兜底字表：两者已解耦，由 normalizeStrategy 统一约束值域。
  const handleModeChange = (mode: StrategyMode) => onStrategy({ ...strategy, mode });

  // 校验是 core 里的纯函数，参数一改即时出结论，不打断输入
  const issues = useMemo(
    () => validate({ charCount, strategy, format, font: font ?? undefined }),
    [charCount, strategy, format, font],
  );

  // 全量模式：字符集已含全部字形且不读取文本，排序按通用字频 / 码位邻近 / 码块均分。
  // 纯输入且「不兜底」时，字符集就是你输入的字，按文本频次排序恒最优 → 整个字段隐藏。
  const fullMode = !!strategy.useFontCmap;
  const modeOptions = fullMode ? MODES_FULL : MODES;
  const showMode = fullMode || strategy.fallback !== 'none';
  // normalizeStrategy 已保证 mode 落在 modeOptions 内，此处兜底仅作防御
  const displayMode: StrategyMode = modeOptions.some((o) => o.value === strategy.mode)
    ? strategy.mode
    : fullMode
      ? 'frequency'
      : 'hybrid';
  const modeHint = MODE_HINT[displayMode];

  // ASCII/标点保底（内容轴）：是否注入数字/字母/标点；全量模式下为无作用项
  const asciiGuardOn = strategy.includeAsciiPunct ?? true;
  const handleAsciiGuardToggle = (on: boolean) =>
    onStrategy({ ...strategy, includeAsciiPunct: on });

  // ASCII 首屏片（布局轴）：把原「优先片」+「首屏片永载」两个嵌套开关合成三档。
  // 与上面的保底开关正交，故「不注入 + 单独成片」仍可表达（落地页自带英文时有用）。
  const asciiFirstOn = strategy.asciiFirst ?? true;
  const asciiSliceMode: 'inline' | 'first' | 'always' = !asciiFirstOn
    ? 'inline'
    : strategy.asciiAlwaysLoad
      ? 'always'
      : 'first';
  const handleAsciiSliceMode = (m: 'inline' | 'first' | 'always') =>
    onStrategy({
      ...strategy,
      asciiFirst: m !== 'inline',
      asciiAlwaysLoad: m === 'always',
    });
  const asciiSliceHint = !asciiRelevant
    ? '当前字符集不含 ASCII/标点，此选项无作用'
    : asciiSliceMode === 'inline'
      ? 'ASCII/标点并入正文片，片数更少，但首屏局部性收益减弱'
      : asciiSliceMode === 'first'
        ? '把 ASCII/标点单独成第 0 片，命中率≈100% 且极小，利于首屏'
        : '首屏片不写 unicode-range，浏览器无条件下载，保证首屏零解析成本';

  // 分片尺寸：码块模式完全不读 baseSize/growth/maxSize，只提供「码块数量」；
  // 其余模式由 targetSlices 是否 >0 推导当前档位，不新增状态字段。
  const isBlock = strategy.mode === 'block';
  const growth = strategy.growth;
  const targetSlices = strategy.targetSlices ?? 0;
  const handleTargetSlices = (v: number) =>
    onStrategy({ ...strategy, targetSlices: v > 0 ? v : undefined });
  const sizeMode: 'base' | 'target' = isBlock || targetSlices > 0 ? 'target' : 'base';
  const handleSizeMode = (m: 'base' | 'target') =>
    onStrategy(
      m === 'target'
        ? { ...strategy, targetSlices: targetSlices > 0 ? targetSlices : 20 }
        : { ...strategy, targetSlices: undefined },
    );
  const targetHint = isBlock
    ? '均匀码块的块数，片数严格等于该值；0 = 自动推导'
    : strategy.mode === 'codepoint'
      ? '片数上限：段数超过时合并相邻段，控制 @font-face 数量'
      : '按字形总数推导固定每片字数（覆盖单片字数/递增系数），避免大字符集切出几十片';

  // 「高级」折叠：默认收起，只露出 F2.10 三档预设（PRD F2.10 精简决策成本）
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Panel step="03" title="分片策略" delay={delay}>
      <div className="flex flex-col gap-4">
        <Field label="输出格式">
          <ChipGroup values={format} onToggle={onToggleFormat} options={FORMATS} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Field label="策略预设">
            <Segmented
              value={preset}
              onChange={(p) => p !== 'custom' && onStrategy(applyPreset(strategy, p))}
              options={presetOptions}
            />
          </Field>
          <span className="text-[10px] leading-snug text-ink-300">{presetHint}</span>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 self-start text-[11px] text-ink-400 hover:text-ink-700"
        >
          <svg
            viewBox="0 0 12 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
              advancedOpen ? 'rotate-180' : ''
            }`}
          >
            <path d="M1 1.5L6 6.5L11 1.5" />
          </svg>
          {advancedOpen ? '收起高级设置' : '展开高级设置'}
          <span className="text-ink-300">分片模式 · 单片大小 · 兜底字表 · ASCII</span>
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4 border-t border-line pt-3">
            {showMode && (
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
            )}

            {/* 分片尺寸：两种档位互斥，不同时出现；码块模式只提供「码块数量」 */}
            <div className="flex flex-col gap-2.5">
              {!isBlock && (
                <Field label="分片尺寸">
                  <Segmented
                    value={sizeMode}
                    onChange={handleSizeMode}
                    options={SIZE_MODES}
                  />
                </Field>
              )}
              {sizeMode === 'base' ? (
                <div className={`grid gap-2.5 ${growth > 1 ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                      onChange={(g) => onStrategy({ ...strategy, growth: g })}
                    />
                  </Field>
                  {/* 单片上限仅在递增系数 > 1 时有意义：growth<=1 时 chunkSizeAt 直接返回 baseSize */}
                  {growth > 1 && (
                    <Field label="单片上限" hint="默认 1000">
                      <NumberField
                        value={strategy.maxSize}
                        onChange={(maxSize) => onStrategy({ ...strategy, maxSize })}
                      />
                    </Field>
                  )}
                </div>
              ) : (
                <Field label={isBlock ? '码块数量' : '目标片数'} hint={targetHint}>
                  <NumberField
                    value={targetSlices}
                    min={0}
                    onChange={handleTargetSlices}
                  />
                </Field>
              )}
            </div>

            <Field
              label="兜底字表"
              hint={
                strategy.useFontCmap
                  ? '全量模式已覆盖 cmap 全部字形，兜底字表不再生效'
                  : '你输入的字之外，按通用字频补全；选「不兜底」则只切你输入的字'
              }
            >
              <Dropdown
                value={strategy.fallback}
                onChange={(fallback) => onStrategy({ ...strategy, fallback })}
                options={FALLBACKS}
                disabled={strategy.useFontCmap}
              />
            </Field>

            <Field
              label="ASCII/标点保底"
              hint={
                strategy.useFontCmap
                  ? '全量模式已含 ASCII/标点，此选项无额外作用'
                  : '默认关闭，只切你输入的字符。开启会额外注入数字 / 字母 / 中英文标点，保证首屏可渲染'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-ink-600">数字 / 字母 / 标点保底</span>
                <Switch
                  checked={asciiGuardOn}
                  onChange={handleAsciiGuardToggle}
                  label="ASCII/标点保底"
                  disabled={strategy.useFontCmap}
                />
              </div>
            </Field>

            <Field label="ASCII 首屏片" hint={asciiSliceHint}>
              <Segmented
                value={asciiSliceMode}
                onChange={handleAsciiSliceMode}
                options={ASCII_SLICE_MODES}
                disabled={!asciiRelevant}
              />
            </Field>
          </div>
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
