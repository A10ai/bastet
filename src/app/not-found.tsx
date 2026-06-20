import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

/**
 * Global 404 page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-text-primary">404</h1>
        <p className="mt-4 text-lg text-text-muted">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
      <Link href="/dashboard">
        <Button variant="primary" className="gap-2">
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}