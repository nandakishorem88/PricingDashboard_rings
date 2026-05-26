export function BrandFooter() {
  return (
    <div className="mt-10 pt-6 border-t border-slate-200 flex items-center justify-center gap-3 text-slate-400 no-print">
      <span className="text-xs uppercase tracking-[0.25em] font-semibold">Designed &amp; Built by</span>
      <img
        src="/aradhya-logo.png"
        alt="Aradhya"
        className="h-7 opacity-80 hover:opacity-100 transition-opacity"
      />
    </div>
  );
}
