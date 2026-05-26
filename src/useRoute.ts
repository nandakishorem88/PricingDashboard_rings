import { useEffect, useState, useCallback } from 'react';

export function useRoute() {
  const [path, setPath] = useState<string>(typeof window !== 'undefined' ? window.location.pathname : '/');

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = useCallback((p: string) => {
    if (window.location.pathname === p) return;
    window.history.pushState({}, '', p);
    setPath(p);
    window.scrollTo(0, 0);
  }, []);

  return { path, navigate };
}
