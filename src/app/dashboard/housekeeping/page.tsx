import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function HousekeepingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Housekeeping</h1>
        <p className="text-sm text-text-secondary mt-1">Task board, assignments, and cleaning schedules</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 3</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Auto-generated tasks on checkout, staff assignments, before/after photos, and inspection checklists.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
