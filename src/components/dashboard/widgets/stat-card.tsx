import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
}

export function StatCard({ title, value, subtitle, trend, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-2xl font-mono font-bold text-text-primary mt-1">
            {value}
          </p>
          {(subtitle || trend !== undefined) && (
            <div className="flex items-center gap-1.5 mt-1">
              {trend !== undefined && (
                <span
                  className={cn(
                    "flex items-center text-xs font-medium",
                    trend >= 0 ? "text-status-success" : "text-status-error"
                  )}
                >
                  {trend >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                  )}
                  {Math.abs(trend)}%
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-text-muted">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        <div className="p-2.5 rounded-lg bg-bastet-gold-muted text-bastet-gold">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
