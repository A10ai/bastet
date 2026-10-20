import { ROLES } from "@/lib/api-auth";
import { getByIdHandler, updateByIdHandler } from "@/lib/crud";
import { updateBookingChannelSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "booking_channels",
  roles: ROLES.ALL_STAFF,
  label: "Booking channel",
});

export const PUT = updateByIdHandler({
  table: "booking_channels",
  roles: ROLES.MANAGEMENT,
  schema: updateBookingChannelSchema,
  allowedFields: ["name", "commission_rate", "is_active", "channel_type"],
  label: "Booking channel",
  audit: { action: "booking_channel.update", category: "settings", resource_type: "booking_channel" },
});
