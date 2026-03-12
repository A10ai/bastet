import { cn } from "@/lib/utils";
import { getStatusBgColor } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: string;
  variant?: "default" | "status";
}

export function Badge({ className, status, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        variant === "status" && status ? getStatusBgColor(status) : "bg-bastet-card border border-bastet-border text-text-secondary",
        className
      )}
      {...props}
    >
      {children || status}
    </span>
  );
}
