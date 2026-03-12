import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-bastet-gold/50 disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "gold-gradient text-bastet-bg hover:opacity-90":
              variant === "primary",
            "bg-bastet-card border border-bastet-border text-text-primary hover:bg-bastet-border":
              variant === "secondary",
            "text-text-secondary hover:text-text-primary hover:bg-bastet-card":
              variant === "ghost",
            "bg-status-error/10 text-status-error border border-status-error/20 hover:bg-status-error/20":
              variant === "danger",
          },
          {
            "text-xs px-2.5 py-1.5": size === "sm",
            "text-sm px-4 py-2": size === "md",
            "text-base px-6 py-2.5": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
export { Button };
