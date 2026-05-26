import { useEffect, useMemo, useState } from 'react';
import { fetchPriceWinner, PriceWinnerResponse, PriceWinnerPlant, PriceCell, PriceWinnerPart, Stage } from '../api';
import { rs, rsExact, qty, pct } from '../format';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

type PlantKey = 'jsr' | 'inja';

const STAGES: { key: Stage; label: string; descr: string }[] = [
  { key: 'gs', label: 'GS (Green State)',    descr: 'Heading / initial machining only — no carb or hardening' },
  { key: 'cs', label: 'CS (Carb State)',     descr: 'Green state + carburizing' },
  { key: 'hs', label: 'HS (Hardened State)', descr: 'Fully finished — green state + carb + hardening' },
];

export function PriceWinner({ plant }: { plant: PlantKey }) {
  const [data, setData] = useState<PriceWinnerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('hs');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [collapsed, toggle] = useCollapsible('priceWinner');

  useEffect(() => {
    fetchPriceWinner().then(setData).catch(e => setErr(e?.message || String(e)));
  }, []);

  const plantData = data ? data[plant] : null;

  const filtered = useMemo(() => {
    if (!plantData) return [];
    let rows = plantData.parts;
    const term = q.trim().toLowerCase();
    if (term) {
      rows = rows.filter(p => p.partNo.toLowerCase().includes(term) || (p.rmGrade || '').toLowerCase().includes(term));
    } else if (!showAll) {
      rows = rows.slice(0, 25);
    }
    return rows;
  }, [plantData, q, showAll]);

  const enriched = useMemo(
    () => filtered
      .map(p => enrichRow(p, stage))
      .filter(r => Object.keys(r.cells).length > 0),
    [filtered, stage]
  );

  const summary = useMemo(() => {
    let totalCurrent = 0, totalBest = 0, totalSavings = 0, totalQtyVisible = 0, totalDeliveredQty = 0;
    for (const r of enriched) {
      totalCurrent      += r.currentTotal;
      totalBest         += r.bestTotal;
      totalSavings      += r.savings;
      totalQtyVisible   += r.totalQty;
      totalDeliveredQty += r.stageDeliveredQty;
    }
    return { totalCurrent, totalBest, totalSavings, totalQtyVisible, totalDeliveredQty, partsCount: enriched.length };
  }, [enriched]);

  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            2. Price winner — apples-to-apples by stage
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Pick a stage (GS / CS / HS). Only suppliers who deliver that stage are shown.
            {' '}<span className="inline-block px-1 py-0 rounded bg-emerald-100 text-emerald-800 text-2xs font-semibold align-middle">L1</span>
            {' '}<span className="inline-block px-1 py-0 rounded bg-amber-100 text-amber-800 text-2xs font-semibold align-middle">MID</span>
            {' '}<span className="inline-block px-1 py-0 rounded bg-rose-100 text-rose-800 text-2xs font-semibold align-middle">HIGH</span>
            {' '}ranking computed across visible cells only.
          </div>
        </div>
        <CollapseButton collapsed={collapsed} toggle={toggle} />
      </div>

      {err && <div className="m-4 p-3 rounded-md bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">{err}</div>}

      {collapsed ? null : !plantData ? (
        <div className="h-40 bg-slate-50 animate-pulse" />
      ) : (
        <>
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center gap-2 flex-wrap no-print">
            <span className="text-2xs font-semibold tracking-wide uppercase text-slate-500 mr-1">Stage</span>
            {STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                title={s.descr}
                className={`px-3 py-1 text-xs font-semibold rounded-md ring-1 ${stage === s.key ? (
                  s.key === 'gs' ? 'bg-sky-700 text-white ring-sky-700' :
                  s.key === 'cs' ? 'bg-purple-700 text-white ring-purple-700' :
                                   'bg-orange-700 text-white ring-orange-700'
                ) : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
              >{s.label}</button>
            ))}
          </div>

          <div className="bg-emerald-50/40 border-b border-slate-200 px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryStat
              label="Visible parts"
              value={`${summary.partsCount}`}
              sub={`${qty(summary.totalQtyVisible)} pc · ${qty(summary.totalDeliveredQty)} at ${stage.toUpperCase()} delivery`}
            />
            <SummaryStat
              label={`Current spend @ ${stage.toUpperCase()}`}
              value={rs(summary.totalCurrent)}
              sub="qty × this stage's rate, summed"
            />
            <SummaryStat
              label={`If all → L1 @ ${stage.toUpperCase()}`}
              value={rs(summary.totalBest)}
              sub="best within stage"
              tone="good"
            />
            <SummaryStat
              label="Savings opportunity"
              value={rs(summary.totalSavings)}
              sub={summary.totalCurrent > 0 ? `${pct((summary.totalSavings / summary.totalCurrent) * 100, 1)} of stage spend` : '—'}
              tone="hero"
            />
          </div>

          <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2 no-print">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search part no…"
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            {!q && (
              <button
                onClick={() => setShowAll(s => !s)}
                className="px-3 py-1 text-xs font-medium bg-white text-slate-700 ring-1 ring-slate-300 rounded-md hover:bg-slate-50"
              >{showAll ? `Show top 25` : `Show all ${plantData.parts.length}`}</button>
            )}
            <span className="text-xs text-slate-500 ml-2">
              Showing {filtered.length} parts at {stage.toUpperCase()}
            </span>
          </div>

          <PriceWinnerMatrix plantData={plantData} rows={enriched} stage={stage} summary={summary} />
        </>
      )}
    </section>
  );
}

type EnrichedCell = PriceCell & {
  rateAtStage: number | null;
  isDeliverer: boolean;
  totalAtStage: number;
  sharePct: number;
  tier: 'L1' | 'MID' | 'HIGH' | 'ONLY' | null;
};

type EnrichedRow = PriceWinnerPart & {
  cells: Record<string, EnrichedCell>;
  l1Rate: number | null;
  l1Supplier: string | null;
  currentTotal: number;
  bestTotal: number;
  savings: number;
  totalQty: number;
  stageDeliveredQty: number;
  spreadPct: number;
};

function isVisibleAtStage(cell: PriceCell, stage: Stage): boolean {
  if (stage === 'gs') return (cell.rates.gs ?? 0) > 0;
  return cell.deliveredStage === 'HS' || cell.deliveredStage === 'CS';
}

function effectiveRate(cell: PriceCell, stage: Stage): number | null {
  const stageUC = stage.toUpperCase();
  if ((cell.deliveredStage === stageUC) && cell.pricePerPc != null && cell.pricePerPc > 0) {
    return cell.pricePerPc;
  }
  return cell.rates[stage];
}

function enrichRow(p: PriceWinnerPart, stage: Stage): EnrichedRow {
  const cells: Record<string, EnrichedCell> = {};
  const totalQty = p.totalQty || 0;
  let stageDeliveredQty = 0;

  for (const [sup, c] of Object.entries(p.prices)) {
    if (!isVisibleAtStage(c, stage)) continue;
    const rate = effectiveRate(c, stage);
    const q = c.qty || 0;
    stageDeliveredQty += q;
    cells[sup] = {
      ...c,
      rateAtStage: rate,
      isDeliverer: true,
      totalAtStage: rate != null ? q * rate : 0,
      sharePct: totalQty > 0 ? (q / totalQty) * 100 : 0,
      tier: null,
    };
  }

  const sorted = Object.entries(cells)
    .filter(([_, c]) => c.rateAtStage != null && c.rateAtStage > 0)
    .sort(([_, a], [__, b]) => (a.rateAtStage ?? Infinity) - (b.rateAtStage ?? Infinity));

  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    const [sup] = sorted[i];
    if (n === 1) cells[sup].tier = 'ONLY';
    else if (i === 0)     cells[sup].tier = 'L1';
    else if (i === n - 1) cells[sup].tier = 'HIGH';
    else                  cells[sup].tier = 'MID';
  }

  const l1Rate     = sorted.length > 0 ? sorted[0][1].rateAtStage ?? null : null;
  const l1Supplier = sorted.length > 0 ? sorted[0][0] : null;
  const currentTotal = sorted.reduce((acc, [_, c]) => acc + c.totalAtStage, 0);
  const bestTotal    = l1Rate != null ? stageDeliveredQty * l1Rate : currentTotal;
  const savings      = Math.max(0, currentTotal - bestTotal);

  const rates = sorted.map(([_, c]) => c.rateAtStage ?? 0).filter(r => r > 0);
  const min = rates.length ? Math.min(...rates) : 0;
  const max = rates.length ? Math.max(...rates) : 0;
  const spreadPct = min > 0 ? ((max - min) / min) * 100 : 0;

  return {
    ...p,
    cells,
    l1Rate, l1Supplier,
    currentTotal: Math.round(currentTotal),
    bestTotal: Math.round(bestTotal),
    savings: Math.round(savings),
    totalQty,
    stageDeliveredQty,
    spreadPct,
  };
}

function SummaryStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'hero' }) {
  const valueClass = tone === 'hero' || tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

function PriceWinnerMatrix({ plantData, rows, stage, summary }: {
  plantData: PriceWinnerPlant;
  rows: EnrichedRow[];
  stage: Stage;
  summary: { totalCurrent: number; totalBest: number; totalSavings: number };
}) {
  if (rows.length === 0) {
    return <div className="px-6 py-8 text-center text-sm text-slate-400">No parts match the filter.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2.5 sticky left-0 bg-slate-50">Part</th>
            {plantData.suppliers.map(s => (
              <th key={s} className="px-3 py-2.5 text-center min-w-[160px]">
                {plantData.supplierNames?.[s] || s}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right min-w-[110px]">Savings → L1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <MatrixRow key={r.partNo} row={r} plantData={plantData} stage={stage} />
          ))}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
          <tr className="text-xs font-semibold uppercase tracking-wide">
            <td className="px-3 py-2.5 sticky left-0 bg-slate-50 text-slate-700">Total ({rows.length} parts)</td>
            <td colSpan={plantData.suppliers.length} className="px-3 py-2.5 text-right text-slate-600">
              <span className="text-2xs mr-2 text-slate-500">CURRENT @ {stage.toUpperCase()}</span>
              <span className="text-base tabular-nums text-slate-900">{rs(summary.totalCurrent)}</span>
              <span className="mx-3 text-slate-300">→</span>
              <span className="text-2xs mr-2 text-slate-500">AT L1</span>
              <span className="text-base tabular-nums text-emerald-700">{rs(summary.totalBest)}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-base font-bold tabular-nums text-emerald-700">{rs(summary.totalSavings)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MatrixRow({ row, plantData, stage }: { row: EnrichedRow; plantData: PriceWinnerPlant; stage: Stage }) {
  const spreadTone =
    row.spreadPct > 50 ? 'text-rose-700 bg-rose-100' :
    row.spreadPct > 20 ? 'text-amber-700 bg-amber-100' :
                         'text-slate-600 bg-slate-100';
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="px-3 py-2 sticky left-0 bg-white">
        <div className="font-mono text-sm font-semibold text-slate-900">{row.partNo}</div>
        <div className="text-xs text-slate-500">
          {row.rmGrade}
          {row.heatTreatment ? ` · ${row.heatTreatment}` : ''}
        </div>
        {row.totalQty != null && <div className="text-xs text-slate-700 tabular-nums mt-0.5">{qty(row.totalQty)} pc total</div>}
        {row.spreadPct > 0 && (
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-2xs font-semibold tabular-nums ${spreadTone}`}>
            {row.spreadPct.toFixed(0)}% spread
          </span>
        )}
      </td>
      {plantData.suppliers.map(s => (
        <td key={s} className="px-1 py-1">
          <MatrixCell cell={row.cells[s]} stage={stage} />
        </td>
      ))}
      <td className="px-3 py-2 text-right align-middle">
        {row.savings > 0
          ? <>
              <div className="text-base font-semibold text-emerald-700 tabular-nums leading-tight">{rs(row.savings)}</div>
              <div className="text-xs text-slate-500 tabular-nums">{((row.savings / Math.max(row.currentTotal, 1)) * 100).toFixed(0)}% of spend</div>
              {row.l1Rate != null && <div className="text-2xs text-slate-400 mt-0.5">@ {rsExact(row.l1Rate, 2)}/pc</div>}
            </>
          : <span className="text-slate-300 text-xs">—</span>}
      </td>
    </tr>
  );
}

