"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Users,
  Plus,
  Loader2,
  Edit2,
  UserX,
  UserCheck,
  X,
  Save,
  Search,
} from "lucide-react";
import { STAFF_ROLES } from "@/lib/constants";

interface StaffUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  hire_date: string | null;
  created_at: string;
  auth_info: {
    email: string;
    last_sign_in_at: string | null;
    created_at: string;
    email_confirmed_at: string | null;
    banned_until: string | null;
  } | null;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

const DEPARTMENTS = [
  "management",
  "front_desk",
  "housekeeping",
  "maintenance",
  "finance",
  "marketing",
  "operations",
];

export default function UserManagementPage() {
  const { staff: currentStaff, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone: "",
    role: "receptionist",
    department: "",
  });
  const [creating, setCreating] = useState(false);

  // Edit user
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    role: string;
    department: string;
  }>({ role: "", department: "" });

  const showToast = (message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/users");
      const json = await res.json();
      setUsers(json.data || []);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    if (
      !createForm.first_name ||
      !createForm.last_name ||
      !createForm.email ||
      !createForm.password
    ) {
      showToast("Please fill all required fields", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("User created successfully");
      setShowCreateForm(false);
      setCreateForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        phone: "",
        role: "receptionist",
        department: "",
      });
      fetchUsers();
    } catch {
      showToast("Failed to create user", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          role: editForm.role,
          department: editForm.department || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("User updated");
      setEditingUser(null);
      fetchUsers();
    } catch {
      showToast("Update failed", "error");
    }
  };

  const handleToggleActive = async (user: StaffUser) => {
    if (user.is_active) {
      // Disable
      try {
        const res = await fetch(`/api/v1/admin/users?id=${user.id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (json.error) {
          showToast(json.error, "error");
          return;
        }
        showToast("User disabled");
        fetchUsers();
      } catch {
        showToast("Failed to disable user", "error");
      }
    } else {
      // Re-enable
      try {
        const res = await fetch("/api/v1/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user.id, is_active: true }),
        });
        const json = await res.json();
        if (json.error) {
          showToast(json.error, "error");
          return;
        }
        showToast("User re-enabled");
        fetchUsers();
      } catch {
        showToast("Failed to enable user", "error");
      }
    }
  };

  const startEdit = (user: StaffUser) => {
    setEditingUser(user.id);
    setEditForm({
      role: user.role,
      department: user.department || "",
    });
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      `${u.first_name} ${u.last_name} ${u.email}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  // Access control
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!currentStaff || !["owner", "admin"].includes(currentStaff.role)) {
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

  const inputClass =
    "w-full bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary px-3 py-2 placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40";

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
            <span className="text-text-secondary">User Management</span>
          </div>
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-display font-bold text-text-primary">
              User Management
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {users.length} users total,{" "}
            {users.filter((u) => u.is_active).length} active
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-text-primary">
                Create New User
              </h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  First Name *
                </label>
                <input
                  type="text"
                  value={createForm.first_name}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      first_name: e.target.value,
                    }))
                  }
                  placeholder="John"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={createForm.last_name}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      last_name: e.target.value,
                    }))
                  }
                  placeholder="Smith"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Email *
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="john@example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Password *
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Min 6 characters"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Phone
                </label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="+44 123 456 7890"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Role *
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, role: e.target.value }))
                  }
                  className={inputClass}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                  Department
                </label>
                <select
                  value={createForm.department}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      department: e.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Create User
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40"
        />
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bastet-border bg-bastet-bg/50">
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Department
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Auth Status
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-6 py-3">
                    Last Sign In
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => (
                  <tr
                    key={user.id}
                    className={`border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors ${
                      idx % 2 === 1 ? "bg-bastet-bg/20" : ""
                    }`}
                  >
                    <td className="px-6 py-3">
                      <span className="font-semibold text-text-primary">
                        {user.first_name} {user.last_name}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-text-secondary">
                      {user.email}
                    </td>
                    <td className="px-6 py-3">
                      {editingUser === user.id ? (
                        <select
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              role: e.target.value,
                            }))
                          }
                          className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                        >
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge status={user.role} variant="status">
                          {user.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {editingUser === user.id ? (
                        <select
                          value={editForm.department}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              department: e.target.value,
                            }))
                          }
                          className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                        >
                          <option value="">None</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-text-secondary capitalize">
                          {user.department?.replace(/_/g, " ") || "\u2014"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {user.auth_user_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-400/10 text-cyan-400">
                          Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning">
                          No Auth
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.is_active
                            ? "bg-status-success/10 text-status-success"
                            : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-text-muted">
                      {user.auth_info?.last_sign_in_at
                        ? new Date(
                            user.auth_info.last_sign_in_at
                          ).toLocaleDateString()
                        : "\u2014"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editingUser === user.id ? (
                          <>
                            <button
                              onClick={() => handleEdit(user.id)}
                              className="p-1.5 text-status-success hover:bg-status-success/10 rounded transition-colors"
                              title="Save"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(user)}
                              className="p-1.5 text-text-muted hover:text-cyan-400 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(user)}
                              className={`p-1.5 rounded transition-colors ${
                                user.is_active
                                  ? "text-text-muted hover:text-status-error"
                                  : "text-text-muted hover:text-status-success"
                              }`}
                              title={
                                user.is_active ? "Disable" : "Enable"
                              }
                            >
                              {user.is_active ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">No users found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
