import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, TrendingDown, BarChart2, Users, Search, RefreshCw } from 'lucide-react';
import { fetchGrnBenchmark, BenchmarkPart, BenchmarkResponse, PlantKey } from '../api';
import { rs, qty } from '../format';
import { TopBrand } from '../components/TopBrand';
import { BrandFooter } from '../components/BrandFooter';

// ── helpers ────────────────────────────────────────────────────────────────────

function spreadColor(pct: number) {
  if (pct >= 40) return 'text-red-600 font-bold';
  if (pct >= 20) return 'text-orange-500 font-semibold';
  if (pct >= 10) return 'text-amber-500';
  return 'text-slate-600';
}

function rateBar(rate: number, minRate: number, maxRate: number) {
  const span = maxRate - minRate;
  if (span <= 0) return 100;
  return Math.round(((rate - minRate) / span) * 100);
}

// ── supplier row (inside expanded part) ───────────────────────────────────────

function SupplierRow({ sup, part }: { sup: BenchmarkPart['suppliers'][0]; part: BenchmarkPart }) {
  const barPct = rateBar(sup.effectiveRate, part.minRate, part.maxRate);
  const overshoot = sup.effectiveRate > part.minRate
    ? `+${((sup.effectiveRate / part.minRate - 1) * 100).toFixed(1)}%`
    : null;

  return (
    <tr className={`text-xs border-b border-slate-100 ${sup.isLowest ? 'bg-emerald-50' : 'bg-white'}`}>
      <td className="pl-12 pr-3 py-2">
        <div className="flex items-center gap-2">
          {sup.isLowest && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
              LOWEST
            </span>
          )}
          <span className={sup.isLowest ? 'font-semibold text-slate-800' : 'text-slate-600'}>{sup.vendor}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-slate-500 font-mono text-2xs">{sup.vendorId}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{qty(sup.totalQty)} pc</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{rs(sup.totalAmount, 1)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`tabular-nums font-semibold ${sup.isLowest ? 'text-emerald-700' : 'text-slate-800'}`}>
            ₹{sup.effectiveRate.toFixed(1)}/pc
          </span>
          {overshoot && (
            <span className="text-rose-500 text-2xs font-medium">{overshoot}</span>
          )}
        </div>
        <div className="mt-1 h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${sup.isLowest ? 'bg-emerald-400' : 'bg-rose-400'}`}
            style={{ width: `${Math.max(4, barPct)}%` }}
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {sup.savingsPotential > 0
          ? <span className="text-rose-600 font-semibold">{rs(sup.savingsPotential, 1)}</span>
          : <span className="text-emerald-600 text-xs">—</span>}
      </td>
    </tr>
  );
}

// ── part row ──────────────────────────────────────────────────────────────────

