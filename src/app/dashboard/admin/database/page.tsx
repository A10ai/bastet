"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Database,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  X,
  ArrowUpDown,
} from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function DatabaseExplorerPage() {
  const { staff, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState(
    searchParams.get("table") || ""
  );
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Inline editing
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // New row
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showToast = (message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Load tables list
  useEffect(() => {
    const fetchTables = async () => {
      const res = await fetch("/api/v1/admin/database");
      const json = await res.json();
      if (json.tables) setTables(json.tables);
    };
    fetchTables();
  }, []);

  // Load table data
  const fetchTableData = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        table: selectedTable,
        page: String(page),
        sort: sortCol,
        dir: sortDir,
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/admin/database?${params}`);
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      setRows(json.data || []);
      setColumns(json.columns || []);
      setTotalPages(json.totalPages || 1);
      setTotal(json.total || 0);
    } catch {
      showToast("Failed to load table data", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedTable, page, search, sortCol, sortDir]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  // Table selection handler
  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    setPage(1);
    setSearch("");
    setSortCol("created_at");
    setSortDir("desc");
    setShowNewRow(false);
    setEditingCell(null);
    router.push(`/dashboard/admin/database?table=${table}`);
  };

  // Sort handler
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Inline edit handlers
  const startEdit = (rowId: string, col: string, currentValue: any) => {
    if (col === "id" || col === "created_at" || col === "updated_at") return;
    setEditingCell({ rowId, col });
    setEditValue(currentValue === null ? "" : String(currentValue));
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { rowId, col } = editingCell;

    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: selectedTable,
          id: rowId,
          updates: { [col]: editValue || null },
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Cell updated");
      // Update local state
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, [col]: editValue || null } : r
        )
      );
    } catch {
      showToast("Update failed", "error");
    }
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Add new row
  const handleAddRow = async () => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: selectedTable,
          row: newRowData,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Row added");
      setShowNewRow(false);
      setNewRowData({});
      fetchTableData();
    } catch {
      showToast("Failed to add row", "error");
    }
  };

  // Delete row
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(
        `/api/v1/admin/database?table=${selectedTable}&id=${id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Row deleted");
      setDeleteConfirm(null);
      fetchTableData();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  // Format cell value for display
  const formatCell = (value: any): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    const str = String(value);
    return str.length > 80 ? str.slice(0, 80) + "..." : str;
  };

  // Access control
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!staff || !["owner", "admin"].includes(staff.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-16 h-16 text-status-error mb-4" />
        <h1 className="text-2xl font-display font-bold text-text-primary mb-2">
          Access Denied
        </h1>
        <p className="text-text-secondary">
          You need owner or admin privileges to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "bg-status-success/20 text-status-success border border-status-success/30"
                : "bg-status-error/20 text-status-error border border-status-error/30"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
            <Link
              href="/dashboard/admin"
              className="hover:text-cyan-400 transition-colors"
            >
              Admin
            </Link>
            <span>/</span>
            <span className="text-text-secondary">Database Explorer</span>
          </div>
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Database Explorer
            </h1>
          </div>
        </div>
      </div>

      {/* Table Selector & Search */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedTable}
          onChange={(e) => handleTableChange(e.target.value)}
          className="bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary px-3 py-2 focus:outline-none focus:border-cyan-400/40 min-w-[200px]"
        >
          <option value="">Select a table...</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {selectedTable && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search records..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowNewRow(true);
                setNewRowData({});
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Row
            </Button>
            <span className="text-xs text-text-muted ml-auto">
              {total.toLocaleString()} records
            </span>
          </>
        )}
      </div>

      {/* Data Table */}
      {selectedTable && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bastet-border bg-bastet-bg/50">
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3 whitespace-nowrap cursor-pointer hover:text-cyan-400 transition-colors select-none"
                          onClick={() => handleSort(col)}
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-mono">{col}</span>
                            {sortCol === col && (
                              <ArrowUpDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3 w-20">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* New row form */}
                    {showNewRow && (
                      <tr className="border-b border-cyan-400/20 bg-cyan-400/5">
                        {columns.map((col) => (
                          <td key={col} className="px-4 py-2">
                            {col === "id" ||
                            col === "created_at" ||
                            col === "updated_at" ? (
                              <span className="text-text-muted text-xs italic">
                                auto
                              </span>
                            ) : (
                              <input
                                type="text"
                                placeholder={col}
                                value={newRowData[col] || ""}
                                onChange={(e) =>
                                  setNewRowData((prev) => ({
                                    ...prev,
                                    [col]: e.target.value,
                                  }))
                                }
                                className="w-full bg-bastet-bg border border-bastet-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleAddRow}
                              className="p-1 text-status-success hover:bg-status-success/10 rounded transition-colors"
                              title="Save"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setShowNewRow(false)}
                              className="p-1 text-text-muted hover:text-status-error rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Data rows */}
                    {rows.map((row, idx) => (
                      <tr
                        key={row.id || idx}
                        className={`border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors ${
                          idx % 2 === 1 ? "bg-bastet-bg/20" : ""
                        }`}
                      >
                        {columns.map((col) => (
                          <td
                            key={col}
                            className="px-4 py-2.5 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis"
                          >
                            {editingCell?.rowId === row.id &&
                            editingCell?.col === col ? (
                              <input
                                ref={editRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit();
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                onBlur={saveEdit}
                                className="w-full bg-bastet-bg border border-cyan-400/40 rounded px-2 py-0.5 text-xs text-text-primary focus:outline-none"
                              />
                            ) : (
                              <span
                                className={`text-xs cursor-pointer ${
                                  col === "id"
                                    ? "text-text-muted font-mono"
                                    : row[col] === null
                                      ? "text-text-muted italic"
                                      : "text-text-secondary"
                                }`}
                                onClick={() =>
                                  startEdit(row.id, col, row[col])
                                }
                                title={
                                  col === "id" ||
                                  col === "created_at" ||
                                  col === "updated_at"
                                    ? "Read-only"
                                    : "Click to edit"
                                }
                              >
                                {formatCell(row[col])}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right">
                          {deleteConfirm === row.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="px-2 py-0.5 bg-status-error/20 text-status-error text-xs rounded hover:bg-status-error/30 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-0.5 text-text-muted text-xs hover:text-text-primary transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(row.id)}
                              className="p-1 text-text-muted hover:text-status-error rounded transition-colors"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
                          className="text-center py-12 text-text-muted text-sm"
                        >
                          No records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-bastet-border">
                <span className="text-xs text-text-muted">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bastet-bg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          page === pageNum
                            ? "bg-cyan-400 text-bastet-bg"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bastet-bg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No table selected */}
      {!selectedTable && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Database className="w-12 h-12 text-text-muted mb-3" />
            <p className="text-text-secondary text-sm">
              Select a table from the dropdown to explore its data
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
