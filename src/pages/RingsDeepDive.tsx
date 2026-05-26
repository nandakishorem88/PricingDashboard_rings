import { useEffect, useState } from 'react';
import { fetchSummary, Summary } from '../api';
import { rs, qty, pct } from '../format';
import { ArrowRight, ChevronLeft, CircleDot } from 'lucide-react';
import { TopBrand } from '../components/TopBrand';
import { BrandFooter } from '../components/BrandFooter';

export function RingsDeepDive({ navigate }: { navigate: (p: string) => void }) {
  const [jsr, setJsr] = useState<Summary | null>(null);
  const [inja, setInja] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([fetchSummary('jsr'), fetchSummary('inja')]).then(([a, b]) => {
      if (a.status === 'fulfilled') setJsr(a.value); else setErr(a.reason?.message);
      if (b.status === 'fulfilled') setInja(b.value); else setErr(b.reason?.message);
    });
  }, []);

  const combined = (jsr && inja)
    ? { leakage: jsr.hero.leakage + inja.hero.leakage, current: jsr.hero.currentCost + inja.hero.currentCost }
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBrand>
        <button onClick={() => navigate('/')}
                className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Back to home
        </button>
      </TopBrand>

      <div className="max-w-[1300px] mx-auto px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <CircleDot size={20} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Product Deep Dive</div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">Rings</h1>
            <div className="text-sm text-slate-600 mt-0.5">Pick a plant to open its sourcing dashboard.</div>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-md bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-700">{err}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PlantCard
            title="Jamshedpur"
            subtitle="JSR plant — IN48"
            accent="indigo"
            summary={jsr}
            onOpen={() => navigate('/jsr')}
          />
          <PlantCard
            title="Chennai"
            subtitle="INJA plant — INJA"
            accent="cyan"
            summary={inja}
            onOpen={() => navigate('/inja')}
          />
        </div>

        {combined && (
          <div
            className="mt-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-slate-50 to-white ring-1 ring-slate-200"
            style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 10px 30px -10px rgba(15,23,42,0.18), 0 4px 12px -4px rgba(15,23,42,0.1)' }}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                top: '-30%', left: '50%', transform: 'translateX(-50%)', width: '60%', height: '120%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 60%)',
              }}
            />

            <div className="relative px-6 py-8 text-center">
              <div className="text-2xs font-bold tracking-[0.25em] uppercase text-slate-500">
                Both Plants Combined · 12 Months
              </div>

              <div className="mt-3">
                <div className="text-5xl md:text-6xl font-bold text-slate-900 tabular-nums tracking-tight">
                  {rs(combined.current)}
                </div>
                <div className="mt-1 text-sm font-semibold uppercase tracking-widest text-slate-600">
                  Total Sourcing Value
                </div>
              </div>

              <div className="mt-6 flex items-center justify-center">
                <div className="h-px w-32 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              </div>

              <div className="mt-5">
                <div className="inline-flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-bold text-rose-700 tabular-nums">{rs(combined.leakage)}</span>
                  <span className="text-sm text-rose-600 font-medium">annual leakage</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    ({((combined.leakage / combined.current) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Recoverable by re-allocating volume to L1 suppliers. Open a plant above to drill in.
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-10 text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-4">
          Methodology · L1 / L2 / L3 ranked per part per stage by lowest ₹/pc quote. Capacity = max monthly GRN qty (last 12 mo) × 1.25 × 12.
          Smart allocation respects supplier capacity and prioritises high-spread parts to L1.
          Plant codes: Jamshedpur = IN48, Chennai = INJA.
        </footer>
        <BrandFooter />
      </div>
    </div>
  );
}

function PlantCard({ title, subtitle, accent, summary, onOpen }: {
  title: string;
  subtitle: string;
  accent: 'indigo' | 'cyan';
  summary: Summary | null;
  onOpen: () => void;
}) {
  const a = accent === 'indigo'
    ? { ring: 'ring-indigo-200 hover:ring-indigo-400', text: 'text-indigo-700', strip: 'bg-indigo-600' }
    : { ring: 'ring-cyan-200 hover:ring-cyan-400',     text: 'text-cyan-700',   strip: 'bg-cyan-600'   };

  return (
    <button
      onClick={onOpen}
      className={`group relative text-left bg-white rounded-2xl ring-1 ${a.ring} transition-shadow shadow-sm hover:shadow-md overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${a.strip}`} />
      <div className="p-6 pl-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
          </div>
          <ArrowRight size={20} className={`${a.text} group-hover:translate-x-0.5 transition-transform`} />
        </div>

        {!summary ? (
          <div className="mt-5 space-y-2">
            <div className="h-8 bg-slate-100 animate-pulse rounded" />
            <div className="h-3 bg-slate-100 animate-pulse rounded w-2/3" />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Annual leakage</div>
              <div className={`mt-1 text-4xl font-semibold tabular-nums ${a.text}`}>{rs(summary.hero.leakage)}</div>
              <div className="text-xs text-slate-500 mt-1">
                {pct(summary.hero.leakage / Math.max(summary.hero.currentCost, 1) * 100, 1)} of {rs(summary.hero.currentCost)} current spend
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <Mini label="Parts in scope"  value={`${summary.hero.partsInScope}`} sub={`${qty(summary.hero.totalQty)} pc / yr`} />
              <Mini label="L1 share today"  value={pct(summary.hero.l1ShareToday, 0)} sub={`should be ${pct(summary.hero.l1OptimalShare, 0)}`} />
            </div>

            <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
              Open dashboard <ArrowRight size={14} className="opacity-60" />
            </div>
          </>
        )}
      </div>
    </button>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
