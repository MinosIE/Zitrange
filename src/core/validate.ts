import type { FontInfo, OutputFormat, PartitionStrategy, ValidationIssue } from './types';
import { analyzeCoverage } from './coverage';

export interface ValidationInput {
  charCount: number;
  strategy: PartitionStrategy;
  format: OutputFormat[];
  /** 可选：用于校验字符集是否超出字体可用字形 */
  font?: FontInfo;
  /** 可选：字体实际支持的码位集合，用于判定覆盖形态（全量连续 / 稀疏子集） */
  codepoints?: number[];
}

/**
 * 校验用户输入是否「可执行」。
 *
 * 设计上不抛异常、不阻断——中文分片的所有限制都通过 info/warn 提示，
 * 让用户自己权衡（PRD F2.5 的「软上限」哲学）。
 */
export function validate(input: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { charCount, strategy, format, font } = input;
  const codepoints = input.codepoints ?? font?.codepoints;

  // 覆盖形态判定：全量连续 CJK 字体适合「常用字优先」2 片短 range 方案；
  // 稀疏子集字体无论如何都压不出短 range，提前提示避免误解。
  const coverage =
    codepoints && codepoints.length > 0 ? analyzeCoverage(codepoints) : null;

  if (coverage?.isFullContiguous) {
    issues.push({
      id: 'I_FULL_CJK',
      level: 'info',
      text: `检测到完整连续 CJK 字体（覆盖基本区 ${Math.round(coverage.cjkRatio * 100)}%），建议用「常用字优先」模式：仅 2 片、unicode-range 极短。`,
    });
  } else if (coverage?.isSparse) {
    issues.push({
      id: 'W_SPARSE',
      level: 'warn',
      text: `字体仅含 ${coverage.totalCovered.toLocaleString()} 个散点字形（CJK 密度 ${Math.round(coverage.cjkDensity * 100)}%），unicode-range 将较长且无法压缩为连续区间；如需短 range，请上传完整连续字体。`,
    });
  }

  if (charCount <= 0 && !strategy.useFontCmap) {
    issues.push({
      id: 'E_EMPTY',
      level: 'warn',
      text: '字符集为空，不会生成任何分片。请先提供文本 / 文件 / URL。',
    });
  }

  if (strategy.baseSize < 1) {
    issues.push({ id: 'E_BASE', level: 'warn', text: '每片字数（baseSize）必须 ≥ 1。' });
  }

  if (charCount > 0 && charCount <= strategy.baseSize && !strategy.commonFirst) {
    issues.push({
      id: 'W_ONE_SLICE',
      level: 'warn',
      text: `当前字符数（${charCount}）≤ 每片字数（${strategy.baseSize}），正文将只切出 1 片，相当于整批一次性下载、无按需加载收益。如需懒加载，请调小「每片字数」（如中切 4000 / 细切 1500）或开启「常用字优先」。`,
    });
  }

  if (format.length === 0) {
    issues.push({ id: 'E_FMT', level: 'warn', text: '未选择任何输出格式。' });
  }

  if (format.includes('ttf') && !format.includes('woff2')) {
    issues.push({
      id: 'W_TTF',
      level: 'warn',
      text: '仅输出 TTF 会显著增大体积且无法利用浏览器分片缓存，建议至少保留 woff2。',
    });
  }

  if (font && charCount > font.numGlyphs && !strategy.useFontCmap) {
    issues.push({
      id: 'W_MISS',
      level: 'warn',
      text: '字符集超出源字体字形数，部分字符将缺字回退到其他字体。',
    });
  }

  return issues;
}
