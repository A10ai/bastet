import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

export default function BookingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Bookings</h1>
        <p className="text-sm text-text-secondary mt-1">Manage reservations and availability</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 2</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Booking engine, availability calendar, rate calculation, and channel tracking will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
