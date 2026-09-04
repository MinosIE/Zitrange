import type { FontInfo, OutputFormat, PartitionStrategy, ValidationIssue } from './types';

export interface ValidationInput {
  charCount: number;
  strategy: PartitionStrategy;
  format: OutputFormat[];
  /** 可选：用于校验字符集是否超出字体可用字形 */
  font?: FontInfo;
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
