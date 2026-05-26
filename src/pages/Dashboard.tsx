import { useEffect, useState } from 'react';
import { fetchSummary, PlantKey, Summary } from '../api';
import { Discipline } from '../sections/Discipline';
import { Scenarios } from '../sections/Scenarios';
import { HighVolumeParts } from '../sections/HighVolumeParts';
import { PartPicker } from '../sections/PartPicker';
import { Anomalies } from '../sections/Anomalies';
import { PriceWinner } from '../sections/PriceWinner';
import { ChevronLeft } from 'lucide-react';
import { SupplierOverviewAuto } from '../components/SupplierOverview';
import { TopBrand } from '../components/TopBrand';
import { BrandFooter } from '../components/BrandFooter';

export function Dashboard({ plant, navigate }: { plant: PlantKey; navigate: (p: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try { setData(await fetchSummary(plant)); }
    catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [plant]);

  const plantLabel = plant === 'inja' ? 'Chennai' : 'Jamshedpur';
  const otherPlant: PlantKey = plant === 'inja' ? 'jsr' : 'inja';
  const otherLabel = otherPlant === 'inja' ? 'Chennai' : 'Jamshedpur';

  return (
    <>
    <TopBrand />
    <div className="max-w-[1300px] mx-auto px-6 py-6">
      <div className="mb-2 no-print flex items-center gap-3 text-xs text-slate-500">
        <button onClick={() => navigate('/')} className="hover:text-slate-800 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> AI Decision Support
        </button>
        <span className="text-slate-300">/</span>
        <button onClick={() => navigate('/rings')} className="hover:text-slate-800">Rings</button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">{plantLabel}</span>
      </div>

      <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Executive Brief · {plantLabel}</div>
          <h1 className="text-3xl font-bold text-slate-900 leading-tight mt-1">
            Sourcing Discipline &amp; Savings
          </h1>
          <div className="text-sm text-slate-500 mt-1">
            Ring pricing · last 12 months ·{' '}
            {data ? `as of ${new Date(data.asOf).toLocaleString()}` : 'loading…'}
          </div>
        </div>
        <div className="no-print flex items-center gap-2">
          <button
            onClick={() => navigate(plant === 'inja' ? '/inja/optimizer' : '/jsr/optimizer')}
            className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-flex items-center gap-1"
          >🎯 Open Optimizer</button>
          <button
            onClick={() => navigate(otherPlant === 'inja' ? '/inja' : '/jsr')}
            className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 ring-1 ring-slate-300 rounded-md hover:bg-slate-50"
          >Switch to {otherLabel}</button>
          <button
            onClick={() => load()}
            className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 ring-1 ring-slate-300 rounded-md hover:bg-slate-50"
            disabled={loading}
          >{loading ? 'Loading…' : 'Refresh'}</button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >Print / Save as PDF</button>
        </div>
      </header>

      {err && (
        <div className="mb-4 p-3 rounded-md bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">{err}</div>
      )}

      {!data ? (
        <div className="space-y-4">
          <div className="h-44 bg-slate-50 animate-pulse rounded-lg" />
          <div className="h-28 bg-slate-50 animate-pulse rounded-lg" />
          <div className="h-64 bg-slate-50 animate-pulse rounded-lg" />
        </div>
      ) : (
        <div className="space-y-5">
          <SupplierOverviewAuto plant={plant} />
          <Discipline       data={data} />
          <PriceWinner plant={plant} />
          <Scenarios        data={data} />
          <HighVolumeParts  data={data} />
          <PartPicker       data={data} />
          <Anomalies        data={data} plant={plant} />
          <footer className="pt-4 text-xs text-slate-400 leading-relaxed border-t border-slate-200">
            Methodology · L1 / L2 / L3 ranked per part per stage by lowest ₹/pc quote. Capacity = max monthly GRN qty (last 12 mo) × 1.25 × 12.
            Smart allocation respects supplier capacity and prioritises high-spread parts to L1.
            Scope: parts with 2+ supplier quotes AND GRN volume in the last 12 months. Plant code: {plant === 'inja' ? 'INJA' : 'IN48'}.
          </footer>
          <BrandFooter />
        </div>
      )}
    </div>
    </>
  );
}
