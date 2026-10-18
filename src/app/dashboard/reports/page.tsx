"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toCSV, formatReportData } from "@/lib/export-utils";
import type {
  OccupancyReport,
  RevenueReport,
  GuestReport,
  OperationsReport,
  FinancialReport,
  ExecutiveSummary,
} from "@/lib/reports-engine";
import { FileBarChart, Download, Printer, Loader2, AlertTriangle } from "lucide-react";
import type { EnergyReportData, AIDecisionsReportData, ReportData, ReportType} from "@/components/reports/report-views";
import { REPORT_LABELS, ExecutiveView, OccupancyView, RevenueView, GuestView, OperationsView, FinancialView, EnergyReportView, AIDecisionsView } from "@/components/reports/report-views";

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("executive");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/reports?type=${reportType}&from=${dateFrom}&to=${dateTo}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch report");
      }
      const json = await res.json();
      setData(json.data as ReportData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows = formatReportData(reportType, data as unknown as Record<string, unknown>);
    if (rows.length === 0) return;
    toCSV(rows, `${reportType}-report-${dateFrom}-to-${dateTo}`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: #111 !important; }
          .no-print, nav, aside, header, [data-chat-button] { display: none !important; }
          .print-header { display: block !important; }
          .report-card { background: white !important; border: 1px solid #ddd !important; color: #111 !important; break-inside: avoid; }
          .report-card * { color: #111 !important; }
          .report-section { break-before: auto; break-inside: avoid; }
          .css-bar-fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; }
          th { background: #f5f5f5 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      {/* Print header (hidden on screen) */}
      <div className="print-header hidden">
        <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
          HospitAI — {REPORT_LABELS[reportType]} — {dateFrom} to {dateTo}
        </h1>
        <hr style={{ marginBottom: 16 }} />
      </div>

      <div className="space-y-6">
        {/* Page header */}
        <div className="no-print">
          <h1 className="text-2xl font-display font-bold text-text-primary">Reports</h1>
          <p className="text-sm text-text-secondary mt-1">
            Generate professional reports for investors, operations, and management
          </p>
        </div>

        {/* Report Builder Header */}
        <Card className="no-print">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Date range */}
              <div>
                <label className="block text-xs text-text-muted mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
                />
              </div>

              {/* Report type tabs */}
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Report Type</label>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(REPORT_LABELS) as ReportType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setReportType(t)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        reportType === t
                          ? "bg-brand-accent/20 text-cyan-400 border border-cyan-400/30"
                          : "bg-brand-bg border border-brand-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {REPORT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={fetchReport} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileBarChart className="w-4 h-4 mr-1" />}
                  Generate
                </Button>
                <Button variant="secondary" onClick={handleExportCSV} disabled={!data}>
                  <Download className="w-4 h-4 mr-1" />
                  CSV
                </Button>
                <Button variant="secondary" onClick={handlePrint} disabled={!data}>
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-status-error mx-auto mb-2" />
              <p className="text-sm text-status-error">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Report content */}
        {!loading && !error && data && (
          <>
            {reportType === "executive" && <ExecutiveView data={data as ExecutiveSummary} />}
            {reportType === "occupancy" && <OccupancyView data={data as OccupancyReport} />}
            {reportType === "revenue" && <RevenueView data={data as RevenueReport} />}
            {reportType === "guests" && <GuestView data={data as GuestReport} />}
            {reportType === "operations" && <OperationsView data={data as OperationsReport} />}
            {reportType === "financial" && <FinancialView data={data as FinancialReport} />}
            {reportType === "energy" && <EnergyReportView data={data as EnergyReportData} />}
            {reportType === "ai_decisions" && <AIDecisionsView data={data as AIDecisionsReportData} />}
          </>
        )}
      </div>
    </>
  );
}