function MatrixCell({ cell, stage }: { cell?: EnrichedCell; stage: Stage }) {
  if (!cell || cell.rateAtStage == null) {
    return <div className="text-center text-slate-300 py-2 text-xs">—</div>;
  }

  const tierStyle: Record<string, { border: string; bg: string; textTone: string; chipClass: string; chipText: string }> = {
    L1:   { border: 'border-emerald-300', bg: 'bg-emerald-50', textTone: 'text-emerald-900',
            chipClass: 'bg-emerald-600 text-white', chipText: 'L1' },
    MID:  { border: 'border-amber-300',   bg: 'bg-amber-50',   textTone: 'text-amber-900',
            chipClass: 'bg-amber-500 text-white',   chipText: 'MID' },
    HIGH: { border: 'border-rose-300',    bg: 'bg-rose-50',    textTone: 'text-rose-900',
            chipClass: 'bg-rose-500 text-white',    chipText: 'HIGH' },
    ONLY: { border: 'border-slate-300',   bg: 'bg-slate-50',   textTone: 'text-slate-800',
            chipClass: 'bg-slate-600 text-white',   chipText: 'ONLY' },
  };
  const t = tierStyle[cell.tier || 'ONLY'];

  return (
    <div className={`border ${t.border} ${t.bg} rounded-md p-2 leading-tight`}>
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className={`px-1.5 py-0 rounded text-2xs font-bold uppercase tracking-wide ${t.chipClass}`}>
          {t.chipText}
        </span>
        <span className={`text-base font-semibold tabular-nums ${t.textTone}`}>
          {rsExact(cell.rateAtStage, 2)}
        </span>
      </div>
      <div className="text-xs tabular-nums text-slate-700 space-y-0.5">
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Vol</span>
          <span>{cell.qty != null && cell.qty > 0 ? `${qty(cell.qty)} pc` : '—'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Spend @ {stage.toUpperCase()}</span>
          <span className="font-medium">{cell.totalAtStage > 0 ? rs(cell.totalAtStage) : '—'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Share</span>
          <span>{cell.sharePct > 0 ? `${cell.sharePct.toFixed(0)}%` : '—'}</span>
        </div>
      </div>
    </div>
  );
}
