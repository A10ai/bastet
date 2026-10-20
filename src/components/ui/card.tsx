import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-brand-card border border-brand-border rounded-xl",
        hover && "hover:border-brand-accent/30 transition-colors cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-6 py-4 border-b border-brand-border", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}
