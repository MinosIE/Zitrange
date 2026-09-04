/** Unicode 码位 */
export type Codepoint = number;

/** 码位 -> 出现次数 */
export type CharFreq = Map<Codepoint, number>;

export type SourceKind = 'text' | 'files' | 'url' | 'builtin';

/** 兜底字表档位。仅「仅用户内容」模式生效，全量模式（拆分全量字体）忽略。 */
export type FallbackCharset = 'none' | 'common';

export type OutputFormat = 'woff2' | 'woff' | 'ttf';

export type FontDisplay = 'swap' | 'block' | 'fallback' | 'optional';

export interface PartitionStrategy {
  /** 每片字数：按码位均匀切片时的固定片大小，默认 4000 */
  baseSize: number;
  /** 兜底字表：仅「仅用户内容」模式生效。'common' = 补全通用常用字表前 3500 字 */
  fallback: FallbackCharset;
  /**
   * 拆分全量字体：用字体 cmap 的全部码位作为字符集，绕过兜底字表上限。
   * 默认 false（仅用户内容）。开启后字符集覆盖整本字形，不依赖字频表。
   */
  useFontCmap?: boolean;
  /**
   * ASCII/标点保底：是否自动把数字、字母、中英文标点等「任何页面都用得到」的字符
   * 注入字符集（受字体支持情况裁剪），默认 true。关闭则只切你输入的字符。
   * 全量模式下 cmap 已含这些字，此选项无额外作用。
   */
  includeAsciiPunct?: boolean;
  /**
   * 是否把 ASCII/标点单独成首屏片（yipai 的 basic 片），默认 true。
   * 关闭后这些字符并入正文片、第 0 片不再单独存在，首屏局部性收益减弱。
   */
  asciiFirst?: boolean;
  /**
   * 首屏片永载：开启（且 asciiFirst 开启）时，ASCII/标点片不写 unicode-range，
   * 浏览器无条件下载，保证首屏零解析成本、立即可用（即 yipai 的 basic 片行为），默认 true。
   */
  asciiAlwaysLoad?: boolean;
  /**
   * 内部安全上限：片数超过则顺序合并相邻段以控制 @font-face 数量，默认 512。
   * 界面不暴露，仅供历史配置与程序化调用。
   */
  maxChunks?: number;
}

export interface Chunk {
  index: number;
  codepoints: Codepoint[];
}

/** 字体元信息，来自 inspect */
export interface FontInfo {
  /** 服务端侧的临时文件标识 */
  id: string;
  fileName: string;
  bytes: number;
  family: string;
  subfamily: string;
  weight: number;
  style: 'normal' | 'italic';
  numGlyphs: number;
  /** 源字体的轮廓类型，决定输出格式（PRD §6.8：不做轮廓转换） */
  outline: 'glyf' | 'cff';
  isVariable: boolean;
  /** 字体在集合文件（.ttc/.otc）中的索引，非集合文件为 0 */
  fontNumber: number;
}

export interface ValidationIssue {
  id: string;
  level: 'info' | 'warn';
  text: string;
}
