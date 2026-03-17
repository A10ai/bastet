# HospitAI Pitch Deck

---

## HospitAI — The AI Operating System for Hotels

**Intelligent hotel operations, unified.**

One AI platform that connects every hotel system — from pricing to housekeeping to energy — through a single intelligence layer that observes, reasons, and acts.

- **Company**: HospitAI Ltd (UK registered)
- **Product**: Live prototype at [app.hospitai.uk](https://app.hospitai.uk)
- **Website**: [hospitai.uk](https://hospitai.uk)
- **First deployment**: Bastet Hurghada, 270-unit aparthotel, Egypt — Q2 2027
- **Sector**: Hospitality technology / Applied AI

---

## The Problem

**Hotels run on fragmented, disconnected systems with no cross-system intelligence.**

- A typical hotel uses **8-12 separate software systems** that do not communicate
- When a guest checks out, housekeeping does not know automatically. When a room is cleaned, pricing does not adjust. When occupancy drops, energy systems keep running at full capacity
- Revenue decisions are made on gut feeling, not data
- Housekeeping schedules are static, not responsive
- Energy is wasted on empty rooms 24 hours a day
- Staff spend hours on manual coordination between systems

**The result**: Higher costs, lower revenue, worse guest experience, unnecessary energy waste.

**The gap is widest in aparthotels and extended-stay properties** — the fastest-growing segment with the lowest technology adoption.

---

## The Solution

**One AI platform connecting six core hotel systems through a single intelligence layer.**

| System | What It Does |
|--------|-------------|
| **Property Management** | Bookings, guests, apartments, availability |
| **Revenue & Pricing** | Dynamic pricing, channel optimisation, forecasting |
| **Housekeeping** | Auto-scheduling, priority routing, quality tracking |
| **Maintenance** | Predictive patterns, task automation, asset lifecycle |
| **Energy Management** | Waste detection, standby modes, CO2 tracking |
| **Guest Intelligence** | LTV scoring, churn detection, personalisation |

**The difference**: These are not six separate products. They are one system with one AI brain that understands the relationships between every event, every guest, and every room.

A checkout triggers cleaning. Cleaning triggers availability. Availability triggers pricing. Pricing triggers channel distribution. **All automatically.**

---

## How It Works

**The AI Brain: Observe, Reason, Act, Learn**

```
         OBSERVE                    REASON                     ACT
   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  Event Bus       │      │  AI Brain        │      │  Smart           │
   │  13 event types  │ ───> │  Claude API      │ ───> │  Automations     │
   │  7 active        │      │  Health scoring  │      │  5 active        │
   │  handlers        │      │  Pattern detect  │      │  workflows       │
   └─────────────────┘      └─────────────────┘      └─────────────────┘
                                                              │
                                    LEARN <───────────────────┘
                              Performance tracking
                              Outcome measurement
```

**Two operating modes:**

- **Supervised mode** — AI recommends actions, humans approve. Ideal for onboarding and trust-building.
- **Autonomous mode** — AI executes within defined boundaries. Ideal for repetitive, time-sensitive decisions like pricing and housekeeping dispatch.

The autonomy switch lets operators move between modes per function, building confidence incrementally.

---

## Live Prototype

**Working software at [app.hospitai.uk](https://app.hospitai.uk) — not a mockup, not a pitch video.**

Built and deployed:

- **AI Command Centre** — health scoring, dynamic pricing engine, occupancy forecasting
- **AI Chat Assistant** — natural language queries across all hotel data
- **Revenue Copilot** — channel optimisation, what-if simulator, 30-day revenue forecasting
- **Smart Automations (5 active)** — auto pricing, auto housekeeping, maintenance patterns, VIP preparation, energy standby
- **Event Bus** — cross-system intelligence with 13 event types and 7 active handlers
- **Energy Dashboard** — waste detection, consumption heatmap, CO2 tracking
- **Guest Intelligence** — lifetime value scoring, churn detection, upsell opportunities
- **Full PMS** — 270 apartments configured, bookings, guests, housekeeping, maintenance, finance, staff management
- **Availability Calendar** — real-time room inventory
- **Reports & Export** — 6 report types with CSV export
- **Admin Panel** — database explorer, system configuration
- **Mobile responsive** — full functionality on any device

**Cloud deployed**: Vercel (frontend/API) + Supabase (database/auth)

---

## AI Intelligence Layer

**The Event Bus is the nervous system. Smart Automations are the reflexes.**

**How cross-system intelligence works — the checkout cascade:**

```
Guest checks out
  └─> Event: BOOKING_CHECKOUT
        └─> Housekeeping auto-dispatched (priority calculated by next booking proximity)
              └─> Event: ROOM_CLEANED
                    └─> Room status → AVAILABLE
                          └─> Dynamic pricing recalculated (supply/demand)
                                └─> Channel distribution updated
```

One guest action triggers an intelligent chain across four systems — **with zero manual intervention**.

**13 event types** covering bookings, housekeeping, maintenance, energy, guests, and revenue.

**5 Smart Automations running today:**

| Automation | Trigger | Action |
|-----------|---------|--------|
| Auto Pricing | Occupancy change, date threshold | Adjust rates by demand curve |
| Auto Housekeeping | Checkout, schedule, priority | Dispatch and route cleaning teams |
| Maintenance Patterns | Recurring triggers, sensor data | Pre-schedule preventive tasks |
| VIP Preparation | High-LTV guest booking detected | Trigger enhanced room prep workflow |
| Energy Standby | Room vacant beyond threshold | Reduce HVAC, lighting to standby |

---

## Market Opportunity

**A $220 billion market with one of the lowest AI adoption rates of any major sector.**

- **187,000 hotels globally**, representing **17.5 million rooms**
- Hospitality technology market projected to reach **$220B by 2030**
- **Aparthotel segment**: fastest-growing accommodation category, lowest technology adoption
- Hotels spend **3-5% of revenue on technology** vs 7-10% in comparable industries

**Egypt — a strategic first market:**

- **15.8 million visitors in 2024**
- Government target: **30 million visitors by 2028-2030** (near doubling)
- Massive hotel construction pipeline along the Red Sea coast
- Strong demand for operational efficiency in a cost-sensitive market
- Limited competition from incumbent hotel tech providers

**Our entry point**: New-build aparthotels in high-growth tourism markets where there is no legacy system to replace — only greenfield deployment.

---

## Pilot Property — Bastet Hurghada

**270 units. Single building. Six floors. One AI brain.**

| Detail | Specification |
|--------|--------------|
| **Location** | Kawthar District, Hurghada, Red Sea, Egypt |
| **Building** | ~32,000 sqm, single structure, 6 floors |
| **Total units** | 270 apartments |
| **Unit mix** | 180 studios, 76 one-bed, 10 two-bed, 4 penthouses |
| **Opening** | Q2 2027 |

**Phased deployment:**

- **Phase 1** (Q2 2027): Ground floor + Floor 1 — approximately **100 units**
- **Phase 2** (Q4 2027): Remaining floors — full **270 units**

**Why this is the ideal pilot:**

- Greenfield property — no legacy systems, no migration complexity
- Aparthotel format — longer stays, higher automation value per guest
- Single building — controlled environment for measuring AI impact
- Emerging market — cost savings have outsized impact on profitability
- Known operator — direct relationship, full access, aligned incentives

---

## Unit Economics

**Revenue by unit type (Average Daily Rate):**

| Unit Type | Count | ADR | Monthly Revenue (70% occ.) |
|-----------|-------|-----|---------------------------|
| Studio | 180 | **$55** | $207,900 |
| One-Bed | 76 | **$85** | $135,660 |
| Two-Bed | 10 | **$110** | $23,100 |
| Penthouse | 4 | **$250** | $21,000 |
| **Total** | **270** | | **$387,660/month** |

**AI-driven efficiency targets:**

- **Energy savings**: 20-30% reduction through occupancy-aware standby modes and waste detection
- **Operational efficiency**: Measurable reduction in manual workload through automated housekeeping dispatch, maintenance scheduling, and guest communication
- **Revenue optimisation**: Dynamic pricing and channel mix optimisation vs static rate management
- **Staff productivity**: AI handles coordination; staff focus on guest experience

**Measurement approach**: Phase 1 provides baseline data. Phase 2 measures AI impact against Phase 1 benchmarks. This creates publishable, verifiable results — valuable for both commercial scaling and academic research.

---

## Technology Stack

**Modern, scalable, cloud-native architecture built on proven infrastructure.**

| Layer | Technology | Detail |
|-------|-----------|--------|
| **Frontend** | Next.js 14 (React) | Server components, app router, mobile responsive |
| **Database** | Supabase (PostgreSQL) | **44 tables**, row-level security, real-time subscriptions |
| **AI Engine** | Claude API (Anthropic) | Structured reasoning, multi-step analysis, natural language |
| **Hosting** | Vercel | Edge deployment, automatic scaling, CI/CD |
| **Auth** | Supabase Auth | Role-based access, multi-property support |

**By the numbers:**

- **44** database tables modelling the full hotel domain
- **50+** API endpoints across all system modules
- **13** event types in the cross-system Event Bus
- **7** active event handlers processing inter-system triggers
- **5** Smart Automations running in production
- **6** report types with export capability
- **270** apartments fully configured with real property data

**All UK-developed IP.** Built, deployed, and maintained from the United Kingdom.

---

## R&D Roadmap

**Where we are today and where applied research takes us next.**

```
BUILT (Now)                    NEAR-TERM R&D (2026-27)           FUTURE R&D (2027-28)
─────────────                  ──────────────────────            ─────────────────────
Rule-based automations    ──>  ML-driven decision models    ──> Reinforcement learning
Static energy schedules   ──>  IoT sensor integration       ──> Predictive energy models
English interface         ──>  Multilingual NLP (Arabic+)   ──> Real-time translation
Manual security           ──>  Computer vision analytics    ──> Automated monitoring
Single property           ──>  Multi-property architecture  ──> Portfolio optimisation
Dashboard analytics       ──>  Predictive guest models      ──> Autonomous operations
```

**Key R&D milestones:**

1. **Dynamic pricing ML models** — moving from rule-based to reinforcement learning optimisation
2. **IoT integration layer** — connecting physical sensors to the AI brain for real-time building data
3. **Multilingual guest AI** — Arabic, Russian, German, and other key tourist languages
4. **Computer vision** — occupancy verification, common area analytics, security augmentation
5. **Energy prediction models** — combining weather, booking, and occupancy data for proactive energy management
6. **Guest-facing AI concierge** — natural language interface for guest services and local recommendations

---

## University Collaboration Opportunity

**Six defined R&D areas ideal for KTP partnership and academic research.**

| R&D Area | Academic Discipline | Research Output |
|----------|-------------------|----------------|
| **1. Reinforcement learning for dynamic pricing** | Computer Science / ML | Publishable model, live deployment |
| **2. NLP/LLM for multilingual guest communication** | NLP / Computational Linguistics | Arabic/multilingual AI system |
| **3. Computer vision for occupancy analytics** | Computer Vision / AI | Real-world CV pipeline |
| **4. IoT sensor networks for predictive maintenance** | IoT / Embedded Systems | Sensor-to-AI integration framework |
| **5. Energy optimisation using occupancy prediction** | Data Science / Sustainability | Measurable CO2 reduction model |
| **6. Recommendation systems for guest personalisation** | ML / Information Retrieval | Deployed recommender system |

**Why MMU is the right partner:**

- Strong computing and AI research faculty
- Practical, industry-focused research culture
- Experience with KTP programmes and Innovate UK collaboration
- Manchester's growing tech ecosystem and AI talent pipeline
- Proximity to the company for effective partnership delivery

**What the university gets:**

- **Real deployment environment** — a 270-unit property generating live data from Q2 2027
- **Publishable research** — measurable outcomes in a real commercial setting
- **Student placements** — MSc and PhD project opportunities with industry impact
- **KTP funding** — Innovate UK co-funded associate placement
- **Cross-disciplinary potential** — AI, sustainability, tourism, and operations research

---

## Funding Strategy

**A structured approach combining government grants, academic partnership, and R&D incentives.**

| Funding Source | Range | Status | Use |
|---------------|-------|--------|-----|
| **Innovate UK BridgeAI** | £25K — £1.2M | Eligible | AI development, pilot deployment |
| **Innovate UK Smart Grants** | £25K — £2M | Eligible | Product R&D, market validation |
| **KTP (via MMU)** | £80K — £200K | Seeking partner | ML/AI research associate |
| **R&D Tax Credits** | Up to 27% of qualifying spend | Ongoing | Offset development costs |

**How funds will be deployed:**

- **40%** — AI/ML research and development (pricing models, NLP, computer vision)
- **25%** — IoT integration and pilot property technology infrastructure
- **20%** — KTP associate and academic collaboration
- **15%** — Testing, validation, and performance measurement at Bastet Hurghada

**What makes this a strong funding case:**

- **UK-registered company** developing exportable technology IP
- **Real deployment site** with a confirmed opening date — not theoretical
- **Measurable outcomes** — energy reduction, revenue impact, operational efficiency
- **Academic collaboration** — genuine R&D questions, not just product development
- **Emerging market export** — UK AI technology deployed internationally
- **Sustainability angle** — energy optimisation and CO2 reduction are measurable ESG outcomes

---

## Competitive Advantage

**Why HospitAI wins in the aparthotel and emerging market segments.**

| Incumbent Approach | HospitAI Approach |
|-------------------|-------------------|
| Point solutions (PMS, RMS, EMS sold separately) | **Integrated platform** — one system, one AI brain |
| AI bolted onto legacy software | **AI-native architecture** — built around intelligence from day one |
| Designed for large hotel chains | **Built for aparthotels** — extended stay, apartment-style operations |
| Focused on mature Western markets | **Emerging market first** — Egypt, Middle East, North Africa |
| Enterprise pricing ($50K+ per property) | **Accessible pricing** — viable for independent operators |
| Theoretical AI features in roadmaps | **Working prototype today** — live at app.hospitai.uk |

**Defensible advantages:**

- **First-mover in AI-native aparthotel operations** — no direct competitor offers this combination
- **Real-world deployment** provides training data and validated models that cannot be replicated without a live property
- **Cross-system Event Bus architecture** creates compound intelligence — each new system integration makes every other system smarter
- **UK IP ownership** with international deployment — attractive for UK government innovation support

---

## Team and Next Steps

**Current stage**: Working prototype built and deployed. Pilot property under construction. Seeking research partners and grant funding to advance AI capabilities before Q2 2027 launch.

**What we have:**

- Full-stack product built and running in the cloud
- Confirmed pilot property with 270 units opening Q2 2027
- UK company registration and IP ownership
- Clear R&D roadmap with defined academic collaboration areas

**What we need:**

- **Academic partner** (KTP) — to advance ML, NLP, and computer vision capabilities
- **Innovate UK funding** — to support R&D and pilot deployment
- **IoT hardware partner** — for sensor integration at the pilot property
- **Industry advisors** — experienced hotel technology operators

**Timeline:**

| Date | Milestone |
|------|-----------|
| **Q2 2026** | KTP application submitted with university partner |
| **Q3 2026** | Innovate UK grant application (BridgeAI or Smart Grants) |
| **Q4 2026** | IoT integration development begins |
| **Q1 2027** | Pre-launch testing with pilot property systems |
| **Q2 2027** | Phase 1 launch — 100 units live with full AI platform |
| **Q4 2027** | Phase 2 launch — full 270 units, ML models trained on live data |
| **2028** | Second property deployment, multi-property architecture |

---

## Contact

**HospitAI Ltd**

- **Email**: hello@hospitai.uk
- **Website**: [hospitai.uk](https://hospitai.uk)
- **Live product**: [app.hospitai.uk](https://app.hospitai.uk)

We are actively seeking academic research partners and are open to conversations with Innovate UK programme managers, university faculty in AI/ML/data science, and hospitality technology advisors.

**We would welcome the opportunity to demonstrate the live platform.**
