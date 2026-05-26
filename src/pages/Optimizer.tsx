import { useEffect, useMemo, useState } from 'react';
import { fetchBoard, BoardResponse, BoardPart, BoardStage, PlantKey } from '../api';
import { rs, rsExact, qty } from '../format';
import { ChevronLeft, RotateCcw, Crown, AlertTriangle, ArrowRight, ArrowUpDown } from 'lucide-react';
import { SupplierOverview, computeOverview } from '../components/SupplierOverview';
import { BrandFooter } from '../components/BrandFooter';

type SortKey = 'tier' | 'qtyDesc' | 'qtyAsc' | 'spendDesc' | 'spendAsc' | 'partAsc';
type Alloc = Record<string, Record<string, number>>;
const allocKey = (stage: string, partNo: string) => `${stage}::${partNo}`;

type StageKey = 'GS' | 'CS' | 'HS';

export function Optimizer({ plant, navigate }: { plant: PlantKey; navigate: (p: string) => void }) {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<StageKey>('HS');
  const [alloc, setAlloc] = useState<Alloc>({});
  const [draggedCard, setDraggedCard] = useState<{ partNo: string; supplier: string } | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    fetchBoard(plant, 20)
      .then(d => {
        setData(d);
        const init: Alloc = {};
        for (const [stageKey, stageData] of Object.entries(d.stages)) {
          if (!stageData) continue;
          for (const p of stageData.parts) {
            init[allocKey(stageKey, p.partNo)] = { ...p.recommendedAlloc };
          }
        }
        setAlloc(init);
      })
      .catch(e => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [plant]);

  useEffect(() => {
    if (data && data.stages && !data.stages[stage]) {
      const first = Object.keys(data.stages)[0] as StageKey | undefined;
      if (first) setStage(first);
    }
  }, [data, stage]);

  const stageData = data?.stages[stage];

  const rollups = useMemo(() => {
    if (!stageData) return { perSupplier: {}, totalSpend: 0 };
    const perSupplier: Record<string, { qty: number; spend: number }> = {};
    let totalSpend = 0;
    for (const sup of stageData.suppliers) perSupplier[sup.name] = { qty: 0, spend: 0 };
    for (const p of stageData.parts) {
      const allocForPart = alloc[allocKey(stage, p.partNo)] || {};
      for (const [sup, q] of Object.entries(allocForPart)) {
        const rate = p.rates[sup] || 0;
        if (!perSupplier[sup]) perSupplier[sup] = { qty: 0, spend: 0 };
        perSupplier[sup].qty += q;
        perSupplier[sup].spend += q * rate;
        totalSpend += q * rate;
      }
    }
    return { perSupplier, totalSpend };
  }, [stageData, alloc]);

  const stageBaselines = useMemo(() => {
    if (!stageData) return { sq: 0, rec: 0, max: 0 };
    let sq = 0, rec = 0, max = 0;
    for (const p of stageData.parts) {
      for (const [s, q] of Object.entries(p.statusQuoAlloc))   sq  += q * (p.rates[s] || 0);
      for (const [s, q] of Object.entries(p.recommendedAlloc)) rec += q * (p.rates[s] || 0);
      for (const [s, q] of Object.entries(p.maxSavingsAlloc))  max += q * (p.rates[s] || 0);
    }
    return { sq, rec, max };
  }, [stageData]);

  const supplierOverview = useMemo(() => computeOverview(data, alloc), [data, alloc]);

  const allStageTotals = useMemo(() => {
    if (!data) return { current: 0, sq: 0, rec: 0, max: 0 };
    let current = 0, sq = 0, rec = 0, max = 0;
    for (const [stageKey, stData] of Object.entries(data.stages)) {
      if (!stData) continue;
      for (const p of stData.parts) {
        for (const [s, q] of Object.entries(p.statusQuoAlloc))   sq  += q * (p.rates[s] || 0);
        for (const [s, q] of Object.entries(p.recommendedAlloc)) rec += q * (p.rates[s] || 0);
        for (const [s, q] of Object.entries(p.maxSavingsAlloc))  max += q * (p.rates[s] || 0);
        const a = alloc[allocKey(stageKey, p.partNo)] || {};
        for (const [s, q] of Object.entries(a)) current += q * (p.rates[s] || 0);
      }
    }
    return { current, sq, rec, max };
  }, [data, alloc]);

  function resetTo(scenario: 'sq' | 'rec' | 'max') {
    if (!data) return;
    const next: Alloc = {};
    for (const [stageKey, stData] of Object.entries(data.stages)) {
      if (!stData) continue;
      for (const p of stData.parts) {
        next[allocKey(stageKey, p.partNo)] = { ...(
          scenario === 'sq'  ? p.statusQuoAlloc :
          scenario === 'rec' ? p.recommendedAlloc :
                               p.maxSavingsAlloc
        ) };
      }
    }
    setAlloc(next);
  }

  function handleDrop(targetSupplier: string) {
    if (!draggedCard) return;
    const { partNo, supplier: fromSupplier } = draggedCard;
    if (fromSupplier === targetSupplier) { setDraggedCard(null); return; }
    const part = stageData?.parts.find(p => p.partNo === partNo);
    if (!part) { setDraggedCard(null); return; }
    if (!(targetSupplier in part.rates)) { setDraggedCard(null); return; }
    const key = allocKey(stage, partNo);
    setAlloc(prev => {
      const partAlloc = { ...(prev[key] || {}) };
      const moveQty = partAlloc[fromSupplier] || 0;
      if (moveQty <= 0) return prev;
      partAlloc[fromSupplier] = 0;
      partAlloc[targetSupplier] = (partAlloc[targetSupplier] || 0) + moveQty;
      return { ...prev, [key]: partAlloc };
    });
    setDraggedCard(null);
  }

  function moveTo(partNo: string, fromSupplier: string, toSupplier: string) {
    if (fromSupplier === toSupplier) return;
    const part = stageData?.parts.find(p => p.partNo === partNo);
    if (!part) return;
    if (!(toSupplier in part.rates)) return;
    const key = allocKey(stage, partNo);
    setAlloc(prev => {
      const partAlloc = { ...(prev[key] || {}) };
      const moveQty = partAlloc[fromSupplier] || 0;
      if (moveQty <= 0) return prev;
      partAlloc[fromSupplier] = 0;
      partAlloc[toSupplier] = (partAlloc[toSupplier] || 0) + moveQty;
      return { ...prev, [key]: partAlloc };
    });
  }

  const plantLabel = plant === 'inja' ? 'Chennai' : 'Jamshedpur';
  const savingsVsSq = allStageTotals.sq - allStageTotals.current;
  const savingsPct = allStageTotals.sq > 0 ? (savingsVsSq / allStageTotals.sq) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 no-print shadow-sm">
        <div className="max-w-[1500px] mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <a href="/" className="flex-none">
              <img src="/timken-logo.png" alt="Timken" className="h-7" />
            </a>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <button onClick={() => navigate('/')} className="hover:text-slate-900 inline-flex items-center gap-1">
                <ChevronLeft size={14} /> AI Decision Support
              </button>
              <span className="text-slate-300">/</span>
              <button onClick={() => navigate('/rings')} className="hover:text-slate-900">Rings</button>
              <span className="text-slate-300">/</span>
              <button onClick={() => navigate(plant === 'inja' ? '/inja' : '/jsr')} className="hover:text-slate-900">{plantLabel}</button>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-medium">Optimizer</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => resetTo('sq')}
                    className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 ring-1 ring-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1">
              <RotateCcw size={12} /> Reset · Status Quo
            </button>
            <button onClick={() => resetTo('rec')}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-flex items-center gap-1">
              <Crown size={12} /> Reset · Recommended
            </button>
            <button onClick={() => resetTo('max')}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 inline-flex items-center gap-1">
              <AlertTriangle size={12} /> Reset · Best-Case
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 py-6">
        <header className="mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Sourcing Strategy Optimizer · {plantLabel}</div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Drag parts between supplier buckets · watch savings update live</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pre-populated with the recommended (volume-preserving) allocation. Drag any card to a different supplier in the same stage to fine-tune.
          </p>
        </header>

        {err && <div className="mb-4 p-3 rounded-md bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">{err}</div>}

        {data && <SupplierOverview overview={supplierOverview} />}

        {/* Hero stat band */}
        <div
          className="relative mb-7 rounded-2xl overflow-hidden"
          style={{
            boxShadow: savingsVsSq > 0
              ? '0 0 0 1px rgba(16,185,129,0.5), 0 0 40px rgba(16,185,129,0.25), 0 25px 50px -12px rgba(15,23,42,0.5)'
              : savingsVsSq < 0
                ? '0 0 0 1px rgba(244,63,94,0.5), 0 0 40px rgba(244,63,94,0.25), 0 25px 50px -12px rgba(15,23,42,0.5)'
                : '0 0 0 1px rgba(148,163,184,0.4), 0 25px 50px -12px rgba(15,23,42,0.4)',
          }}
        >
          <div className="relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="absolute inset-0 opacity-[0.08]"
              style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative px-7 py-5 text-white">
              {!data ? (
                <div className="h-16 bg-white/10 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-2xs font-bold tracking-[0.25em] uppercase text-slate-400 mb-3">
                    Live Allocation Status · all values are TOTAL SPEND under each scenario (lower = better)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <HeroStat label="Status Quo · Spend" value={rs(allStageTotals.sq)} sub="current GRN allocation (baseline)" />
                    <HeroStat label="Recommended · Spend" value={rs(allStageTotals.rec)}
                      sub={`saves ${rs(Math.max(0, allStageTotals.sq - allStageTotals.rec))} · 20% supplier-growth cap`} tone="emerald" />
                    <HeroStat label="Best-Case · Spend" value={rs(allStageTotals.max)}
                      sub={`saves ${rs(Math.max(0, allStageTotals.sq - allStageTotals.max))} · uncapped (theoretical floor)`} tone="amber" />
                    <HeroStat label="Your Allocation · Spend" value={rs(allStageTotals.current)} sub="live (drag cards to change)" tone="white" />
                    <HeroStat
                      label="Your Saving vs Status Quo"
                      value={(savingsVsSq >= 0 ? '+' : '−') + rs(Math.abs(savingsVsSq))}
                      sub={`${savingsPct >= 0 ? '+' : ''}${savingsPct.toFixed(1)}% of baseline spend`}
                      tone={savingsVsSq > 0 ? 'emerald' : savingsVsSq < 0 ? 'rose' : 'white'}
                      big
                    />
                  </div>
                </>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-black/40" />
          </div>
        </div>

        {/* Stage tabs — GS (sky) / CS (purple) / HS (orange) */}
        {data && (
          <div className="mb-4 flex items-center gap-2 no-print">
            <span className="text-2xs font-semibold tracking-wide uppercase text-slate-500 mr-1">Stage</span>
            {(Object.keys(data.stages) as StageKey[]).map(s => (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md ring-1 ${stage === s
                  ? (s === 'GS' ? 'bg-sky-700 text-white ring-sky-700'
                    : s === 'CS' ? 'bg-purple-700 text-white ring-purple-700'
                    : 'bg-orange-700 text-white ring-orange-700')
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
              >
                {s === 'GS' ? 'Green State (GS)' : s === 'CS' ? 'Carburized State (CS)' : 'Hardened State (HS)'}
                {' '}<span className="opacity-70 text-xs">· {data.stages[s]?.parts.length || 0} parts</span>
              </button>
            ))}
          </div>
        )}

        {loading || !stageData ? (
          <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : (
          <KanbanBoard
            stage={stage}
            stageData={stageData}
            alloc={alloc}
            rollups={rollups}
            stageBaselines={stageBaselines}
            draggedCard={draggedCard}
            setDraggedCard={setDraggedCard}
            handleDrop={handleDrop}
            onMoveTo={moveTo}
          />
        )}

        <footer className="pt-6 text-xs text-slate-400 leading-relaxed border-t border-slate-200 mt-6">
          Each card represents the qty of a specific part currently going to one supplier. Drag to another supplier in the same stage to move all qty.
          Drag is only valid between suppliers who both quote the part at this stage.
          Default state is the recommended greedy allocation at 20% volume tolerance.
        </footer>
        <BrandFooter />
      </div>
    </div>
  );
}

function HeroStat({ label, value, sub, tone, big }: {
  label: string; value: string; sub?: string;
  tone?: 'emerald' | 'amber' | 'white' | 'rose'; big?: boolean;
}) {
  const valueColor = tone === 'emerald' ? 'text-emerald-300'
                   : tone === 'amber'   ? 'text-amber-300'
                   : tone === 'rose'    ? 'text-rose-300'
                   :                       'text-white';
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`${big ? 'text-3xl' : 'text-xl'} font-semibold tabular-nums ${valueColor} mt-0.5`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function KanbanBoard({ stage, stageData, alloc, rollups, stageBaselines, draggedCard, setDraggedCard, handleDrop, onMoveTo }: {
  stage: StageKey;
  stageData: BoardStage;
  alloc: Alloc;
  rollups: { perSupplier: Record<string, { qty: number; spend: number }>; totalSpend: number };
  stageBaselines: { sq: number; rec: number; max: number };
  draggedCard: { partNo: string; supplier: string } | null;
  setDraggedCard: (c: { partNo: string; supplier: string } | null) => void;
  handleDrop: (sup: string) => void;
  onMoveTo: (partNo: string, fromSupplier: string, toSupplier: string) => void;
}) {
  const draggedPart = draggedCard ? stageData.parts.find(p => p.partNo === draggedCard.partNo) : null;

  return (
    <>
      <div className="mb-3 bg-white rounded-lg border border-slate-200 shadow-sm px-4 py-2 flex items-center justify-between text-xs">
        <div className="text-slate-600">
          Stage spend: <span className="font-semibold text-slate-900">{rs(rollups.totalSpend)}</span>{' '}
          (status quo {rs(stageBaselines.sq)} · recommended {rs(stageBaselines.rec)} · max {rs(stageBaselines.max)})
        </div>
        <div className="text-slate-500">
          {stageData.suppliers.length} suppliers · {stageData.parts.length} parts at this stage
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stageData.suppliers.length}, minmax(0, 1fr))` }}>
        {stageData.suppliers.map(sup => {
          const isValidDrop = draggedPart ? (sup.name in draggedPart.rates) : false;
          const isDragging = !!draggedCard;
          return (
            <SupplierColumn
              key={sup.name}
              stage={stage}
              supplier={sup}
              parts={stageData.parts}
              alloc={alloc}
              rollup={rollups.perSupplier[sup.name] || { qty: 0, spend: 0 }}
              isDragging={isDragging}
              isValidDrop={isValidDrop}
              isSelfDrag={draggedCard?.supplier === sup.name}
              onDragStart={(partNo, supplier) => setDraggedCard({ partNo, supplier })}
              onDragEnd={() => setDraggedCard(null)}
              onDropHere={() => handleDrop(sup.name)}
              onMoveTo={onMoveTo}
            />
          );
        })}
      </div>
    </>
  );
}

function SupplierColumn({ stage, supplier, parts, alloc, rollup, isDragging, isValidDrop, isSelfDrag, onDragStart, onDragEnd, onDropHere, onMoveTo }: {
  stage: StageKey;
  supplier: { name: string; baselineQty: number; totalCapacity: number };
  parts: BoardPart[];
  alloc: Alloc;
  rollup: { qty: number; spend: number };
  isDragging: boolean;
  isValidDrop: boolean;
  isSelfDrag: boolean;
  onDragStart: (partNo: string, supplier: string) => void;
  onDragEnd: () => void;
  onDropHere: () => void;
  onMoveTo: (partNo: string, fromSupplier: string, toSupplier: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('tier');

  const cards = useMemo(() => {
    const base = parts.map(p => {
      const qtyHere = (alloc[allocKey(stage, p.partNo)]?.[supplier.name] || 0);
      const sorted = Object.entries(p.rates).sort((a, b) => a[1] - b[1]);
      const myRank = sorted.findIndex(([s]) => s === supplier.name) + 1;
      const n = sorted.length;
      const tier = n === 1 ? 'ONLY' : myRank === 1 ? 'L1' : myRank === n ? 'HIGH' : 'MID';
      const rate = p.rates[supplier.name] || 0;
      return { part: p, qty: qtyHere, tier, rate, spend: qtyHere * rate };
    }).filter(c => c.qty > 0);

    const tierRank: Record<string, number> = { HIGH: 0, MID: 1, L1: 2, ONLY: 3 };
    const sorted = [...base];
    switch (sortKey) {
      case 'qtyDesc':   sorted.sort((a, b) => b.qty - a.qty); break;
      case 'qtyAsc':    sorted.sort((a, b) => a.qty - b.qty); break;
      case 'spendDesc': sorted.sort((a, b) => b.spend - a.spend); break;
      case 'spendAsc':  sorted.sort((a, b) => a.spend - b.spend); break;
      case 'partAsc':   sorted.sort((a, b) => String(a.part.partNo).localeCompare(String(b.part.partNo))); break;
      case 'tier':
      default:          sorted.sort((a, b) => {
        const ra = tierRank[a.tier] ?? 4, rb = tierRank[b.tier] ?? 4;
        if (ra !== rb) return ra - rb;
        return b.qty - a.qty;
      });
    }
    return sorted;
  }, [parts, alloc, supplier.name, sortKey]);

  const capacityPct = supplier.totalCapacity > 0 ? Math.min(200, (rollup.qty / supplier.totalCapacity) * 100) : 0;
  const baselineDeltaPct = supplier.baselineQty > 0 ? ((rollup.qty - supplier.baselineQty) / supplier.baselineQty) * 100 : 0;
  const capBar = capacityPct > 100 ? 'from-rose-400 to-rose-600' : capacityPct > 80 ? 'from-amber-400 to-amber-600' : 'from-emerald-400 to-emerald-600';

  const dropZoneCls = isDragging
    ? (isValidDrop && !isSelfDrag
       ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50 shadow-xl shadow-indigo-200/50 scale-[1.01]'
       : isSelfDrag
         ? 'ring-1 ring-slate-300 opacity-50'
         : 'ring-1 ring-slate-200 opacity-50 grayscale')
    : 'ring-1 ring-slate-200 shadow-md';

  return (
    <div
      className={`bg-white rounded-xl ${dropZoneCls} overflow-hidden flex flex-col transition-all duration-150 ease-out`}
      onDragOver={(e) => { if (isValidDrop && !isSelfDrag) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (isValidDrop && !isSelfDrag) onDropHere(); }}
    >
      <div className="sticky top-0 z-10 px-3 py-3 bg-gradient-to-b from-slate-50 via-white to-slate-50 border-b border-slate-200">
        <div className="text-sm font-bold text-slate-900 truncate" title={supplier.name}>{supplier.name}</div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <div>
            <div className="text-xl font-bold text-slate-900 tabular-nums leading-none tracking-tight">
              {qty(rollup.qty)}<span className="text-2xs text-slate-500 font-medium ml-0.5">pc</span>
            </div>
            <div className="text-2xs text-slate-500 mt-1">
              vs baseline {qty(supplier.baselineQty)}{' '}
              <span className={baselineDeltaPct > 0 ? 'text-emerald-700 font-bold' : baselineDeltaPct < 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}>
                {baselineDeltaPct >= 0 ? '+' : ''}{baselineDeltaPct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-emerald-700 tabular-nums leading-none">{rs(rollup.spend)}</div>
            <div className="text-2xs text-slate-500 mt-1">spend</div>
          </div>
        </div>
        <div className="mt-2.5">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className={`h-full bg-gradient-to-r ${capBar} transition-all duration-300 ease-out`}
              style={{ width: `${Math.min(100, capacityPct)}%`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }} />
          </div>
          <div className="text-2xs text-slate-500 mt-1 flex justify-between">
            <span><strong className="text-slate-700">{capacityPct.toFixed(0)}%</strong> of capacity</span>
            <span>cap {qty(supplier.totalCapacity)}</span>
          </div>
        </div>
        <div className="mt-2 text-2xs text-slate-500 flex items-center justify-between gap-2">
          <span>{cards.length} parts</span>
          {cards.filter(c => c.tier === 'HIGH').length > 0 && (
            <span className="text-rose-700 font-semibold">{cards.filter(c => c.tier === 'HIGH').length} HIGH ⚠</span>
          )}
          <label className="ml-auto inline-flex items-center gap-1 text-2xs text-slate-600 bg-white ring-1 ring-slate-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-50">
            <ArrowUpDown size={10} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
              className="bg-transparent text-2xs cursor-pointer focus:outline-none"
              onMouseDown={e => e.stopPropagation()}>
              <option value="tier">Tier · HIGH↑</option>
              <option value="spendDesc">Spend ↓</option>
              <option value="spendAsc">Spend ↑</option>
              <option value="qtyDesc">Qty ↓</option>
              <option value="qtyAsc">Qty ↑</option>
              <option value="partAsc">Part #</option>
            </select>
          </label>
        </div>
      </div>

      <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '70vh', minHeight: '140px' }}>
        {cards.length === 0 && (
          <div className="text-center text-xs text-slate-400 py-8">No parts allocated</div>
        )}
        {cards.map(c => (
          <PartCard
            key={c.part.partNo}
            part={c.part}
            currentSupplier={supplier.name}
            assignedQty={c.qty}
            tier={c.tier as 'L1' | 'MID' | 'HIGH' | 'ONLY'}
            onDragStart={() => onDragStart(c.part.partNo, supplier.name)}
            onDragEnd={onDragEnd}
            onMoveTo={(toSup) => onMoveTo(c.part.partNo, supplier.name, toSup)}
          />
        ))}
      </div>
    </div>
  );
}

function PartCard({ part, currentSupplier, assignedQty, tier, onDragStart, onDragEnd, onMoveTo }: {
  part: BoardPart;
  currentSupplier: string;
  assignedQty: number;
  tier: 'L1' | 'MID' | 'HIGH' | 'ONLY';
  onDragStart: () => void;
  onDragEnd: () => void;
  onMoveTo: (toSupplier: string) => void;
}) {
  const rate = part.rates[currentSupplier] || 0;
  const spend = assignedQty * rate;
  const sortedRates = Object.entries(part.rates).sort((a, b) => a[1] - b[1]);
  const alternatives = sortedRates
    .filter(([sup]) => sup !== currentSupplier)
    .map(([sup, supRate]) => {
      const tierOfAlt = sortedRates.length === 1 ? 'ONLY'
        : sortedRates[0][0] === sup ? 'L1'
        : sortedRates[sortedRates.length - 1][0] === sup ? 'HIGH'
        : 'MID';
      const isCheaper = supRate < rate;
      const delta = assignedQty * (supRate - rate);
      const deltaPct = rate > 0 ? ((supRate - rate) / rate) * 100 : 0;
      return { sup, supRate, tierOfAlt, isCheaper, delta, deltaPct };
    });

  const tierStyles = {
    L1:   { stripe: 'bg-emerald-500', chip: 'bg-emerald-600 text-white' },
    MID:  { stripe: 'bg-amber-400',   chip: 'bg-amber-500 text-white' },
    HIGH: { stripe: 'bg-rose-500',    chip: 'bg-rose-600 text-white' },
    ONLY: { stripe: 'bg-slate-400',   chip: 'bg-slate-600 text-white' },
  }[tier];

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className="relative bg-gradient-to-b from-white to-slate-50 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg shadow-sm border border-slate-200 overflow-hidden text-xs"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(15,23,42,0.06)' }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${tierStyles.stripe}`} />
      <div className="pl-2.5 pr-2 py-2 leading-tight">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <span className="font-mono font-bold text-slate-900 text-xs">{part.partNo}</span>
          <span className={`px-1.5 py-0 rounded text-2xs font-bold uppercase tracking-wide ${tierStyles.chip}`}>{tier}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs text-slate-500 truncate">{part.rmGrade}</span>
          <span className="text-sm font-semibold text-slate-800 tabular-nums">{rsExact(rate, 2)}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1 text-2xs tabular-nums">
          <div className="bg-white/80 rounded px-1.5 py-1 ring-1 ring-slate-200/80">
            <span className="text-slate-500">Vol </span><span className="font-bold text-slate-800">{qty(assignedQty)}</span>
          </div>
          <div className="bg-white/80 rounded px-1.5 py-1 ring-1 ring-slate-200/80 text-right">
            <span className="text-slate-500">₹ </span><span className="font-bold text-slate-800">{rs(spend)}</span>
          </div>
        </div>
        {alternatives.length > 0 && (
          <div className="mt-2 space-y-1">
            {alternatives.map(a => {
              const cheaper = a.isCheaper;
              const cls = cheaper
                ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 ring-emerald-300 hover:from-emerald-100 hover:to-emerald-200 hover:ring-emerald-400'
                : 'bg-gradient-to-r from-amber-50 to-amber-100 ring-amber-300 hover:from-amber-100 hover:to-amber-200 hover:ring-amber-400';
              const textCls = cheaper ? 'text-emerald-800' : 'text-amber-800';
              const subCls  = cheaper ? 'text-emerald-700' : 'text-amber-700';
              const numCls  = cheaper ? 'font-bold text-emerald-700' : 'font-bold text-amber-700';
              return (
                <button
                  key={a.sup}
                  onClick={(e) => { e.stopPropagation(); onMoveTo(a.sup); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  draggable={false}
                  className={`w-full ring-1 rounded-md px-2 py-1 text-2xs text-left transition-colors flex items-center justify-between gap-1 group ${cls}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`${textCls} font-semibold truncate flex items-center gap-1`}>
                      <span className={`inline-block px-1 py-0 rounded text-[8px] font-bold uppercase ${
                        a.tierOfAlt === 'L1' ? 'bg-emerald-600 text-white'
                        : a.tierOfAlt === 'HIGH' ? 'bg-rose-600 text-white'
                        : a.tierOfAlt === 'MID' ? 'bg-amber-500 text-white'
                        : 'bg-slate-500 text-white'
                      }`}>{a.tierOfAlt}</span>
                      <span className="truncate">{a.sup.split(' ')[0]}</span>
                    </div>
                    <div className={`${subCls} tabular-nums`}>
                      ₹{a.supRate.toFixed(2)}/pc{' · '}
                      {cheaper ? 'save ' : 'cost +'}<span className={numCls}>{rs(Math.abs(a.delta))}</span>{' '}
                      <span className={cheaper ? 'text-emerald-600' : 'text-amber-600'}>
                        ({a.deltaPct >= 0 ? '+' : ''}{a.deltaPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={12} className={`${cheaper ? 'text-emerald-700' : 'text-amber-700'} flex-none group-hover:translate-x-0.5 transition-transform`} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
