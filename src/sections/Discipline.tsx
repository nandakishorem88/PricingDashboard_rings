import { Summary } from '../api';
import { rs, qty, pct } from '../format';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

export function Discipline({ data }: { data: Summary }) {
  const h = data.hero;
  const disciplineGap = h.l1OptimalShare - h.l1ShareToday;
  const [collapsed, toggle] = useCollapsible('discipline');

  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-900 text-white px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-300">
            1. Sourcing discipline — are we loading L1 first?
          </div>
          <CollapseButton collapsed={collapsed} toggle={toggle} dark />
        </div>
        {!collapsed && (<>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <Stat
            label="L1 share today"
            value={pct(h.l1ShareToday, 0)}
            sub={`of ${qty(h.totalQty)} pieces across ${h.partsInScope} parts`}
            tone="warn"
          />
          <Stat
            label="L1 share if optimally loaded"
            value={pct(h.l1OptimalShare, 0)}
            sub={`with capacity ceilings respected (peak month × 1.25 × 12)`}
            tone="good"
          />
          <Stat
            label="Annual leakage from sub-optimal sourcing"
            value={rs(h.leakage)}
            sub={`current ${rs(h.currentCost)} vs optimal ${rs(h.optimalCost)}`}
            tone="bad"
          />
        </div>
        <div className="mt-3 text-sm text-slate-200 leading-relaxed">
          We're sending {pct(h.l1ShareToday, 0)} of total volume to L1 (cheapest)
          when we should be sending {pct(h.l1OptimalShare, 0)}. The {pct(disciplineGap, 0)} gap is
          worth <span className="font-semibold text-white">{rs(h.leakage)} a year</span>.
        </div>
        </>)}
      </div>

      {!collapsed && (
        <div className="bg-white px-6 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Top actions — biggest leakage to recover first
          </div>
          <ol className="space-y-2.5">
            {data.topActions.map((a, i) => (
              <li key={`${a.partNo}-${a.stage || 'x'}-${i}`} className="flex items-start gap-3 text-sm">
                <span className="flex-none w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold grid place-items-center">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-slate-900 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold font-mono">{a.partNo}</span>
                    <span className="text-slate-500">· {a.rmGrade}</span>
                    {a.stage && (
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wide ring-1 ${
                        a.stage === 'HS'
                          ? 'bg-orange-100 text-orange-800 ring-orange-200'
                          : a.stage === 'CS'
                            ? 'bg-purple-100 text-purple-800 ring-purple-200'
                            : 'bg-sky-100 text-sky-800 ring-sky-200'
                      }`}>{a.stage}</span>
                    )}
                  </div>
                  <div className="text-slate-700">
                    Move <span className="font-medium">{qty(a.moveQty)} pc</span> from{' '}
                    <span className="font-medium text-rose-700">{a.fromSupplier}</span> →{' '}
                    <span className="font-medium text-emerald-700">{a.toSupplier}</span> (L1 of {a.stage || 'stage'})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold text-emerald-700 tabular-nums">{rs(a.saving)}</div>
                  <div className="text-xs text-slate-500">/ yr</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
  const toneClass = {
    good:    'text-emerald-300',
    bad:     'text-rose-300',
    warn:    'text-amber-300',
    neutral: 'text-white',
  }[tone];
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
