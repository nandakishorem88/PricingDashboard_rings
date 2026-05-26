import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const PREFIX = 'rings-collapsible:';

export function useCollapsible(key: string, defaultCollapsed = false) {
  const storageKey = PREFIX + key;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    try {
      const v = window.localStorage.getItem(storageKey);
      return v === '1' ? true : v === '0' ? false : defaultCollapsed;
    } catch {
      return defaultCollapsed;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch {}
  }, [storageKey, collapsed]);
  const toggle = () => setCollapsed(c => !c);
  return [collapsed, toggle, setCollapsed] as const;
}

export function CollapseButton({ collapsed, toggle, dark = false }: {
  collapsed: boolean;
  toggle: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors flex-none ${
        dark ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-slate-200 text-slate-600'
      }`}
      title={collapsed ? 'Expand section' : 'Collapse section'}
      aria-label={collapsed ? 'Expand section' : 'Collapse section'}
    >
      {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
    </button>
  );
}
