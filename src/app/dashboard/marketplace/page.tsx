import { Card, CardContent } from "@/components/ui/card";
import { Palmtree } from "lucide-react";

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Marketplace</h1>
        <p className="text-sm text-text-secondary mt-1">Partners, excursions, beaches, and flash deals</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Palmtree className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Phase 2</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Partner management, excursion bookings, beach day passes, flash deals engine, and commission tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
