"use client";

import Link from "next/link";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Full-height spinner shown while the staff record is loading. */
export function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
    </div>
  );
}

/** Shown when the signed-in user is not an owner or admin. */
export function AccessDenied({ showBackLink = false }: { showBackLink?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Shield className="w-16 h-16 text-status-error mb-4" />
      <h1 className="text-2xl font-display font-bold text-text-primary mb-2">Access Denied</h1>
      <p className="text-text-secondary">You need owner or admin privileges to access this page.</p>
      {showBackLink && (
        <Link href="/dashboard" className="mt-4">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      )}
    </div>
  );
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "owner" || role === "admin";
}
