"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LogIn, LogOut, XCircle, Loader2 } from "lucide-react";

interface BookingStatusActionsProps {
  bookingId: string;
  status: string;
  onActionComplete: () => void;
}

export function BookingStatusActions({
  bookingId,
  status,
  onActionComplete,
}: BookingStatusActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);

  const performAction = async (action: string, body?: Record<string, unknown>) => {
    setLoading(action);
    try {
      const url =
        action === "confirm"
          ? `/api/v1/bookings/${bookingId}`
          : `/api/v1/bookings/${bookingId}/${action}`;

      const method = action === "confirm" ? "PATCH" : "POST";
      const payload = action === "confirm" ? { status: "confirmed" } : body || {};

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Action failed");
        return;
      }

      onActionComplete();
    } finally {
      setLoading(null);
      setShowCancelInput(false);
    }
  };

  const renderIcon = (action: string, Icon: React.ElementType) => {
    if (loading === action) return <Loader2 className="w-4 h-4 animate-spin" />;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <>
          <Button
            size="sm"
            onClick={() => performAction("confirm")}
            disabled={loading !== null}
          >
            {renderIcon("confirm", CheckCircle2)}
            <span className="ml-1.5">Confirm</span>
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setShowCancelInput(true)}
            disabled={loading !== null}
          >
            {renderIcon("cancel", XCircle)}
            <span className="ml-1.5">Cancel</span>
          </Button>
        </>
      )}

      {status === "confirmed" && (
        <>
          <Button
            size="sm"
            onClick={() => performAction("checkin")}
            disabled={loading !== null}
          >
            {renderIcon("checkin", LogIn)}
            <span className="ml-1.5">Check In</span>
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setShowCancelInput(true)}
            disabled={loading !== null}
          >
            {renderIcon("cancel", XCircle)}
            <span className="ml-1.5">Cancel</span>
          </Button>
        </>
      )}

      {status === "checked_in" && (
        <Button
          size="sm"
          onClick={() => performAction("checkout")}
          disabled={loading !== null}
        >
          {renderIcon("checkout", LogOut)}
          <span className="ml-1.5">Check Out</span>
        </Button>
      )}

      {showCancelInput && (
        <div className="w-full flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Cancellation reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted"
          />
          <Button
            size="sm"
            variant="danger"
            onClick={() => performAction("cancel", { cancellation_reason: cancelReason })}
            disabled={loading !== null}
          >
            {loading === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Cancel"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCancelInput(false)}
          >
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
