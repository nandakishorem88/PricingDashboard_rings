export function TopBrand({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="/timken-logo.png" alt="Timken" className="h-7" />
          <span className="hidden md:inline text-xs font-semibold tracking-[0.2em] uppercase text-slate-400">
            AI Decision Support
          </span>
        </a>
        {children && <div className="flex items-center gap-3">{children}</div>}
      </div>
    </div>
  );
}
