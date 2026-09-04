import { useMemo } from 'react';
import { validate } from '@core/validate';
import type { FallbackCharset, FontInfo, OutputFormat, PartitionStrategy } from '@core/types';
import {
  STRATEGY_PRESET_ORDER,
  applyPreset,
  detectPreset,
  type StrategyPreset,
} from '@core/presets';
import { ChipGroup, Dropdown, Field, Note, NumberField, Panel, Segmented, Switch } from './ui';

/** 三档预设的展示文案（每片字数口径见 @core/presets） */
const PRESET_META: Record<StrategyPreset, { label: string; desc: string }> = {
  fine: {
    label: '细切',
    desc: '每片约 1500 字，片数多、首屏命中更精细，代价是请求数偏多',
  },
  medium: {
    label: '中切',
    desc: '每片约 4000 字（默认），片数与体积折中——即当前默认行为',
  },
  coarse: {
    label: '粗切',
    desc: '每片约 8000 字，@font-face 数量最少，代价是单页要加载的字节更多',
  },
};

const FALLBACKS: { value: FallbackCharset; label: string }[] = [
  { value: 'none', label: '不补全' },
  { value: 'common', label: '补全常用 3500 字' },
];

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: 'woff2', label: 'woff2', hint: '默认。比 TTF 小 3–5 倍，覆盖约 97% 浏览器' },
  { value: 'woff', label: 'woff', hint: '需兼容 IE11 / 老 Safari 时追加' },
  { value: 'ttf', label: 'ttf', hint: '无压缩，供原生 App、PDF 内嵌等非 Web 场景' },
];

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
  // 预设识别：每片字数与三档模板之一完全一致则高亮该档，否则为「自定义」
  const preset = detectPreset(strategy);
  const presetOptions: { value: StrategyPreset | 'custom'; label: string }[] = [
    ...STRATEGY_PRESET_ORDER.map((id) => ({ value: id, label: PRESET_META[id].label })),
    ...(preset === 'custom' ? [{ value: 'custom' as const, label: '自定义' }] : []),
  ];

  // ASCII/标点首屏片（布局轴）：yipai 的 basic 片，开启即「单独成片 + 随页面立即加载」
  const asciiFirstOn = strategy.asciiFirst ?? true;

  // 简介：取向句 + 随当前字符集规模的实时换算（无内容时退回取向句）
  const scaleClause = useMemo(() => {
    if (charCount <= 0) return '';
    const n = charCount.toLocaleString('zh-CN');
    if (strategy.commonFirst) {
      // 常用字优先：常用 3500 独立成片 + 剩余按 baseSize 均匀切片
      const commonCount = Math.min(charCount, 3500);
      const restCount = charCount - commonCount;
      const slices =
        Math.ceil(commonCount / strategy.baseSize) +
        Math.ceil(restCount / strategy.baseSize) +
        (asciiFirstOn ? 1 : 0);
      return `按当前约 ${n} 字 → 常用字优先：约 ${slices} 片（常用 3500 独立成片 + 其余按每片 ${strategy.baseSize} 切）`;
    }
    const perSlice = strategy.baseSize;
    const slices = Math.max(1, Math.ceil(charCount / perSlice));
    return `按当前约 ${n} 字 → 约 ${slices} 片、单片约 ${perSlice} 字`;
  }, [charCount, strategy.baseSize, strategy.commonFirst, asciiFirstOn]);

  const presetHint = useMemo(() => {
    const base =
      preset === 'custom'
        ? '已手动调整每片字数，不再匹配三档预设；点选上方任一档可一键恢复。'
        : PRESET_META[preset].desc;
    return scaleClause ? `${base}。${scaleClause}` : base;
  }, [preset, scaleClause]);

  const handleAsciiFirst = (on: boolean) =>
    onStrategy({ ...strategy, asciiFirst: on, asciiAlwaysLoad: on });
  const asciiHint = !asciiRelevant
    ? '当前字符集不含 ASCII/标点，此选项无作用'
    : asciiFirstOn
      ? 'ASCII/标点成独立首屏片并随页面立即加载（yipai 的 basic 片），命中率≈100%'
      : 'ASCII/标点并入正文片，片数更少，但首屏局部性收益减弱';

  // 校验是 core 里的纯函数，参数一改即时出结论，不打断输入
  const issues = useMemo(
    () =>
      validate({
        charCount,
        strategy,
        format,
        font: font ?? undefined,
        codepoints: font?.codepoints,
      }),
    [charCount, strategy, format, font],
  );

  // 「仅 1 片」属非阻断提示，弱化为标题后的「?」浮层，避免抢占底部告警区
  const oneSliceIssue = issues.find((i) => i.id === 'W_ONE_SLICE');
  const otherIssues = issues.filter((i) => i.id !== 'W_ONE_SLICE');

  const fullMode = !!strategy.useFontCmap;

  // 「补全常用 3500 字」与「常用字优先」都涉及 3500 字但维度不同（前者补字、后者分片），
  // 同开时在开关旁显式点明区别，避免误以为二者是同一件事。
  const commonFirstHint =
    '决定「怎么切」：把常用 3500 字（U+4E00–U+5BAB）独立成首片优先加载，罕见字片按需懒加载；不增删字符集。' +
    (!fullMode && strategy.fallback === 'common'
      ? '与上方「补全常用 3500 字」区分：那是往字符集补字（切哪些字），本开关只决定分片顺序。'
      : '');

  return (
    <Panel step="03" title="分片策略" tip={oneSliceIssue?.text} delay={delay}>
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

        <Field label="每片字数" hint="按码位均匀切片，默认 4000">
          <NumberField
            value={strategy.baseSize}
            onChange={(baseSize) => onStrategy({ ...strategy, baseSize })}
          />
        </Field>

        <Field label="ASCII/标点首屏片" hint={asciiHint}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-600">独立成首屏片（basic 片）</span>
            <Switch
              checked={asciiFirstOn}
              onChange={handleAsciiFirst}
              label="ASCII/标点首屏片"
              disabled={!asciiRelevant}
            />
          </div>
        </Field>

        <Field label="常用字优先 · 怎么切" hint={commonFirstHint}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-600">常用 3500 字独立成首片</span>
            <Switch
              checked={strategy.commonFirst ?? false}
              onChange={(on) => onStrategy({ ...strategy, commonFirst: on })}
              label="常用字优先"
            />
          </div>
        </Field>

        {!fullMode && (
          <Field
            label="兜底字表 · 切哪些字"
            hint="决定「切哪些字」：把你输入的字之外的常用 3500 字补进字符集，防止缺字；不影响分片方式。选「不补全」则只切你输入的字。"
          >
            <Dropdown
              value={strategy.fallback}
              onChange={(fallback) => onStrategy({ ...strategy, fallback })}
              options={FALLBACKS}
            />
          </Field>
        )}

        {otherIssues.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            {otherIssues.map((i) => (
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
