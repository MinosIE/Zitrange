import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'zr-theme';

function resolve(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 主题只改 <html data-theme>，颜色全部走 CSS 变量——
 * 切换时不触发任何组件重挂载，也不会丢失界面状态。
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolve);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(KEY, theme);
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    // 不支持 View Transitions 或用户偏好减少动效时，直接切换（无擦除动画）
    if (typeof doc.startViewTransition !== 'function' || reduce) {
      apply();
      return;
    }

    // 标记擦除方向：明→暗 从左向右斜向，暗→明 从右向左斜向（见 index.css 的 zr-wipe / zr-wipe-rev）
    document.documentElement.dataset.vtDir = theme === 'dark' ? 'to-dark' : 'to-light';
    const vt = doc.startViewTransition(apply);
    // 擦除结束后清理标记：滚动条颜色冻结规则（:root[data-vt-dir]）仅动画期间生效，
    // 避免跟随系统等非 VT 的颜色变化也被延迟。
    vt?.finished.finally(() => {
      document.documentElement.removeAttribute('data-vt-dir');
    });
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
