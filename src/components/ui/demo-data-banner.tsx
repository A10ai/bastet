import { cn } from "@/lib/utils";

interface DemoDataBannerProps {
  /** What is modelled or hardcoded, in one sentence. */
  children: React.ReactNode;
  className?: string;
  /** "demo" for hardcoded sample data, "modelled" for estimates not read from sensors or sales. */
  kind?: "demo" | "modelled";
}

/**
 * Visible label for any screen or widget whose figures are not live
 * operational data. Audit Oct 2026: several dashboards showed sample or
 * synthesised numbers with no indication; this banner makes that explicit so
 * nobody reads a demo figure as a real one.
 */
export function DemoDataBanner({ children, className, kind = "demo" }: DemoDataBannerProps) {
  const label = kind === "demo" ? "Demo data" : "Modelled estimate";
  return (
    <div
      role="note"
      aria-label={label}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200",
        className
      )}
    >
      <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-amber-400/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
        {label}
      </span>
      <p className="text-amber-100/90">{children}</p>
    </div>
  );
}
