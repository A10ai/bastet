"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, Loader2, Plus, Beaker } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense } from "@/types";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rndFilter, setRndFilter] = useState<string>("");

  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (rndFilter) params.set("is_r_and_d", rndFilter);
        const res = await fetch(`/api/v1/expenses?${params}`);
        const json = await res.json();
        setExpenses(json.data || []);
      } catch {
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchExpenses();
  }, [rndFilter]);

  const filtered =
    categoryFilter === "all"
      ? expenses
      : expenses.filter((e) => e.category === categoryFilter);

  const totalEgp = filtered.reduce((sum, e) => sum + e.amount_egp, 0);
  const totalGbp = filtered.reduce((sum, e) => sum + (e.amount_gbp || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/finance" className="text-sm text-text-secondary hover:text-bastet-gold">
              Finance
            </Link>
            <span className="text-text-muted">/</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Expenses</h1>
          <p className="text-sm text-text-secondary mt-1">
            {expenses.length} expenses — Total: {formatCurrency(totalGbp)} ({formatCurrency(totalEgp, "EGP")})
          </p>
        </div>
        <Link href="/dashboard/finance/expenses/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Expense
          </Button>
        </Link>
      </div>

      {/* R&D Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-bastet-card border border-bastet-border rounded-lg p-0.5">
          <button
            onClick={() => setRndFilter("")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rndFilter === "" ? "bg-bastet-gold text-bastet-bg" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setRndFilter("true")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              rndFilter === "true" ? "bg-bastet-gold text-bastet-bg" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Beaker className="w-3 h-3" />
            R&D Only
          </button>
          <button
            onClick={() => setRndFilter("false")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rndFilter === "false" ? "bg-bastet-gold text-bastet-bg" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Non-R&D
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            categoryFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({expenses.length})
        </button>
        {EXPENSE_CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                categoryFilter === cat
                  ? "bg-bastet-gold text-bastet-bg"
                  : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {cat.replace("_", " ")} ({count})
            </button>
          );
        })}
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Description</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Category</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Amount (EGP)</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Amount (GBP)</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Flags</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Vendor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                  >
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">{exp.description}</td>
                    <td className="px-6 py-3">
                      <Badge variant="status" status={exp.category}>
                        {exp.category.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">
                      {formatCurrency(exp.amount_egp, "EGP")}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">
                      {exp.amount_gbp != null ? formatCurrency(exp.amount_gbp) : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1">
                        {exp.is_r_and_d && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-info/10 text-status-info">
                            R&D
                          </span>
                        )}
                        {exp.is_recurring && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-bastet-gold-muted text-bastet-gold">
                            Recurring
                          </span>
                        )}
                        {exp.approved_by && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-success/10 text-status-success">
                            Approved
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {exp.vendor || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">No expenses found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
