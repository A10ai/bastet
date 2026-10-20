"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STAFF_ROLES } from "@/lib/constants";
import type { Staff } from "@/types";

export interface StaffFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  language: string;
  hireDate: string;
}

export const emptyStaffForm: StaffFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "",
  department: "",
  language: "en",
  hireDate: "",
};

export function staffToForm(s: Staff): StaffFormValues {
  return {
    firstName: s.first_name,
    lastName: s.last_name,
    email: s.email,
    phone: s.phone || "",
    role: s.role,
    department: s.department || "",
    language: s.language,
    hireDate: s.hire_date || "",
  };
}

/** Request body for POST /api/v1/staff and PATCH /api/v1/staff/:id. */
export function staffFormToPayload(v: StaffFormValues) {
  return {
    first_name: v.firstName,
    last_name: v.lastName,
    email: v.email,
    phone: v.phone || null,
    role: v.role,
    department: v.department || null,
    language: v.language,
    hire_date: v.hireDate || null,
  };
}

const selectClass =
  "w-full px-3 py-2.5 bg-brand-bg border border-brand-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50";

interface StaffFormFieldsProps {
  values: StaffFormValues;
  onChange: (patch: Partial<StaffFormValues>) => void;
  /** Show a "Select role..." placeholder (new records). */
  allowEmptyRole?: boolean;
}

/**
 * The personal-information and role cards shared by the new and edit staff
 * pages (previously duplicated in both).
 */
export function StaffFormFields({ values, onChange, allowEmptyRole = false }: StaffFormFieldsProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Personal Information</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" id="firstName" value={values.firstName} onChange={(e) => onChange({ firstName: e.target.value })} required />
            <Input label="Last Name" id="lastName" value={values.lastName} onChange={(e) => onChange({ lastName: e.target.value })} required />
            <Input label="Email" type="email" id="email" value={values.email} onChange={(e) => onChange({ email: e.target.value })} required />
            <Input label="Phone" type="tel" id="phone" value={values.phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Role &amp; Department</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-text-secondary mb-1.5">Role</label>
              <select
                id="role"
                value={values.role}
                onChange={(e) => onChange({ role: e.target.value })}
                required
                className={selectClass}
              >
                {allowEmptyRole && <option value="">Select role...</option>}
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <Input label="Department" id="department" value={values.department} onChange={(e) => onChange({ department: e.target.value })} />
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
              <select
                id="language"
                value={values.language}
                onChange={(e) => onChange({ language: e.target.value })}
                className={selectClass}
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="ru">Russian</option>
                <option value="de">German</option>
              </select>
            </div>
            <Input label="Hire Date" type="date" id="hireDate" value={values.hireDate} onChange={(e) => onChange({ hireDate: e.target.value })} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
