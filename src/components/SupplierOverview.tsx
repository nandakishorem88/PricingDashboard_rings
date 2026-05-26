import { useEffect, useMemo, useState } from 'react';
import { fetchBoard, BoardResponse, PlantKey } from '../api';
import { rs, qty } from '../format';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useCollapsible, CollapseButton } from './useCollapsible';

export const SUPPLIER_PALETTE = [
  { hex: '#0891b2', ring: 'ring-cyan-300',    text: 'text-cyan-700' },
  { hex: '#059669', ring: 'ring-emerald-300', text: 'text-emerald-700' },
  { hex: '#7c3aed', ring: 'ring-violet-300',  text: 'text-violet-700' },
  { hex: '#ea580c', ring: 'ring-orange-300',  text: 'text-orange-700' },
  { hex: '#db2777', ring: 'ring-pink-300',    text: 'text-pink-700' },
];
export function paletteFor(idx: number) { return SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length]; }

export function computeOverview(
  data: BoardResponse | null,
  alloc?: Record<string, Record<string, number>>,
) {
  if (!data) return { total: { baselineQty: 0, baselineSpend: 0, liveQty: 0, liveSpend: 0 }, suppliers: [] };
  const supplierMap: Record<string, { name: string; baselineQty: number; baselineSpend: number; liveQty: number; liveSpend: number }> = {};
  for (const [stageKey, stData] of Object.entries(data.stages)) {
    if (!stData) continue;
    for (const p of stData.parts) {
      for (const [s, q] of Object.entries(p.statusQuoAlloc)) {
        if (!supplierMap[s]) supplierMap[s] = { name: s, baselineQty: 0, baselineSpend: 0, liveQty: 0, liveSpend: 0 };
        supplierMap[s].baselineQty   += q;
        // Use actual GRN invoice amount when available; fall back to qty × rate
        supplierMap[s].baselineSpend += p.actualAmountBySup?.[s] ?? q * (p.rates[s] || 0);
      }
      const a = alloc ? (alloc[`${stageKey}::${p.partNo}`] || {}) : p.statusQuoAlloc;
      for (const [s, q] of Object.entries(a)) {
        if (!supplierMap[s]) supplierMap[s] = { name: s, baselineQty: 0, baselineSpend: 0, liveQty: 0, liveSpend: 0 };
        supplierMap[s].liveQty   += q;
        // Live spend: use price-table rate × allocated qty (forward-looking — no GRN amount for live alloc)
        supplierMap[s].liveSpend += q * (p.rates[s] || 0);
      }
    }
  }
  const suppliers = Object.values(supplierMap).sort((a, b) => b.baselineSpend - a.baselineSpend);
  const total = {
    baselineQty:   suppliers.reduce((a, b) => a + b.baselineQty, 0),
    baselineSpend: suppliers.reduce((a, b) => a + b.baselineSpend, 0),
    liveQty:       suppliers.reduce((a, b) => a + b.liveQty, 0),
    liveSpend:     suppliers.reduce((a, b) => a + b.liveSpend, 0),
  };
  return { total, suppliers };
}

export type OverviewData = ReturnType<typeof computeOverview>;

export function SupplierOverviewAuto({ plant }: { plant: PlantKey }) {
  const [data, setData] = useState<BoardResponse | null>(null);
  useEffect(() => { fetchBoard(plant, 20).then(setData).catch(() => setData(null)); }, [plant]);
  const overview = useMemo(() => computeOverview(data), [data]);
  if (!data) return <div className="h-64 bg-slate-100 animate-pulse rounded-2xl mb-7" />;
  return <SupplierOverview overview={overview} showLive={false} />;
}

