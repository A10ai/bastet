import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">Property configuration, channels, rates, and integrations</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Settings className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming Soon</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Property settings, channel configuration, rate management, integration setup, and system preferences.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
