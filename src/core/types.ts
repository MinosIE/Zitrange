/** Unicode 码位 */
export type Codepoint = number;

/** 码位 -> 出现次数 */
export type CharFreq = Map<Codepoint, number>;

export type SourceKind = 'text' | 'files' | 'url' | 'builtin';

export type StrategyMode = 'site' | 'frequency' | 'hybrid' | 'codepoint';

/** 兜底字表档位。数字表示取字表前 N 字 */
export type FallbackCharset = 'none' | 'common-3500' | 'common-7000' | 'gb2312';

export type OutputFormat = 'woff2' | 'woff' | 'ttf';

export type FontDisplay = 'swap' | 'block' | 'fallback' | 'optional';

export interface PartitionStrategy {
  mode: StrategyMode;
  /** 目标单片字数，默认 200 */
  baseSize: number;
  /** 递增系数，默认 1.35；传 1 表示固定分片 */
  growth: number;
  /** 递增上限，默认 800 */
  maxSize: number;
  fallback: FallbackCharset;
  /** 拆分全量字体：用字体 cmap 的全部码位作为字符集，绕过兜底字表上限 */
  useFontCmap?: boolean;
  /**
   * 是否把 ASCII/标点单独成第 0 片（PRD F2.4），默认 true。
   * 关闭后这些字符并入正文片、第 0 片不再单独存在；
   * 代价：拉丁/数字/标点的首屏局部性收益减弱（它们不再稳定先于正文片加载）。
   */
  asciiFirst?: boolean;
  /** 手动编辑，按顺序作用在自动分片结果之上 */
  overrides?: ManualOverride[];
  /**
   * 仅 mode='codepoint' 生效：片数硬上限。
   * 字符集极度分散（几乎无连续段）时每片退化为单字、片数暴涨，
   * 用此上限把相邻段合并以控制 @font-face 数量（合并后的片 range 会变长，属可接受退化）。
   */
  maxChunks?: number;
  /**
   * 紧凑模式（unicode-range 折叠，PRD §6.4）。默认不设置以保证正确性。
   * 开启后对每个 256 码位对齐块：若该块内已含字符占比 ≥ coverageThreshold，
   * 则把该块整体声明为 U+XX00-XXFF（含字体可能不存在的缺口码位），以缩短单行 range。
   * 代价：缺口码位被声明为本字体的覆盖范围，当页面真的渲染到缺口字时，
   * 浏览器找不到字形会回退到下一个 font，可能造成同段落字体不一致。
   * 适用：内容封闭 / 静态、可接受回退风险的站点；默认不开启。
   */
  compact?: CompactOptions;
}

/**
 * 紧凑模式配置（见 PartitionStrategy.compact）。
 * 计算发生在管线侧：每个 256 块仅在其「所有已含字符都落在同一片」且
 * 「已含字符占比 ≥ coverageThreshold」时才被整块通配，避免片间 range 重叠。
 */
export interface CompactOptions {
  /** 256 块通配符总开关，默认 false（关闭以保证正确性） */
  wildcard256: boolean;
  /** 覆盖率阈值 0–1，达到才对整块应用通配符，默认 0.9 */
  coverageThreshold: number;
}

export type ManualOverride =
  | { kind: 'merge'; chunks: [number, number] }
  | { kind: 'split'; chunk: number; at: 'median' | number }
  | { kind: 'pin'; chars: string[]; to: number }
  | { kind: 'exclude'; chars: string[] };

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


