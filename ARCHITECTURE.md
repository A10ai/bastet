# HospitAI Architecture

## Overview

HospitAI is an AI-powered hotel operating system. The platform uses a **hybrid cloud + edge architecture** designed for resilience, offline capability, and multi-property management.

## Architecture: Hybrid Cloud + Edge

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUD (Vercel + Supabase)               │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Next.js App │  │  Supabase    │  │  AI Brain        │  │
│  │ (Dashboard) │  │  (PostgreSQL │  │  (Claude API /   │  │
│  │             │  │   + Auth)    │  │   Local LLM)    │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
│         │                │                  │             │
│         └────────────────┼──────────────────┘             │
│                          │                                │
│                    Sync Service                            │
└──────────────────────────┼────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   Internet  │
                    └──────┬──────┘
                           │
┌──────────────────────────┼────────────────────────────────┐
│              EDGE BOX (Intel NUC per property)               │
│                                                             │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Local PG │ │ MQTT      │ │Automation│ │ Lock Manager │ │
│  │ (mirror) │ │ Broker    │ │ Engine   │ │              │ │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Zigbee2MQTT│ │ Docker   │ │Zigbee    │ │ Sensor       │ │
│  │           │ │ Compose  │ │Sensors   │ │ Gateway      │ │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘ │
│                                                             │
│  WORKS OFFLINE — hotel operations don't need internet      │
└─────────────────────────────────────────────────────────────┘
```

### Cloud Layer (Vercel + Supabase)

- **Next.js 14 App**: Dashboard, multi-property management, AI Brain, reporting
- **Supabase**: PostgreSQL database, Auth, RLS policies, Storage
- **AI Brain**: Currently uses Claude API (Anthropic). Transitioning to local LLM server (2x RTX 5090, Llama 3 70B) in Manchester
- **Runs on**: Vercel serverless (dashboard + API routes)

### Edge Box (per property)

- **Hardware**: Intel NUC running Docker containers
- **Local PostgreSQL**: Mirror of relevant cloud data for offline operations
- **MQTT Broker**: IoT sensor communication (wired CAT6a/Modbus for critical sensors, Zigbee supplementary)
- **Automation Engine**: Local rule execution (works without internet)
- **Lock Management**: Smart lock integration
- **Sync Service**: Bi-directional sync between local PG and Supabase cloud
- **Offline-first**: Hotel operations continue without internet connectivity

### Manchester AI Server

- **Hardware**: 2x RTX 5090
- **Model (planned)**: Llama 3 70B via Ollama/LocalAI — not yet implemented; today all AI calls go to the Claude API
- **Purpose**: Replace Claude API dependency for AI Brain and chat
- **Privacy**: Guest data stays on own infrastructure (addresses PII concerns)
- **Abstraction**: not yet built. `ai-brain.ts` and `ai-chat.ts` call `https://api.anthropic.com/v1/messages` directly; a provider abstraction is a KTP work item

## Codebase Structure

```
src/
├── app/
│   ├── api/v1/          # 75 API route files (118 HTTP methods)
│   │   ├── auth/         # Login, logout, password reset, me
│   │   ├── admin/        # Admin-only: users, database, migrate
│   │   ├── ai/           # 11 AI endpoints (brain, chat, insights, etc.)
│   │   ├── bookings/     # Booking CRUD + checkin/checkout/cancel
│   │   ├── guests/       # Guest CRM + preferences/communications
│   │   └── ...           # 20+ more resource groups
│   ├── dashboard/        # 52 dashboard pages
│   └── login/            # Auth page
├── lib/                  # 23 domain engine files (~10,500 lines)
│   ├── ai-brain.ts       # AI decision engine (Claude/LLM integration)
│   ├── ai-chat.ts        # Conversational AI assistant
│   ├── ai-engine.ts      # Pure insight generation functions
│   ├── prediction-model.ts # Statistical ML forecasting (739 lines)
│   ├── booking-engine.ts  # Booking logic, rate calculations
│   ├── finance-engine.ts  # Invoicing, payments
│   ├── revenue-engine.ts  # Revenue analytics, rate performance
│   ├── reports-engine.ts  # Report generation (occupancy, revenue, etc.)
│   ├── event-bus.ts       # Cross-system event bus (13 event types)
│   ├── workflow-engine.ts # Multi-step workflow with approvals
│   ├── automations-engine.ts # Rule-based automations
│   ├── energy-engine.ts   # Energy optimization
│   ├── guest-intelligence.ts # Guest scoring, churn risk, upsell
│   ├── notifications.ts    # Notification CRUD
│   ├── audit.ts           # Audit trail logging
│   ├── api-auth.ts        # Auth verification (server-only)
│   ├── api-property.ts    # Property scoping (server-only)
│   ├── env.ts             # Environment variable validation
│   ├── supabase/
│   │   ├── server.ts      # Server client (anon key, RLS-enforced)
│   │   ├── admin.ts       # Admin client (service role, RLS-bypassing)
│   │   └── client.ts      # Browser client
│   ├── constants.ts       # Business rules, navigation config
│   ├── utils.ts           # Shared utilities
│   └── export-utils.ts    # CSV export
├── types/
│   └── database.ts       # Database row interfaces (847 lines)
├── components/            # Shared UI components
├── hooks/                 # Custom React hooks
└── providers/             # Context providers (Auth, Property, Theme)
```

## Key Architectural Decisions

1. **Server-only guards**: lib files that touch secrets (`api-auth`, `api-property`, `supabase/admin`, `env`, `sentry`, `csrf`, `rpc-error` and others) carry `import "server-only"`. The engines that only receive a Supabase client as a parameter do not yet; adding the guard to them is open housekeeping.

2. **Dual Supabase clients**: `createServerSupabaseClient()` uses the anon key (RLS enforced). `createAdminClient()` uses the service-role key (bypasses RLS) and is used by the admin routes, by `requireRole`/`api-property` to read the caller's staff row (RLS would be circular there), by login/reset-password, and by the AI brain config. Identity is always established with `auth.getUser()` first.

3. **Event bus pattern**: 13 event types with a handler registry. Events are persisted to DB and handlers perform real Supabase operations.

4. **Wired-first IoT**: Critical sensors use wired CAT6a/Modbus. Zigbee is supplementary for Phase 2 non-critical additions.

5. **Offline-first Edge Box**: The Edge Box is a persistent local server, solving the in-memory scheduler and module-level state problems that would fail in serverless.

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Recharts
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL 17) with 52 tables, RLS on every table, 21 migrations (00019-00021 added by the October 2026 audit)
- **AI**: Claude API (Anthropic) → transitioning to local Llama 3 70B
- **Auth**: Supabase Auth with middleware + API-level guards
- **Integrations**: none wired yet. Environment keys exist for Stripe, Resend, Google Maps and Open Exchange Rates, but there is no code using them; currency rates are entered manually
- **Edge**: Intel NUC, Docker, MQTT, Zigbee2MQTT, local PostgreSQL