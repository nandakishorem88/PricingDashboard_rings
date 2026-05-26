import { useEffect, useState } from 'react';
import { fetchSummary, Summary } from '../api';
import { rs, qty, pct } from '../format';
import { ArrowRight, Cpu, CircleDot } from 'lucide-react';
import { BrandFooter } from '../components/BrandFooter';

const RING_PLANTS = [
  { code: 'IN48', name: 'Jamshedpur' },
  { code: 'INJA', name: 'Chennai'    },
] as const;


export function Home({ navigate }: { navigate: (p: string) => void }) {
  const [jsr, setJsr] = useState<Summary | null>(null);
  const [inja, setInja] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([fetchSummary('jsr'), fetchSummary('inja')]).then(([a, b]) => {
      if (a.status === 'fulfilled') setJsr(a.value); else setErr(a.reason?.message);
      if (b.status === 'fulfilled') setInja(b.value); else setErr(b.reason?.message);
    });
  }, []);

  const ringsAggregate = (jsr && inja) ? {
    currentSpend:    jsr.hero.currentCost  + inja.hero.currentCost,
    leakage:         jsr.hero.leakage      + inja.hero.leakage,
    totalQty:        jsr.hero.totalQty     + inja.hero.totalQty,
    partsInScope:    jsr.hero.partsInScope + inja.hero.partsInScope,
    l1ShareAvg:      (jsr.hero.l1ShareToday + inja.hero.l1ShareToday) / 2,
    totalPriced:     (jsr.hero.totalPriced   ?? 0) + (inja.hero.totalPriced   ?? 0),
    activeSourced:   (jsr.hero.activeSourced ?? 0) + (inja.hero.activeSourced ?? 0),
  } : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      {/* Top brand band */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            top: '-30%', left: '-5%', width: '50%', height: '160%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 60%)',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative max-w-[1400px] mx-auto px-8 py-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-indigo-300">
              <Cpu size={18} />
              <span className="text-xs font-bold tracking-[0.3em] uppercase">Executive Brief</span>
            </div>
            <div className="bg-white rounded-md px-3 py-1.5 shadow-sm">
              <img src="/timken-logo.png" alt="Timken" className="h-7" />
            </div>
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold text-white tracking-tight">
            AI Decision Support System
          </h1>
          <div className="mt-4 inline-flex items-center gap-3 text-slate-300">
            <span className="text-sm uppercase tracking-[0.3em] font-semibold">Built by</span>
            <img src="/aradhya-logo-dark.png" alt="Aradhya" className="h-14 w-auto" />
          </div>

          {err && (
            <div className="mt-4 p-3 rounded-md bg-rose-500/20 ring-1 ring-rose-400/30 text-sm text-rose-200">{err}</div>
          )}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-10">
        {/* Rings tile — full width */}
        <ProductTile
          available
          icon={<CircleDot size={22} />}
          title="Rings"
          subtitle="Bearing inner & outer rings"
          accent="indigo"
          kpis={ringsAggregate ? [
            { label: 'Annual sourcing',       value: rs(ringsAggregate.currentSpend), highlight: true },
            { label: 'Leakage / yr',          value: rs(ringsAggregate.leakage), tone: 'rose' },
            { label: 'Total parts priced',    value: `${ringsAggregate.totalPriced}` },
            { label: 'Active parts sourced',  value: `${ringsAggregate.activeSourced}` },
            { label: 'L1 share today',        value: pct(ringsAggregate.l1ShareAvg, 0) },
            { label: 'Parts in leakage scope',value: `${ringsAggregate.partsInScope}` },
          ] : null}
          plants={RING_PLANTS}
          onOpen={() => navigate('/rings')}
        />

        {/* Combined opportunity strip */}
        {ringsAggregate && (
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
                Rings · Both Plants Combined · 12 Months
              </div>

              <div className="mt-3">
                <div className="text-5xl md:text-6xl font-bold text-slate-900 tabular-nums tracking-tight">
                  {rs(ringsAggregate.currentSpend)}
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
                  <span className="text-2xl md:text-3xl font-bold text-rose-700 tabular-nums">{rs(ringsAggregate.leakage)}</span>
                  <span className="text-sm text-rose-600 font-medium">annual leakage</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    ({((ringsAggregate.leakage / ringsAggregate.currentSpend) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Recoverable per year by re-allocating volume to L1 suppliers · {qty(ringsAggregate.totalQty)} pc across Jamshedpur + Chennai
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-10 text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-4">
          AI Decision Support System · Ring pricing data from JSR_Rings (JSR plant) + timken_price_model (INJA plant) databases
        </footer>
        <BrandFooter />
      </div>
    </div>
  );
}

function ProductTile({ available, icon, title, subtitle, accent, kpis, plants, onOpen }: {
  available: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: 'emerald' | 'indigo';
  kpis: Array<{ label: string; value: string; highlight?: boolean; tone?: 'rose' }> | null;
  plants: ReadonlyArray<{ code: string; name: string }>;
  onOpen: () => void;
}) {
  const palette = accent === 'emerald'
    ? { ring: 'ring-emerald-300', stripe: 'bg-emerald-500', text: 'text-emerald-700', glow: 'rgba(16,185,129,0.25)', hoverRing: 'hover:ring-emerald-400' }
    : { ring: 'ring-indigo-300',  stripe: 'bg-indigo-500',  text: 'text-indigo-700',  glow: 'rgba(99,102,241,0.25)',  hoverRing: 'hover:ring-indigo-400' };

  return (
    <div
      onClick={onOpen}
      className={`group relative text-left bg-white rounded-2xl ring-1 ${palette.ring} ${palette.hoverRing} overflow-hidden transition-all hover:-translate-y-1 cursor-pointer w-full`}
      style={{
        boxShadow: `0 0 0 1px ${palette.glow.replace('0.25', '0.1')}, 0 12px 30px -10px ${palette.glow}, 0 20px 40px -20px rgba(15,23,42,0.25)`,
      }}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${palette.stripe}`} />
      {!available && (
        <div className="absolute top-3 right-3 bg-slate-100 text-slate-700 text-2xs font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ring-1 ring-slate-200">
          Coming soon
        </div>
      )}

      <div className="p-6 pt-8">
        <div className={`flex items-center gap-2 ${palette.text}`}>
          {icon}
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>

        {kpis ? (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpis.map(k => (
              <div key={k.label} className={`p-3 rounded-lg ring-1 ring-slate-200 ${k.highlight ? 'bg-slate-50' : 'bg-white'}`}>
                <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
                <div className={`mt-0.5 text-xl font-bold tabular-nums ${
                  k.tone === 'rose' ? 'text-rose-700' : k.highlight ? palette.text : 'text-slate-900'
                }`}>{k.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 p-4 rounded-lg bg-slate-50 ring-1 ring-slate-200 text-center">
            <div className="text-xs text-slate-500">Catalog data available in separate module</div>
            <div className="mt-1 text-xs text-slate-400">Open the Rollers dashboard for roller pricing analytics</div>
          </div>
        )}

        <div className="mt-5">
          <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{plants.length} plants</div>
          <div className="flex flex-wrap gap-1.5">
            {plants.map(p => (
              <span key={p.code} className="inline-flex items-center gap-1 bg-white ring-1 ring-slate-200 rounded-md px-2 py-0.5 text-xs text-slate-700">
                <span className="font-mono font-bold text-slate-500 text-2xs">{p.code}</span>
                <span>{p.name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
          Open {title} deep dive
          <ArrowRight size={16} className={`${palette.text} group-hover:translate-x-1 transition-transform`} />
        </div>
      </div>
    </div>
  );
}
