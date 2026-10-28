import { ROLES } from "@/lib/api-auth";
import { getByIdHandler, updateByIdHandler } from "@/lib/crud";
import { updateBookingChannelSchema } from "@/lib/validation";
import { BOOKING_CHANNEL_COLUMNS } from "@/lib/constants";

export const GET = getByIdHandler({
  table: "booking_channels",
  roles: ROLES.ALL_STAFF,
  select: BOOKING_CHANNEL_COLUMNS,
  label: "Booking channel",
});

export const PUT = updateByIdHandler({
  table: "booking_channels",
  // Channels are shared by every property: owner only. Migration 00035 grants
  // UPDATE on exactly these columns, with an owner-only policy.
  roles: ROLES.OWNER,
  schema: updateBookingChannelSchema,
  select: BOOKING_CHANNEL_COLUMNS,
  allowedFields: ["name", "commission_rate", "is_active"],
  label: "Booking channel",
  audit: { action: "booking_channel.update", category: "settings", resource_type: "booking_channel" },
});
