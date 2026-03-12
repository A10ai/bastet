import { Card, CardContent } from "@/components/ui/card";
import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Maintenance</h1>
        <p className="text-sm text-text-secondary mt-1">Requests, tracking, and resolution</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Wrench className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 3</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Report issues, assign to maintenance staff, track progress with photos, and cost estimation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
