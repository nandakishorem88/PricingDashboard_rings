import { Summary } from '../api';
import { rs } from '../format';
import { useCollapsible, CollapseButton } from '../components/useCollapsible';

export function Scenarios({ data }: { data: Summary }) {
  const [collapsed, toggle] = useCollapsible('scenarios');
  return (
    <section className="page-break-avoid border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-6 py-3 border-b border-slate-300 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-700">
            3. Savings scenarios — if we move % of every part's volume to L1
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Each card answers: "If X% of each part's volume sat on L1 (cheapest)
            and the rest stayed where it is, what would we save in 12 months?"
          </div>
        </div>
        <CollapseButton collapsed={collapsed} toggle={toggle} />
      </div>
      {!collapsed && (
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200">
          {data.scenarios.map(s => (
            <div key={s.pct} className="px-5 py-5 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.pct}% to L1</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-700 tabular-nums">{rs(s.saving)}</div>
              <div className="mt-1 text-xs text-slate-500">annual saving</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
