import { Card, CardContent } from "@/components/ui/card";
import { UserCog } from "lucide-react";

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Staff</h1>
        <p className="text-sm text-text-secondary mt-1">Team members, roles, and schedules</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <UserCog className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 3</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Staff management, role-based access, shift scheduling, and performance tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
