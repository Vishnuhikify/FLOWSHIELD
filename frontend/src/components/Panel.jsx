/** Shared surface for every dashboard section: title row + body. */
export default function Panel({ title, aside, children, className = "", id }) {
  return (
    <section id={id} data-section={id ? "" : undefined} className={`rounded-sm border border-line bg-panel ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <h2 className="font-display text-[1.375rem] font-semibold leading-tight tracking-wide">{title}</h2>
        {aside && <div className="text-sm text-ink-soft">{aside}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
