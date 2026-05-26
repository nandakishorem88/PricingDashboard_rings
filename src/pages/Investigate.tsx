import { useEffect, useMemo, useState } from 'react';
import { fetchInvestigation, InvestigateResponse, InvestigateQuote, PlantKey } from '../api';
import { rs, rsExact, qty } from '../format';
import { ChevronLeft, AlertTriangle, Crown, MapPin } from 'lucide-react';
import { TopBrand } from '../components/TopBrand';
import { BrandFooter } from '../components/BrandFooter';

export function Investigate({ partNo, plant, navigate }: { partNo: string; plant: PlantKey; navigate: (p: string) => void }) {
  const [data, setData] = useState<InvestigateResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    fetchInvestigation(plant, partNo).then(setData).catch(e => setErr(e?.message || String(e)));
  }, [plant, partNo]);

  const observations = useMemo(() => data ? computeObservations(data) : [], [data]);
  const plantLabel = plant === 'inja' ? 'Chennai' : 'Jamshedpur';

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBrand>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <button onClick={() => navigate('/')} className="hover:text-slate-900 inline-flex items-center gap-1">
            <ChevronLeft size={14} /> AI Decision Support
          </button>
          <span className="text-slate-300">/</span>
          <button onClick={() => navigate('/rings')} className="hover:text-slate-900">Rings</button>
          <span className="text-slate-300">/</span>
          <button onClick={() => navigate(plant === 'inja' ? '/inja' : '/jsr')} className="hover:text-slate-900">{plantLabel}</button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">Investigate {partNo}</span>
        </div>
      </TopBrand>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {err && (
          <div className="mb-4 p-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">
            <strong>Couldn't load investigation:</strong> {err}
          </div>
        )}

        {!data ? (
          <div className="space-y-4">
            <div className="h-24 bg-slate-100 animate-pulse rounded-xl" />
            <div className="h-48 bg-slate-100 animate-pulse rounded-xl" />
          </div>
        ) : (
          <>
            <Header data={data} />
            <Observations items={observations} />
            <GrnSummary data={data} />
            <QuoteComparison data={data} />
            <StagePriceTable data={data} />
            <RevisionHistory data={data} />
            <footer className="mt-8 text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-4">
              Investigation source · Quote breakdowns from {plant === 'jsr' ? 'JSR_Rings part_prices' : 'timken_price_model computed live'}.
              GRN volume from JSR_Roller_PM.GRN filtered to last 12 months and plant {data.plantCode}.
            </footer>
            <BrandFooter />
          </>
        )}
      </div>
    </div>
  );
}

