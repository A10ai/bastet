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
  // Channels are shared by every property: owner only (the database grants no
  // UPDATE on booking_channels to app roles, so this answers 403 until it does)
  roles: ROLES.OWNER,
  schema: updateBookingChannelSchema,
  select: BOOKING_CHANNEL_COLUMNS,
  allowedFields: ["name", "commission_rate", "is_active", "channel_type"],
  label: "Booking channel",
  audit: { action: "booking_channel.update", category: "settings", resource_type: "booking_channel" },
});
