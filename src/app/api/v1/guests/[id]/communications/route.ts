import { createGuestSubresourceHandler } from "@/lib/guest-subresource";
import { guestCommunicationsQuerySchema } from "@/lib/validation";

export const GET = createGuestSubresourceHandler({
  table: "guest_communications",
  typeColumn: "type",
  querySchema: guestCommunicationsQuerySchema,
  defaultLimit: 100,
});
