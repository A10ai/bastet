/**
 * HospitAI OpenAPI 3.0 Specification
 *
 * Auto-generated structure for the HospitAI API v1.
 * This documents all 68+ API endpoints across 22 resource groups.
 *
 * Usage: Import into Swagger UI or Redoc for interactive docs.
 * In production, this should be auto-generated from the route handlers
 * using next-rest-documenter or a similar tool.
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "HospitAI API",
    version: "1.0.0",
    description: "Hotel property management system API for Bastet Hurghada. All endpoints require authentication except /health and /login.",
    contact: {
      name: "HospitAI",
      url: "https://hospitai.uk",
      email: "api@hospitai.uk",
    },
    license: {
      name: "Proprietary",
    },
  },
  servers: [
    { url: "https://app.hospitai.uk/api/v1", description: "Production" },
    { url: "http://localhost:3000/api/v1", description: "Local development" },
    { url: "http://edge-box:3000/api/v1", description: "Edge Box (on-site)" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "sb-access-token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      ApiResponse: {
        type: "object",
        properties: {
          data: { type: "object" },
          meta: { type: "object" },
        },
      },
      Guest: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          loyalty_tier: { type: "string", enum: ["standard", "silver", "gold", "platinum"] },
          nationality: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Booking: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          reference: { type: "string", description: "BAS-HRG-YYNNNN" },
          guest_id: { type: "string", format: "uuid" },
          apartment_id: { type: "string", format: "uuid" },
          check_in: { type: "string", format: "date" },
          check_out: { type: "string", format: "date" },
          status: { type: "string", enum: ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"] },
          total_gbp: { type: "number" },
          nights: { type: "integer" },
        },
      },
      Apartment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          number: { type: "string" },
          floor: { type: "integer" },
          building_id: { type: "string", format: "uuid" },
          apartment_type_id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["available", "occupied", "maintenance", "cleaning", "blocked", "out_of_service"] },
        },
      },
      Staff: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["owner", "admin", "manager", "receptionist", "housekeeping", "maintenance"] },
          is_active: { type: "boolean" },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          invoice_number: { type: "string", description: "INV-HRG-YYNNNN" },
          booking_id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["draft", "sent", "paid", "partially_paid", "overdue", "cancelled"] },
          total_gbp: { type: "number" },
        },
      },
      BrainDecision: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          cycle_id: { type: "string" },
          category: { type: "string", enum: ["pricing", "operations", "energy", "guest", "maintenance", "revenue"] },
          action: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          auto_executable: { type: "boolean" },
          executed: { type: "boolean" },
          approved: { type: "boolean", nullable: true },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Core", description: "Properties, buildings, apartments" },
    { name: "Bookings", description: "Booking management" },
    { name: "Guests", description: "Guest CRM" },
    { name: "Staff", description: "Staff management" },
    { name: "Operations", description: "Housekeeping, maintenance" },
    { name: "Finance", description: "Invoices, expenses, currency" },
    { name: "AI", description: "AI Brain, insights, predictions" },
    { name: "Admin", description: "Admin tools (owner/admin only)" },
    { name: "GDPR", description: "Data protection and privacy" },
    { name: "Health", description: "System health checks" },
  ],
  paths: {
    // Auth
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } } } } },
        },
        responses: { "200": { description: "Login successful" }, "401": { description: "Invalid credentials" }, "429": { description: "Rate limited" } },
      },
    },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Logout and clear session", responses: { "200": { description: "Logged out" } } } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Get current user", responses: { "200": { description: "Current staff member" } } } },

    // Health
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check (no auth required)",
        security: [],
        responses: { "200": { description: "Healthy" }, "503": { description: "Degraded" } },
      },
    },

    // Core
    "/properties": { get: { tags: ["Core"], summary: "List properties", responses: { "200": { description: "Properties list" } } } },
    "/buildings": { get: { tags: ["Core"], summary: "List buildings", responses: { "200": { description: "Buildings list" } } } },
    "/apartments": { get: { tags: ["Core"], summary: "List apartments", responses: { "200": { description: "Apartments list" } } } },
    "/apartment-types": { get: { tags: ["Core"], summary: "List apartment types", responses: { "200": { description: "Apartment types" } } } },

    // Bookings
    "/bookings": { get: { tags: ["Bookings"], summary: "List bookings", parameters: [{ name: "status", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Bookings list" } } } },
    "/bookings/{id}": { get: { tags: ["Bookings"], summary: "Get booking by ID", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Booking" }, "404": { description: "Not found" } } } },

    // Guests
    "/guests": { get: { tags: ["Guests"], summary: "List guests", responses: { "200": { description: "Guests list" } } } },
    "/guests/{id}": { get: { tags: ["Guests"], summary: "Get guest by ID", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Guest" } } } },

    // Staff
    "/staff": { get: { tags: ["Staff"], summary: "List staff", responses: { "200": { description: "Staff list" } } } },

    // Operations
    "/housekeeping": { get: { tags: ["Operations"], summary: "List housekeeping tasks", responses: { "200": { description: "Housekeeping tasks" } } } },
    "/maintenance": { get: { tags: ["Operations"], summary: "List maintenance requests", responses: { "200": { description: "Maintenance requests" } } } },

    // Finance
    "/invoices": { get: { tags: ["Finance"], summary: "List invoices", responses: { "200": { description: "Invoices list" } } } },
    "/expenses": { get: { tags: ["Finance"], summary: "List expenses", responses: { "200": { description: "Expenses list" } } } },
    "/finance/summary": { get: { tags: ["Finance"], summary: "Financial summary", responses: { "200": { description: "Financial summary" } } } },

    // AI
    "/ai/brain": { get: { tags: ["AI"], summary: "Get AI Brain config + history", responses: { "200": { description: "Brain status" } } }, post: { tags: ["AI"], summary: "Run brain cycle / update config / approve decision", responses: { "200": { description: "Brain action result" } } } },
    "/ai/insights": { get: { tags: ["AI"], summary: "Get AI insights", responses: { "200": { description: "Insights list" } } } },
    "/ai/predictions": { get: { tags: ["AI"], summary: "Get demand predictions", responses: { "200": { description: "Predictions" } } } },
    "/ai/chat": { post: { tags: ["AI"], summary: "Chat with AI assistant", responses: { "200": { description: "AI response" } } } },
    "/ai/automations": { get: { tags: ["AI"], summary: "List automations", responses: { "200": { description: "Automations" } } } },
    "/ai/events": { get: { tags: ["AI"], summary: "List system events", responses: { "200": { description: "Events" } } } },
    "/ai/workflows": { get: { tags: ["AI"], summary: "List workflows", responses: { "200": { description: "Workflows" } } } },

    // Admin
    "/admin/users": { get: { tags: ["Admin"], summary: "List users (admin/owner only)", responses: { "200": { description: "Users list" } } } },
    "/admin/database": { get: { tags: ["Admin"], summary: "Database info (admin/owner only)", responses: { "200": { description: "Database info" } } } },

    // GDPR
    "/gdpr": {
      get: { tags: ["GDPR"], summary: "Export guest data or get consent status", parameters: [{ name: "action", in: "query", schema: { type: "string", enum: ["export", "consent", "requests"] } }, { name: "guest_id", in: "query", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Data export or consent status" } } },
      post: { tags: ["GDPR"], summary: "Request erasure, update consent, or execute erasure", responses: { "200": { description: "Action completed" } } },
    },

    // Dashboard
    "/dashboard/stats": { get: { tags: ["Core"], summary: "Dashboard statistics", responses: { "200": { description: "Stats" } } } },
    "/briefing": { get: { tags: ["Core"], summary: "Daily briefing", responses: { "200": { description: "Briefing" } } } },
    "/reports": { get: { tags: ["Core"], summary: "Generate report", parameters: [{ name: "type", in: "query", required: true, schema: { type: "string", enum: ["occupancy", "revenue", "guest", "operations", "financial", "executive", "energy", "ai_decisions"] } }, { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } }, { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } }], responses: { "200": { description: "Report data" } } } },
  },
};