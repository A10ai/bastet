import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function GuestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Guests</h1>
        <p className="text-sm text-text-secondary mt-1">Guest profiles, preferences, and communications</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 2</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Guest profiles with 58-field Preference DNA, communication history, and activity tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
