"use client";

/**
 * Global dashboard error boundary.
 * Catches any unhandled error in the dashboard route tree.
 * Provides a reset button to retry without full page reload.
 */
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "@/lib/client-logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to client logger (Sentry will capture this in production)
    logger.error({ err: error }, "[Dashboard Error Boundary]");
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-status-error/10 p-4">
          <AlertTriangle className="h-8 w-8 text-status-error" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            An unexpected error occurred while loading this page.
            {error.digest && (
              <span className="block mt-1 text-xs text-text-muted/60">
                Error ID: {error.digest}
              </span>
            )}
          </p>
        </div>
        <Button onClick={reset} variant="primary" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}