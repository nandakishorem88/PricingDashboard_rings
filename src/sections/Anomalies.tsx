import { Summary, Anomaly, PlantKey } from '../api';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

const RULE_LABEL: Record<string, string> = {
  spread:   'Wide price spread',
  outlier:  'Outlier quote',
  revision: 'Large revision step',
};

export function Anomalies({ data, plant }: { data: Summary; plant: PlantKey }) {
  const [collapsed, toggle] = useCollapsible('anomalies');

  if (data.anomalies.length === 0) {
    return (
      <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-start justify-between gap-3">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            6. Pricing anomalies
          </div>
          <CollapseButton collapsed={collapsed} toggle={toggle} />
        </div>
        {!collapsed && (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            No anomalies flagged.
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            6. Pricing anomalies — investigate before next revision
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Rules: spread &gt; 20% across suppliers · quote &gt; 2σ above peer median in same RM grade · revision step &gt; 15%.
          </div>
        </div>
        <CollapseButton collapsed={collapsed} toggle={toggle} />
      </div>
      {!collapsed && (
        <ul className="divide-y divide-slate-100">
          {data.anomalies.map((a, i) => (
            <AnomalyRow key={i} a={a} plant={plant} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AnomalyRow({ a, plant }: { a: Anomaly; plant: PlantKey }) {
  const severityClass = a.severity === 'high'
    ? 'bg-rose-100 text-rose-800'
    : 'bg-amber-100 text-amber-800';
  return (
    <li className="px-6 py-3 flex items-start gap-4">
      <span className={`flex-none px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide ${severityClass}`}>
        {a.severity === 'high' ? 'High' : 'Medium'}
      </span>
      <span className="flex-none text-xs uppercase tracking-wide text-slate-500 w-28 pt-0.5">
        {RULE_LABEL[a.rule] || a.rule}
      </span>
      <div className="flex-1">
        <div className="text-sm text-slate-900">
          <span className="font-mono font-semibold">{a.partNo}</span>
          {a.rmGrade && <span className="text-slate-500"> · {a.rmGrade}</span>}
          <span className="text-slate-800"> — {a.headline}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{a.detail}</div>
      </div>
      <a
        href={`/investigate?part=${encodeURIComponent(a.partNo)}&plant=${plant}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-none text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline self-center no-print whitespace-nowrap"
      >
        Investigate →
      </a>
    </li>
  );
}
