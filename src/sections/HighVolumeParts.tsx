import { useMemo, useState } from 'react';
import { Summary, PartRow } from '../api';
import { rs, rsExact, qty, pct } from '../format';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

export function HighVolumeParts({ data }: { data: Summary }) {
  const [topN, setTopN] = useState<number>(10);
  const rows = useMemo(() => data.parts.slice(0, topN), [data, topN]);
  const [collapsed, toggle] = useCollapsible('highVolume');

  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            4. High-volume parts — L1 / L2 / L3 with current allocation
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Sorted by 12-mo procurement volume. Red flags = L1 actual share &lt; 80% of L1 capacity.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <div className="no-print flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Top</span>
              {[10, 20, 50, 100].map(n => (
                <button
                  key={n}
                  onClick={() => setTopN(n)}
                  className={`px-3 py-1 text-xs font-medium rounded-md ring-1 ${topN === n ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                >{n}</button>
              ))}
            </div>
          )}
          <CollapseButton collapsed={collapsed} toggle={toggle} />
        </div>
      </div>
      {!collapsed && <PartsTable rows={rows} />}
    </section>
  );
}

export function PartsTable({ rows }: { rows: PartRow[] }) {
  if (rows.length === 0) {
    return <div className="px-6 py-8 text-center text-sm text-slate-400">No parts to show.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Part / Grade</th>
            <th className="px-3 py-2.5 text-right">12-mo Volume</th>
            <th className="px-3 py-2.5">L1 (cheapest)</th>
            <th className="px-3 py-2.5">L2</th>
            <th className="px-3 py-2.5">L3</th>
            <th className="px-3 py-2.5 text-right">Leakage / yr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const L1 = r.suppliers[0];
            const L2 = r.suppliers[1];
            const L3 = r.suppliers[2];
            const l1Underloaded = L1 && L1.annualCapacity > 0 && L1.actualSharePct < 80 && r.l1OptimalShare > 50;
            return (
              <tr key={r.partNo} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-mono text-sm font-semibold text-slate-900">{r.partNo}</div>
                  <div className="text-xs text-slate-500">{r.rmGrade}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="font-medium text-slate-800">{qty(r.totalQty)} pc</div>
                  <div className="text-xs text-slate-500">spread {pct(r.spreadPct, 0)}</div>
                </td>
                <td className="px-3 py-3"><SupplierCell s={L1} highlight={l1Underloaded ? 'underloaded' : 'best'} /></td>
                <td className="px-3 py-3"><SupplierCell s={L2} /></td>
                <td className="px-3 py-3"><SupplierCell s={L3} /></td>
                <td className="px-3 py-3 text-right">
                  <div className="text-base font-semibold text-rose-700 tabular-nums">{r.leakage > 0 ? rs(r.leakage) : '—'}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SupplierCell({ s, highlight }: { s?: import('../api').SupplierTier; highlight?: 'best' | 'underloaded' }) {
  if (!s) return <span className="text-slate-300">—</span>;
  const isUnderloaded = highlight === 'underloaded';
  const isBest = highlight === 'best';
  return (
    <div className={`leading-tight ${isUnderloaded ? 'bg-rose-50 px-2 py-1 rounded' : ''}`}>
      <div className={`text-xs font-medium ${isBest ? 'text-emerald-700' : 'text-slate-800'}`}>{s.name}</div>
      <div className="text-xs text-slate-700 tabular-nums">{rsExact(s.price, 2)}/pc</div>
      <div className="text-xs tabular-nums">
        <span className={isUnderloaded ? 'font-semibold text-rose-700' : 'text-slate-500'}>
          {pct(s.actualSharePct, 0)} share
        </span>
        {isUnderloaded && <span className="text-rose-700 ml-1">🔴</span>}
      </div>
    </div>
  );
}