export function SupplierOverview({ overview, showLive = true }: {
  overview: OverviewData;
  showLive?: boolean;
}) {
  const [collapsed, toggle] = useCollapsible('supplierOverview');
  const total = overview.total;
  const sups = overview.suppliers;
  const deltaSpend = total.liveSpend - total.baselineSpend;

  const volumeData = sups.map((s, i) => ({
    name: s.name,
    live: showLive ? s.liveQty : s.baselineQty,
    pct: (showLive ? total.liveQty : total.baselineQty) > 0
      ? ((showLive ? s.liveQty : s.baselineQty) / (showLive ? total.liveQty : total.baselineQty)) * 100
      : 0,
    color: paletteFor(i).hex,
  }));

  const spendData = sups.map((s, i) => ({
    name: s.name,
    live: showLive ? s.liveSpend : s.baselineSpend,
    pct: (showLive ? total.liveSpend : total.baselineSpend) > 0
      ? ((showLive ? s.liveSpend : s.baselineSpend) / (showLive ? total.liveSpend : total.baselineSpend)) * 100
      : 0,
    color: paletteFor(i).hex,
  }));

  return (
    <div className="mb-7 space-y-4">
      <div
        className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 30px -10px rgba(15,23,42,0.45), 0 6px 16px -6px rgba(15,23,42,0.35)' }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="absolute pointer-events-none"
             style={{ top: '-50%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '200%',
                      background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 60%)' }} />
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />

        <div className="relative px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div className="absolute top-3 right-3">
            <CollapseButton collapsed={collapsed} toggle={toggle} dark />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-2xs font-bold tracking-[0.25em] uppercase text-slate-400">
              Total Sourcing Value · GR Report · 12 Months
            </div>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl md:text-5xl font-bold tabular-nums text-white tracking-tight">{rs(total.baselineSpend)}</span>
              <span className="text-xs text-slate-300">baseline</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{qty(total.baselineQty)} pc procured · across {sups.length} suppliers</div>
          </div>

          {showLive && (
            <div className="text-right border-l border-slate-700/60 pl-6">
              <div className="text-2xs font-bold tracking-[0.2em] uppercase text-slate-400">Your Live Allocation</div>
              <div className="mt-1 flex items-baseline justify-end gap-2">
                <span className="text-2xl md:text-3xl font-semibold tabular-nums text-white">{rs(total.liveSpend)}</span>
              </div>
              <div className={`mt-0.5 text-xs tabular-nums font-bold ${deltaSpend < 0 ? 'text-emerald-300' : deltaSpend > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                {deltaSpend < 0 ? '↓ saving ' : deltaSpend > 0 ? '↑ extra ' : '— '}
                {rs(Math.abs(deltaSpend))} vs baseline
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 h-px bg-black/40" />
      </div>

      {!collapsed && <>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(sups.length, 1)}, 1fr)` }}>
        {sups.map((s, i) => {
          const p = paletteFor(i);
          const liveDelta = s.liveSpend - s.baselineSpend;
          const livePct = s.baselineSpend > 0 ? (liveDelta / s.baselineSpend) * 100 : 0;
          const baselineSpendShare = total.baselineSpend > 0 ? (s.baselineSpend / total.baselineSpend) * 100 : 0;
          const baselineQtyShare   = total.baselineQty   > 0 ? (s.baselineQty   / total.baselineQty)   * 100 : 0;
          return (
            <div
              key={s.name}
              className={`relative rounded-xl bg-white ring-1 ${p.ring} overflow-hidden`}
              style={{ boxShadow: `0 0 0 1px ${p.hex}1a, 0 4px 16px -4px ${p.hex}33, 0 10px 25px -10px rgba(15,23,42,0.18)` }}
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: p.hex }} />
              <div className="px-3.5 pt-3.5 pb-3.5">
                <div className="text-2xs font-bold uppercase tracking-wider text-slate-500 truncate" title={s.name}>{s.name}</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${p.text} leading-none tracking-tight`}>{baselineSpendShare.toFixed(1)}%</span>
                  <span className="text-2xs font-semibold uppercase tracking-wide text-slate-500">spend share</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                  <div>
                    <div className="text-2xs text-slate-500">Spend</div>
                    <div className="font-semibold tabular-nums text-slate-800">{rs(s.baselineSpend)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xs text-slate-500">Volume · {baselineQtyShare.toFixed(0)}%</div>
                    <div className="font-semibold tabular-nums text-slate-800">{qty(s.baselineQty)} pc</div>
                  </div>
                </div>
                <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, baselineSpendShare)}%`, background: p.hex }} />
                </div>
                {showLive && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-baseline justify-between gap-1">
                    <span className="text-2xs text-slate-500">Live</span>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-800 tabular-nums">{rs(s.liveSpend)}</span>
                      <span className={`ml-1.5 text-2xs tabular-nums font-bold ${liveDelta < 0 ? 'text-emerald-600' : liveDelta > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {liveDelta < 0 ? '−' : liveDelta > 0 ? '+' : ''}{rs(Math.abs(liveDelta))}
                        <span className="opacity-75 ml-0.5">({livePct >= 0 ? '+' : ''}{livePct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DonutCard
          title="Volume share — % of total pieces"
          subtitle={showLive ? 'Live distribution by supplier' : 'GR baseline distribution'}
          data={volumeData}
          valueFormatter={qty}
          unit="pc"
          total={showLive ? total.liveQty : total.baselineQty}
        />
        <DonutCard
          title="Spend share — % of total ₹"
          subtitle={showLive ? 'Live distribution by supplier' : 'GR baseline distribution'}
          data={spendData}
          valueFormatter={rs}
          unit=""
          total={showLive ? total.liveSpend : total.baselineSpend}
        />
      </div>
      </>}
    </div>
  );
}

function DonutCard({ title, subtitle, data, valueFormatter, unit, total }: {
  title: string;
  subtitle: string;
  data: Array<{ name: string; live: number; pct: number; color: string }>;
  valueFormatter: (n: number) => string;
  unit: string;
  total: number;
}) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      <div className="mt-3 grid grid-cols-5 gap-2 items-center">
        <div className="col-span-2 relative" style={{ height: 180 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="live"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                stroke="white"
                strokeWidth={2}
              >
                {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: number, n: string) => [`${valueFormatter(v as number)} ${unit}`.trim(), n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xs uppercase tracking-wide text-slate-400">Total</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">{valueFormatter(total)}</div>
          </div>
        </div>
        <div className="col-span-3 space-y-1.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-3 h-3 rounded-sm flex-none" style={{ background: d.color }} />
              <span className="flex-1 truncate text-slate-700" title={d.name}>{d.name}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{d.pct.toFixed(1)}%</span>
              <span className="text-slate-500 tabular-nums w-20 text-right text-xs">{valueFormatter(d.live)} {unit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
