import { Card, CardContent } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Finance</h1>
        <p className="text-sm text-text-secondary mt-1">Invoices, payments, expenses, and reports</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Wallet className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">Coming in Sprint 4</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Multi-currency invoicing, Stripe payments, cash recording, FX rates, and R&D expense tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
