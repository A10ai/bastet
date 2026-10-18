import { ROLES } from "@/lib/api-auth";
import { getByIdHandler, updateByIdHandler } from "@/lib/crud";
import { createApartmentTypeSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "apartment_types",
  roles: ROLES.ALL_STAFF,
  label: "Apartment type",
});

export const PUT = updateByIdHandler({
  table: "apartment_types",
  roles: ROLES.MANAGEMENT,
  schema: createApartmentTypeSchema.partial(),
  allowedFields: ["name", "base_rate_gbp", "base_weekly_rate_gbp", "base_rate", "base_weekly_rate", "max_occupancy", "description"],
  label: "Apartment type",
  audit: { action: "apartment_type.update", category: "settings", resource_type: "apartment_type" },
});
