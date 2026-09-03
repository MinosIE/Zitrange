/** Unicode 码位 */
export type Codepoint = number;

/** 码位 -> 出现次数 */
export type CharFreq = Map<Codepoint, number>;

export type SourceKind = 'text' | 'files' | 'url' | 'builtin';

export type StrategyMode = 'site' | 'frequency' | 'hybrid';

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
  /** 手动编辑，按顺序作用在自动分片结果之上 */
  overrides?: ManualOverride[];
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

export interface Recommendation {
  strategy: PartitionStrategy;
  format: OutputFormat[];
  reasons: Reason[];
  /** 可一键应用的具体调整（基于当前配置对比得出） */
  suggestions: Suggestion[];
  estimate: {
    chunkCount: number;
    totalSize: number;
    typicalPageLoad: number;
  };
}

export interface Reason {
  /** R1..R7，便于前端做「忽略此建议」 */
  id: string;
  level: 'info' | 'warn';
  text: string;
  /** 支撑该建议的实测数据 */
  evidence: string;
}

/** 一条可应用的智能建议。patch 为声明式增量，由前端合并进当前策略/格式 */
export interface Suggestion {
  id: string;
  level: 'info' | 'warn' | 'success';
  /** 按钮/标题文案 */
  label: string;
  /** 补充说明 */
  detail: string;
  /** 当前配置是否已满足（满足则前端显示「已应用」而非按钮） */
  applied: boolean;
  patch: {
    strategy?: Partial<PartitionStrategy>;
    addFormat?: OutputFormat[];
    removeFormat?: OutputFormat[];
  };
}
