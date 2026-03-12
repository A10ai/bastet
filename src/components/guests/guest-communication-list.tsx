"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Mail, Phone, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { GuestCommunication } from "@/types";

interface GuestCommunicationListProps {
  guestId: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  phone_call: <Phone className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  push: <MessageCircle className="w-4 h-4" />,
  in_app: <MessageCircle className="w-4 h-4" />,
};

export function GuestCommunicationList({ guestId }: GuestCommunicationListProps) {
  const [communications, setCommunications] = useState<GuestCommunication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComms = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/guests/${guestId}/communications`);
        const json = await res.json();
        setCommunications(json.data || []);
      } catch {
        setCommunications([]);
      } finally {
        setLoading(false);
      }
    };
    fetchComms();
  }, [guestId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-bastet-gold" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-text-primary">
          Communications
        </h3>
      </CardHeader>
      <CardContent className="p-0">
        {communications.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center px-6">
            <Mail className="w-8 h-8 text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">No communications recorded</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-bastet-border">
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Type</th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Direction</th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Subject</th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {communications.map((comm) => (
                <tr
                  key={comm.id}
                  className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 text-text-secondary">
                      {TYPE_ICONS[comm.type] || <MessageCircle className="w-4 h-4" />}
                      <span className="text-xs capitalize">{comm.type.replace("_", " ")}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-xs font-medium ${
                        comm.direction === "inbound"
                          ? "text-status-info"
                          : "text-bastet-gold"
                      }`}
                    >
                      {comm.direction === "inbound" ? "↙ In" : "↗ Out"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-text-primary max-w-xs truncate">
                    {comm.subject || "—"}
                  </td>
                  <td className="px-6 py-3">
                    <Badge status={comm.status} variant="status" />
                  </td>
                  <td className="px-6 py-3 text-xs text-text-muted">
                    {formatDate(comm.created_at, "dd MMM yyyy HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
