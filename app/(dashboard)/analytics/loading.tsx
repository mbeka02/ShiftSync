export default function AnalyticsLoading() {
  return <section className="px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading analytics">
    <div className="border-b border-[var(--border-strong)] pb-5">
      <div className="h-3 w-28 bg-[var(--surface-strong)]" />
      <div className="mt-3 h-10 w-72 max-w-full bg-[var(--surface-strong)]" />
      <div className="mt-3 h-4 w-[34rem] max-w-full bg-[var(--surface-subtle)]" />
    </div>
    <div className="grid border-x border-b bg-white md:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 border-b p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="h-3 w-32 bg-[var(--surface-subtle)]" /><div className="mt-4 h-8 w-20 bg-[var(--surface-strong)]" /></div>)}</div>
    <div className="mt-7 h-72 border bg-white"><div className="h-20 border-b bg-[var(--surface-subtle)]" /></div>
    <div className="mt-7 h-72 border bg-white"><div className="h-20 border-b bg-[var(--surface-subtle)]" /></div>
  </section>;
}