function PartRow({ part, expanded, onToggle }: {
  part: BenchmarkPart;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-slate-50 border-b border-slate-200 text-sm"
      >
        <td className="pl-4 pr-2 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
            <span className="font-semibold text-slate-900 font-mono">{part.partNo}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ring-1 ${
            part.stage === 'GS' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
            part.stage === 'CS' ? 'bg-purple-50 text-purple-700 ring-purple-200' :
            'bg-orange-50 text-orange-700 ring-orange-200'
          }`}>{part.stage}</span>
        </td>
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
            <Users size={12} />{part.supplierCount}
          </span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{qty(part.partTotalQty)} pc</td>
        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{rs(part.partTotalAmount, 1)}</td>
        <td className="px-3 py-3 text-right tabular-nums text-emerald-700 font-medium">₹{part.minRate.toFixed(1)}</td>
        <td className="px-3 py-3 text-right tabular-nums text-slate-600">₹{part.maxRate.toFixed(1)}</td>
        <td className="px-3 py-3 text-right tabular-nums">
          <span className={spreadColor(part.spreadPct)}>{part.spreadPct.toFixed(1)}%</span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          <span className="font-bold text-rose-600">{rs(part.totalSavingsPotential, 1)}</span>
        </td>
      </tr>
      {expanded && part.suppliers.map(sup => (
        <SupplierRow key={sup.vendorId + sup.vendor} sup={sup} part={part} />
      ))}
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function GrnBenchmark({ plant: initPlant, navigate }: {
  plant: PlantKey;
  navigate: (p: string) => void;
}) {
  const [plant, setPlant]         = useState<PlantKey>(initPlant);
  const [data, setData]           = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [stage, setStage]         = useState<'ALL' | 'GS' | 'CS' | 'HS'>('ALL');
  const [search, setSearch]       = useState('');
  const [minSavings, setMinSavings] = useState(0);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  async function load(p: PlantKey) {
    setLoading(true); setErr(null); setExpanded(new Set());
    try { setData(await fetchGrnBenchmark(p)); }
    catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(plant); }, [plant]);

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(filtered.map(p => `${p.partNo}||${p.stage}`)));
  }
  function collapseAll() { setExpanded(new Set()); }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.parts.filter(p => {
      if (stage !== 'ALL' && p.stage !== stage) return false;
      if (minSavings > 0 && p.totalSavingsPotential < minSavings * 1e5) return false;
      if (q && !p.partNo.toLowerCase().includes(q) &&
          !p.suppliers.some(s => s.vendor.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, stage, search, minSavings]);

  const filteredSavings = filtered.reduce((s, p) => s + p.totalSavingsPotential, 0);

  const plantLabel = plant === 'inja' ? 'Chennai (INJA)' : 'Jamshedpur (JSR)';

  return (
    <>
    <TopBrand />
    <div className="max-w-[1400px] mx-auto px-6 py-6">

      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <button onClick={() => navigate('/')} className="hover:text-slate-800 inline-flex items-center gap-1">
          <ChevronLeft size={13} /> Home
        </button>
        <span className="text-slate-300">/</span>
        <button onClick={() => navigate(plant === 'inja' ? '/inja' : '/jsr')} className="hover:text-slate-800">
          {plant === 'inja' ? 'Chennai' : 'Jamshedpur'}
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">Benchmark</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">GRN Effective Rates · Same Plant</div>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">Benchmark</h1>
          <p className="text-sm text-slate-500 mt-1">
            Effective rate = GRN Invoice ÷ Received Qty · Last 12 months · Parts with 2+ suppliers only
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Plant toggle */}
          <div className="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden bg-white text-xs font-semibold">
            {(['jsr', 'inja'] as PlantKey[]).map(p => (
              <button key={p} onClick={() => setPlant(p)}
                className={`px-4 py-2 transition-colors ${plant === p ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {p === 'jsr' ? 'Jamshedpur' : 'Chennai'}
              </button>
            ))}
          </div>
          <button onClick={() => load(plant)} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white ring-1 ring-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="mb-4 p-3 rounded-md bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">{err}</div>}

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <KpiCard
            icon={<TrendingDown size={18} className="text-rose-500" />}
            label="Total Savings Potential"
            value={rs(data.summary.totalSavingsPotential)}
            sub="if all parts sourced from lowest GRN rate"
            highlight
          />
          <KpiCard
            icon={<BarChart2 size={18} className="text-indigo-500" />}
            label="Parts with Alternatives"
            value={`${data.summary.partsWithAlternatives}`}
            sub="part+stage combos with 2+ active suppliers"
          />
          <KpiCard
            icon={<Users size={18} className="text-slate-500" />}
            label="Suppliers Compared"
            value={`${data.summary.suppliersCompared}`}
            sub={`across ${plantLabel}`}
          />
          <KpiCard
            icon={<BarChart2 size={18} className="text-amber-500" />}
            label="Avg Price Spread"
            value={`${data.summary.avgSpreadPct}%`}
            sub="average (max−min)/min across all parts"
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {/* Stage filter */}
        <div className="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden bg-white text-xs font-semibold">
          {(['ALL', 'GS', 'CS', 'HS'] as const).map(s => (
            <button key={s} onClick={() => setStage(s)}
              className={`px-3 py-1.5 transition-colors ${stage === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Part No or Supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg ring-1 ring-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Min savings filter */}
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="whitespace-nowrap">Min savings ≥</span>
          <select
            value={minSavings}
            onChange={e => setMinSavings(Number(e.target.value))}
            className="text-xs rounded-lg ring-1 ring-slate-200 bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value={0}>Any</option>
            <option value={1}>₹1 L</option>
            <option value={5}>₹5 L</option>
            <option value={10}>₹10 L</option>
            <option value={50}>₹50 L</option>
            <option value={100}>₹1 Cr</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          {filtered.length !== (data?.parts.length ?? 0) && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-medium ring-1 ring-indigo-100">
              {filtered.length} parts · {rs(filteredSavings, 1)} savings
            </span>
          )}
          <button onClick={expandAll} className="hover:text-slate-800 underline">Expand all</button>
          <span>·</span>
          <button onClick={collapseAll} className="hover:text-slate-800 underline">Collapse all</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400 text-sm">No parts match the current filters.</div>
      ) : (
        <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="pl-4 pr-2 py-3 text-left">Part No</th>
                <th className="px-3 py-3 text-left">Stage</th>
                <th className="px-3 py-3 text-center">Suppliers</th>
                <th className="px-3 py-3 text-right">Total Qty</th>
                <th className="px-3 py-3 text-right">GRN Spend</th>
                <th className="px-3 py-3 text-right">Min Rate</th>
                <th className="px-3 py-3 text-right">Max Rate</th>
                <th className="px-3 py-3 text-right">Spread</th>
                <th className="px-3 py-3 text-right">Savings Potential</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(part => {
                const key = `${part.partNo}||${part.stage}`;
                return (
                  <PartRow
                    key={key}
                    part={part}
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold text-slate-700">
                <td colSpan={4} className="pl-4 py-3">
                  {filtered.length} parts · {stage !== 'ALL' ? stage : 'All stages'}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {rs(filtered.reduce((s, p) => s + p.partTotalAmount, 0) / 2, 1)}
                </td>
                <td colSpan={3} />
                <td className="px-3 py-3 text-right tabular-nums text-rose-600">
                  {rs(filteredSavings, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 leading-relaxed">
        Methodology: Effective Rate = Total GRN Amount (₹) ÷ Total Received Qty (pc) over last 12 months.
        Only part+stage combos with ≥ 2 suppliers and ≥ 50 pcs each are included.
        Savings Potential = (Supplier Rate − Min Rate) × Supplier Qty. Same-plant comparison only.
        Data source: JSR_Roller_PM.dbo.vGRN · Plant: {plant === 'inja' ? 'INJA' : 'IN48'}.
      </p>

      <BrandFooter />
    </div>
    </>
  );
}

function KpiCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${highlight ? 'ring-rose-200 bg-rose-50' : 'ring-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span></div>
      <div className={`text-2xl font-bold tabular-nums ${highlight ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