function Header({ data }: { data: InvestigateResponse }) {
  const prices = data.quotes.map(q => q.pricePerPc).filter(p => p > 0);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const spreadPct = min > 0 ? ((max - min) / min) * 100 : 0;

  return (
    <header className="mb-5 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 font-bold">
          <AlertTriangle size={14} /> Pricing Investigation
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-mono">{data.partNo}</h1>
            <div className="mt-1 text-sm text-slate-300 flex items-center gap-3 flex-wrap">
              <span><strong className="text-white">{data.rmGrade}</strong></span>
              {data.heatTreatment && <span>· HT: <strong className="text-white">{data.heatTreatment}</strong></span>}
              {data.manufacturingRoute && <span>· Route: <strong className="text-white">{data.manufacturingRoute}</strong></span>}
              {data.rmForm && <span>· RM: <strong className="text-white">{data.rmForm}</strong></span>}
              {(data as any).odMm ? <span>· OD: <strong className="text-white">{(data as any).odMm} mm</strong></span> : null}
              {(data as any).idMm ? <span>· ID: <strong className="text-white">{(data as any).idMm} mm</strong></span> : null}
              {(data as any).widthMm ? <span>· W: <strong className="text-white">{(data as any).widthMm} mm</strong></span> : null}
              {data.barDia ? <span>· Bar Ø: <strong className="text-white">{data.barDia} mm</strong></span> : null}
            </div>
            {data.sapDesc && <div className="text-xs text-slate-400 mt-1">SAP: {data.sapId} · {data.sapDesc}</div>}
            {!data.sapDesc && data.sapId && <div className="text-xs text-slate-400 mt-1">SAP ID: {data.sapId}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-400">Price spread</div>
            <div className={`text-3xl font-bold tabular-nums ${spreadPct > 50 ? 'text-rose-300' : spreadPct > 20 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {spreadPct.toFixed(0)}%
            </div>
            <div className="text-xs text-slate-300 tabular-nums">{rsExact(min, 2)} – {rsExact(max, 2)} / pc</div>
            <div className="text-2xs text-slate-400 mt-0.5">{data.quotes.length} quotes · plant {data.plantCode}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Observations({ items }: { items: { tone: 'rose' | 'amber' | 'emerald' | 'slate'; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Observations</div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className={`flex-none w-1.5 h-1.5 rounded-full mt-2 ${
              it.tone === 'rose' ? 'bg-rose-500' : it.tone === 'amber' ? 'bg-amber-500' : it.tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-500'
            }`} />
            <span className="text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: it.text }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function computeObservations(d: InvestigateResponse) {
  const out: { tone: 'rose' | 'amber' | 'emerald' | 'slate'; text: string }[] = [];
  if (d.quotes.length === 0) return out;
  const prices = d.quotes.map(q => q.pricePerPc).filter(p => p > 0);
  const min = Math.min(...prices), max = Math.max(...prices);
  const spreadPct = min > 0 ? ((max - min) / min) * 100 : 0;
  const cheapest = d.quotes.find(q => q.pricePerPc === min);
  const dearest  = d.quotes.find(q => q.pricePerPc === max);

  if (spreadPct > 50) out.push({ tone: 'rose',  text: `<strong>${spreadPct.toFixed(0)}% spread</strong> across quotes — very wide. Cheapest is ${cheapest?.supplierName} (${rsExact(min, 2)}), dearest is ${dearest?.supplierName} (${rsExact(max, 2)}).` });
  else if (spreadPct > 20) out.push({ tone: 'amber', text: `<strong>${spreadPct.toFixed(0)}% spread</strong> — meaningful price differential between suppliers.` });

  const stages = new Set(d.quotes.map(q => q.stage));
  if (stages.size > 1) {
    const gsQ = d.quotes.filter(q => q.stage === 'GS').length;
    const csQ = d.quotes.filter(q => q.stage === 'CS').length;
    const hsQ = d.quotes.filter(q => q.stage === 'HS').length;
    const parts: string[] = [];
    if (gsQ) parts.push(`${gsQ} GS`);
    if (csQ) parts.push(`${csQ} CS`);
    if (hsQ) parts.push(`${hsQ} HS`);
    out.push({ tone: 'slate', text: `Quotes span multiple delivery stages: <strong>${parts.join(', ')}</strong>. These are different scopes of work — direct ₹/pc comparison is not apples-to-apples.` });
  }

  if (d.grnByVendor.length > 1) {
    const totalGrn = d.grnByVendor.reduce((a, b) => a + b.totalQty, 0);
    const top = d.grnByVendor[0];
    const pctShare = totalGrn > 0 ? (top.totalQty / totalGrn) * 100 : 0;
    if (pctShare > 70) out.push({ tone: 'amber', text: `Volume is heavily concentrated — <strong>${top.vendor}</strong> takes <strong>${pctShare.toFixed(0)}%</strong> of last-12-month receipts (${qty(top.totalQty)} pc).` });
  }

  if (d.revisions.length > 0) {
    const latest = d.revisions[0];
    const change = latest.oldPrice > 0 ? ((latest.newPrice - latest.oldPrice) / latest.oldPrice) * 100 : 0;
    if (Math.abs(change) > 15) {
      const arrow = change > 0 ? '↑' : '↓';
      const tone = change > 0 ? 'rose' : 'emerald';
      out.push({ tone, text: `Last revision changed price <strong>${arrow} ${Math.abs(change).toFixed(0)}%</strong> (₹${latest.oldPrice.toFixed(2)} → ₹${latest.newPrice.toFixed(2)}) on ${new Date(latest.at).toISOString().slice(0,10)}.` });
    }
  }

  const rmCosts = d.quotes.map(q => q.rmCostPerKg ?? 0).filter(c => c > 0);
  if (rmCosts.length > 1) {
    const rmMin = Math.min(...rmCosts), rmMax = Math.max(...rmCosts);
    const rmSpread = rmMin > 0 ? ((rmMax - rmMin) / rmMin) * 100 : 0;
    if (rmSpread > 5) {
      out.push({ tone: 'slate', text: `RM cost varies ${rmSpread.toFixed(0)}% across suppliers (₹${rmMin.toFixed(2)}/kg – ₹${rmMax.toFixed(2)}/kg). May reflect different RM sources or contract terms.` });
    }
  }
  return out;
}

function GrnSummary({ data }: { data: InvestigateResponse }) {
  if (data.grnByVendor.length === 0) {
    return (
      <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 p-5 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Procurement (last 12 mo)</div>
        <div className="text-sm text-slate-500">No GRN receipts found for this part at plant {data.plantCode}.</div>
      </section>
    );
  }
  const total = data.grnByVendor.reduce((a, b) => a + b.totalQty, 0);
  return (
    <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Procurement (last 12 mo) · Plant {data.plantCode}</div>
        <div className="text-sm text-slate-600">Total <strong className="text-slate-900 tabular-nums">{qty(total)} pc</strong></div>
      </div>
      <div className="space-y-2">
        {data.grnByVendor.map(g => {
          const pctShare = total > 0 ? (g.totalQty / total) * 100 : 0;
          return (
            <div key={g.vendor} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate text-slate-800 font-medium">{g.vendor}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${pctShare}%` }} />
              </div>
              <span className="tabular-nums text-slate-700 font-semibold w-20 text-right">{qty(g.totalQty)} pc</span>
              <span className="tabular-nums text-slate-500 w-14 text-right">{pctShare.toFixed(1)}%</span>
              <span className="tabular-nums text-slate-500 w-20 text-right text-xs">{g.monthsActive} mo active</span>
              <span className="tabular-nums text-slate-500 w-24 text-right text-xs">peak {qty(g.peakMonthQty)}/mo</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function stageChip(stage: string) {
  const cls = stage === 'HS'
    ? 'bg-orange-100 text-orange-800 ring-orange-200'
    : stage === 'CS'
      ? 'bg-purple-100 text-purple-800 ring-purple-200'
      : 'bg-sky-100 text-sky-800 ring-sky-200';
  return <span className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase ring-1 ${cls}`}>{stage}</span>;
}

function QuoteComparison({ data }: { data: InvestigateResponse }) {
  const isJsr = data.plant === 'JSR';
  const sorted = [...data.quotes].sort((a, b) => a.pricePerPc - b.pricePerPc);

  return (
    <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Quote breakdown · all suppliers</div>
        <div className="text-xs text-slate-500 mt-0.5">Sorted by final ₹/pc (cheapest first). {isJsr ? 'JSR costs in ₹/100 pc.' : 'INJA prices computed from component tables.'}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-2xs uppercase tracking-wide text-slate-500 font-bold">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Supplier</th>
              <th className="px-3 py-2 text-left">Stage</th>
              <th className="px-3 py-2 text-right">Final ₹/pc</th>
              <th className="px-3 py-2 text-right">RM ₹/kg</th>
              <th className="px-3 py-2 text-right">RM ₹/pc</th>
              <th className="px-3 py-2 text-right">GS conv</th>
              <th className="px-3 py-2 text-right">CS/HT conv</th>
              <th className="px-3 py-2 text-right">OH</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Transport</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((q, i) => {
              const cheapest = i === 0, dearest = i === sorted.length - 1;
              return (
                <tr key={String(q.id)} className={`border-b border-slate-100 ${cheapest ? 'bg-emerald-50' : dearest ? 'bg-rose-50' : ''}`}>
                  <td className="px-3 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-semibold text-slate-900">
                      {cheapest && <Crown size={11} className="inline mr-1 text-emerald-700" />}
                      {q.supplierName}
                    </div>
                    {q.supplierLocation && <div className="text-2xs text-slate-500 flex items-center gap-1"><MapPin size={9} />{q.supplierLocation}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      {stageChip(q.stage)}
                      {q.quarter && <span className="text-xs text-slate-600">{q.quarter}</span>}
                    </div>
                    {q.rmSource && <div className="text-2xs text-slate-500 mt-0.5">RM: {q.rmSource}</div>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${cheapest ? 'text-emerald-700' : dearest ? 'text-rose-700' : 'text-slate-900'}`}>
                    {rsExact(q.pricePerPc, 2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.rmCostPerKg ? rsExact(q.rmCostPerKg, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.rmCostPerPc ? rsExact(q.rmCostPerPc, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.gsConv ? rsExact(q.gsConv, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {q.hsConv ? rsExact(q.hsConv, 2) : q.csConv ? rsExact(q.csConv, 2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.overhead ? rsExact(q.overhead, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.margin ? rsExact(q.margin, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{q.transport ? rsExact(q.transport, 2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.plant === 'JSR' && (
        <div className="px-5 py-2 text-2xs text-slate-500 bg-slate-50 border-t border-slate-200">
          GS conv / CS/HT conv / OH / Margin columns are <strong>₹/100 pc</strong> from the JSR pricing model.
        </div>
      )}
    </section>
  );
}

function StagePriceTable({ data }: { data: InvestigateResponse }) {
  return (
    <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Stage-by-stage ₹/pc (apples to apples)</div>
        <div className="text-xs text-slate-500 mt-0.5">Compare each supplier at the SAME stage. Cheapest in each column highlighted.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-2xs uppercase tracking-wide text-slate-500 font-bold">
            <tr>
              <th className="px-3 py-2 text-left">Supplier · RM source</th>
              <th className="px-3 py-2 text-left">Delivers</th>
              <th className="px-3 py-2 text-right">GS ₹/pc</th>
              <th className="px-3 py-2 text-right">CS ₹/pc</th>
              <th className="px-3 py-2 text-right">HS ₹/pc</th>
              <th className="px-3 py-2 text-right">Final ₹/pc</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rows = data.quotes.map(q => ({
                q,
                gs: q.gsTotal ? q.gsTotal / (data.plant === 'JSR' ? 100 : 1) : (q.gsPrice || 0),
                cs: q.csTotal ? q.csTotal / (data.plant === 'JSR' ? 100 : 1) : (q.csPrice || 0),
                hs: q.hsTotal ? q.hsTotal / (data.plant === 'JSR' ? 100 : 1) : (q.hsPrice || 0),
              }));
              const minGs = Math.min(...rows.map(r => r.gs).filter(v => v > 0));
              const minCs = Math.min(...rows.map(r => r.cs).filter(v => v > 0));
              const minHs = Math.min(...rows.map(r => r.hs).filter(v => v > 0));
              return rows.map(({ q, gs, cs, hs }) => (
                <tr key={String(q.id)} className="border-b border-slate-100">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-800">{q.supplierName}</div>
                    {q.rmSource && <div className="text-2xs text-slate-500">RM: {q.rmSource}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">{stageChip(q.stage)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gs > 0 && gs === minGs ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-slate-700'}`}>
                    {gs > 0 ? rsExact(gs, 2) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cs > 0 && cs === minCs ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-slate-700'}`}>
                    {cs > 0 ? rsExact(cs, 2) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${hs > 0 && hs === minHs ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-slate-700'}`}>
                    {hs > 0 ? rsExact(hs, 2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {rsExact(q.pricePerPc, 2)}
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RevisionHistory({ data }: { data: InvestigateResponse }) {
  if (!data.revisions || data.revisions.length === 0) return null;
  return (
    <section className="mb-5 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Price revision history</div>
        <div className="text-xs text-slate-500 mt-0.5">Most recent first.</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-2xs uppercase tracking-wide text-slate-500 font-bold">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Supplier · Quarter · Trigger</th>
            <th className="px-3 py-2 text-right">Old ₹/pc</th>
            <th className="px-3 py-2 text-right">New ₹/pc</th>
            <th className="px-3 py-2 text-right">Δ %</th>
            <th className="px-3 py-2 text-right">Old RM ₹/kg</th>
            <th className="px-3 py-2 text-right">New RM ₹/kg</th>
          </tr>
        </thead>
        <tbody>
          {data.revisions.map((r, i) => {
            const dPct = r.oldPrice > 0 ? ((r.newPrice - r.oldPrice) / r.oldPrice) * 100 : 0;
            const at = r.at ? new Date(r.at) : null;
            const dateLabel = (at && !isNaN(at.getTime()) && at.getFullYear() > 1990) ? at.toLocaleDateString() : '—';
            return (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-700 text-xs tabular-nums whitespace-nowrap">{dateLabel}</td>
                <td className="px-3 py-2 text-slate-700 text-xs">
                  {r.supplier && <span className="font-semibold text-slate-800">{r.supplier}</span>}
                  {r.supplier && r.quarter && <span className="text-slate-400 mx-1">·</span>}
                  {r.quarter && <span>{r.quarter}</span>}
                  {(r.supplier || r.quarter) && r.label && <span className="text-slate-400 mx-1">·</span>}
                  {r.label && <span className="text-slate-500 italic">{r.label}</span>}
                  {!r.supplier && !r.quarter && !r.label && <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{rsExact(r.oldPrice, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">{rsExact(r.newPrice, 2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${Math.abs(dPct) > 15 ? (dPct > 0 ? 'text-rose-700' : 'text-emerald-700') : 'text-slate-500'}`}>
                  {dPct >= 0 ? '+' : ''}{dPct.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.oldRmKg ? rsExact(r.oldRmKg, 2) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.newRmKg ? rsExact(r.newRmKg, 2) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
