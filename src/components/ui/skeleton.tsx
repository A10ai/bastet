/**
 * Reusable loading skeleton components for Suspense fallbacks and lazy-loaded content.
 */

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-bastet-card border border-bastet-border ${className}`}
    >
      <div className="h-4 w-1/3 bg-bastet-border/50 rounded m-4" />
      <div className="h-8 w-2/3 bg-bastet-border/50 rounded mx-4 mb-4" />
    </div>
  );
}

export function SkeletonRow({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse flex items-center gap-4 p-3 rounded-lg bg-bastet-card border border-bastet-border"
        >
          <div className="h-10 w-10 bg-bastet-border/50 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 bg-bastet-border/50 rounded" />
            <div className="h-3 w-1/2 bg-bastet-border/30 rounded" />
          </div>
          <div className="h-8 w-20 bg-bastet-border/50 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-xl bg-bastet-card border border-bastet-border p-6">
      <div className="h-4 w-1/4 bg-bastet-border/50 rounded mb-4" />
      <div className="h-64 w-full bg-bastet-border/30 rounded" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse h-8 w-48 bg-bastet-border/50 rounded" />
      <SkeletonGrid />
      <SkeletonChart />
      <SkeletonRow count={3} />
    </div>
  );
}