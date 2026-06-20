import { Loader2 } from "lucide-react";

/**
 * Global dashboard loading state.
 * Shown while route segments are loading (Suspense streaming).
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-bastet-gold" />
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    </div>
  );
}