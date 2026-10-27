export function InvestigationLoading() {
  return (
    <section
      className="relative isolate mb-10 overflow-hidden rounded-[20px] bg-muted p-7"
      aria-busy="true"
      aria-label="Checking project evidence"
    >
      <div
        className="ai-loading-sheen pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      />
      <h2 className="text-ui-section">Checking your project</h2>
      <p className="mt-2 max-w-[560px] text-ui-body text-muted-foreground">
        Looking for meaningful disagreements across your selected plans and
        GitHub work.
      </p>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-6 w-4/5 rounded-lg bg-border/70 animate-pulse duration-500" />
      </div>
    </section>
  );
}
