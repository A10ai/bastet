import { createGuestSubresourceHandler } from "@/lib/guest-subresource";
import { guestActivityQuerySchema } from "@/lib/validation";

export const GET = createGuestSubresourceHandler({
  table: "guest_activity_log",
  typeColumn: "activity_type",
  querySchema: guestActivityQuerySchema,
  defaultLimit: 50,
});
