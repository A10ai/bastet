import { createAssignHandler } from "@/lib/assign-handler";

export const POST = createAssignHandler({
  table: "housekeeping_tasks",
  label: "housekeeping task",
  assignableRoles: ["housekeeping", "manager"],
  assignableStatuses: ["pending", "assigned"],
  select: `
    *,
    apartment:apartments(id, number, building:buildings(id, name, code)),
    assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role)
  `,
  audit: { action: "housekeeping.assign", category: "housekeeping", resource_type: "housekeeping_task" },
});
