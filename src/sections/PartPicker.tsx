import { useMemo, useState } from 'react';
import { Summary, PartRow } from '../api';
import { PartsTable } from './HighVolumeParts';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

export function PartPicker({ data }: { data: Summary }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [collapsed, toggleCollapsed] = useCollapsible('partPicker');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data.parts.slice(0, 30);
    return data.parts.filter(p =>
      p.partNo.toLowerCase().includes(term) || (p.rmGrade || '').toLowerCase().includes(term)
    ).slice(0, 30);
  }, [data, q]);

  const selectedRows: PartRow[] = useMemo(
    () => selected
      .map(pn => data.parts.find(p => p.partNo === pn))
      .filter((p): p is PartRow => !!p),
    [data, selected]
  );

  function toggle(pn: string) {
    setSelected(s => s.includes(pn) ? s.filter(x => x !== pn) : (s.length >= 10 ? s : [...s, pn]));
    setQ('');
  }

  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            5. Specific parts — pick any to compare in detail
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Search by part number or RM grade. Add up to 10 parts.
          </div>
        </div>
        <CollapseButton collapsed={collapsed} toggle={toggleCollapsed} />
      </div>

      {!collapsed && (<>
      <div className="px-6 py-4 border-b border-slate-200 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search part no / grade…"
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
          />
          {q && (
            <div className="flex flex-wrap gap-1 max-w-full">
              {filtered.map(p => (
                <button
                  key={p.partNo}
                  onClick={() => toggle(p.partNo)}
                  className={`px-2 py-1 text-xs rounded-md ring-1 ${selected.includes(p.partNo) ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                >
                  {p.partNo} <span className="text-slate-400 font-normal">· {p.rmGrade}</span>
                </button>
              ))}
              {filtered.length === 0 && <span className="text-xs text-slate-400">No match.</span>}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Selected:</span>
            {selected.map(pn => (
              <span key={pn} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 ring-1 ring-slate-300 rounded-md font-mono">
                {pn}
                <button onClick={() => toggle(pn)} className="text-slate-500 hover:text-slate-800" aria-label="remove">×</button>
              </span>
            ))}
            <button
              onClick={() => setSelected([])}
              className="ml-2 text-xs text-slate-500 hover:text-slate-800 underline"
            >clear</button>
          </div>
        )}
      </div>

      {selectedRows.length > 0 ? (
        <PartsTable rows={selectedRows} />
      ) : (
        <div className="px-6 py-8 text-center text-sm text-slate-400">
          Pick at least one part above to compare suppliers.
        </div>
      )}
      </>)}
    </section>
  );
}
