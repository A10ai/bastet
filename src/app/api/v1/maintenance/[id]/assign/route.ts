import { createAssignHandler } from "@/lib/assign-handler";

export const POST = createAssignHandler({
  table: "maintenance_requests",
  label: "maintenance request",
  assignableRoles: ["maintenance", "manager"],
  assignableStatuses: ["open", "assigned", "on_hold"],
  select: `
    *,
    apartment:apartments(id, number, building:buildings(id, name, code)),
    assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role)
  `,
  audit: { action: "maintenance.assign", category: "maintenance", resource_type: "maintenance_request" },
});
