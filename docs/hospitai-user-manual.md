# HospitAI User Manual

## The AI Operating System for Hotels

**Property:** Bastet Hurghada | 270 Apartments | 5 Floors
**Application:** [app.hospitai.uk](https://app.hospitai.uk)
**Version:** 1.0 | Last updated: March 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [AI Modules](#ai-modules)
   - [AI Brain](#1-ai-brain)
   - [AI Scheduler](#2-ai-scheduler)
   - [ML Predictions](#3-ml-predictions)
   - [Workflow Engine](#4-workflow-engine)
   - [AI Command Centre](#5-ai-command-centre)
   - [Smart Automations](#6-smart-automations)
   - [Event Bus](#7-event-bus)
   - [Audit Trail](#8-audit-trail)
3. [Operational Modules](#operational-modules)
   - [Dashboard](#9-dashboard)
   - [Apartments](#10-apartments)
   - [Bookings](#11-bookings)
   - [Guests](#12-guests)
   - [Availability Calendar](#13-availability-calendar)
   - [Housekeeping](#14-housekeeping)
   - [Maintenance](#15-maintenance)
   - [Finance](#16-finance)
   - [Staff](#17-staff)
   - [Settings](#18-settings)
4. [Intelligence Modules](#intelligence-modules)
   - [Energy Dashboard](#19-energy-dashboard)
   - [Guest Intelligence](#20-guest-intelligence)
   - [Revenue Copilot](#21-revenue-copilot)
   - [AI Chat](#22-ai-chat)
   - [Notifications](#23-notifications)
   - [Reports](#24-reports)
   - [Admin Panel](#25-admin-panel)
   - [Marketplace](#26-marketplace)
   - [Theme, Mobile, and Authentication](#27-29-theme-mobile-and-authentication)
5. [Tips and Best Practices](#tips-and-best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Getting Started

### How to Log In

1. Open your browser and go to **app.hospitai.uk**.
2. You will see the HospitAI login page with the "Staff Login" form.
3. Enter your **email address** and **password**.
4. Click **Sign In**.
5. You will be taken to the Dashboard.

**Default admin credentials:**
- Email: `admin@hospitai.uk`
- Password: `HospitAI2026!`

> If you see an error message after clicking Sign In, double-check your email and password. Contact your manager if your account is locked.

### Dashboard Overview

After logging in, you land on the **Dashboard** -- your home base. It shows a snapshot of everything happening at the property right now: occupancy, revenue, arrivals, departures, maintenance, housekeeping, AI insights, and guest alerts. Think of it as your morning briefing in one screen.

### Navigation (Sidebar)

The left-hand sidebar is your menu for the entire system. It is organised into three groups:

**AI Modules** (top section):
- AI Brain
- AI Command Centre
- Smart Automations
- AI Scheduler
- Predictions
- Workflows
- Event Bus
- Energy

**Operational Modules** (middle section):
- Dashboard
- Apartments
- Bookings
- Guests
- Guest Intelligence
- Revenue Copilot
- Reports
- Housekeeping
- Maintenance
- Finance
- Marketplace
- Staff

**Administration** (bottom section):
- Admin
- Settings

On desktop, you can **collapse the sidebar** by clicking the arrow at the bottom of the panel. This gives you more screen space while keeping icons visible.

On mobile, tap the **menu icon** (three lines) in the top-left corner to open the sidebar as a drawer. Tap any item to navigate, and the drawer closes automatically.

### Light and Dark Theme

HospitAI supports both light and dark themes. To switch, click the **theme toggle** in the top-right corner of the header bar. Your preference is saved and persists between sessions.

### Mobile Access

HospitAI is fully responsive. You can use it on your phone or tablet by visiting **app.hospitai.uk** in your mobile browser. All features work on mobile, though some data-heavy tables are best viewed on a larger screen. The sidebar becomes a slide-out drawer, and all charts and cards stack vertically for easy scrolling.

---

## AI Modules

### 1. AI Brain

**What it does:** The AI Brain is the central intelligence of HospitAI. It uses Claude AI to analyse all property data -- occupancy, revenue, energy, maintenance, guests, and pricing -- and produces intelligent decisions with reasoning and confidence scores.

**How to access:** Sidebar > **AI Brain**

**Key features:**
- **Enable/Disable toggle** -- Turn the brain on or off from the configuration panel at the bottom of the page.
- **Run Brain Cycle** -- Click the cyan "Run Brain Cycle" button to trigger an analysis. The AI reads all current property data, thinks about what needs attention, and produces a set of decisions.
- **Decision cards** -- Each decision shows a category (pricing, operations, energy, guest, maintenance, or revenue), the recommended action, the AI's reasoning, a confidence percentage bar, and an estimated impact.
- **Approve or Reject** -- In supervised mode, each decision has green "Approve" and red "Reject" buttons. You review the reasoning and decide.
- **Mode toggle** -- Switch between **Supervised** and **Autonomous** using the toggle in the header.
- **Stats row** -- Shows last cycle time, total cycles, decisions made, and decisions executed.
- **Brain History** -- All past cycles are listed below the current decisions. Click any cycle to expand and see its decisions.
- **Data Snapshot** -- Click "Data Snapshot" to see exactly what data the AI was looking at when it made its decisions.

**Supervised vs Autonomous mode:**

| Mode | How it works | When to use |
|------|-------------|-------------|
| **Supervised** | AI makes recommendations. You approve or reject each one. Nothing happens until you say so. | When you are new to the system, during busy periods where you want full control, or for high-stakes pricing decisions. |
| **Autonomous** | AI automatically executes high-confidence decisions without waiting for approval. | When you trust the system's track record, during off-hours when no one is monitoring, or for routine operational decisions. |

**Cycle interval** -- You can set how often the brain runs automatically: every 15 minutes, 30 minutes, 1 hour, or manual only.

**Tips:**
- Start in supervised mode. Review decisions for a week or two to build trust, then consider switching to autonomous for routine categories like energy.
- The confidence bar is colour-coded: green (75%+) means high confidence, amber (50-74%) means moderate, red (below 50%) means the AI is less certain.

---

### 2. AI Scheduler

**What it does:** The AI Scheduler runs the entire AI pipeline on a timer -- the Brain cycle, all five automations, and insight generation -- so HospitAI thinks continuously without anyone clicking buttons.

**How to access:** Sidebar > **AI Scheduler**

**Key features:**
- **Start/Stop** -- Click "Start Scheduler" to begin automatic cycles, or "Stop Scheduler" to pause.
- **Run Now** -- Trigger a single immediate cycle without enabling the full scheduler.
- **Interval selector** -- Choose how often cycles run: 5, 10, 15, 30, or 60 minutes.
- **Status indicator** -- A green pulsing dot means the scheduler is active. A grey dot means it is stopped.
- **Stats cards** -- Status, interval, total cycles run, and the time of the last run.
- **What runs each cycle** -- Three components are shown: AI Brain (in its configured mode), 5 Automations (Pricing, Housekeeping, Maintenance, VIP, Energy), and Fresh Insights (updates the AI Command Centre).
- **Last Cycle Result** -- After each run, a summary card shows how many decisions the brain made, how many automations ran and actions taken, how many insights were generated, and the cycle duration in milliseconds.

**Tips:**
- Keep the scheduler running during operating hours for continuous intelligence.
- The scheduler resets when the server redeploys. For always-on operation, pair it with an external scheduler service.

---

### 3. ML Predictions

**What it does:** The Predictions module uses a machine-learning model trained on your actual booking history to forecast occupancy and revenue for the next 30 days. This is not a simple rule -- it learns trends, day-of-week patterns, and rate sensitivity from real data.

**How to access:** Sidebar > **Predictions**

**Key features:**
- **30-Day Forecast Chart** -- A bar chart showing predicted occupancy for each day. Bars are colour-coded: green (>85% high), cyan (60-85% normal), amber (40-60% moderate), red (<40% low). Today is highlighted in bright cyan with a "TODAY" label.
- **Confidence bands** -- Behind each bar, a lighter shaded area shows the 80% confidence range. The actual occupancy is expected to fall within this range four out of five times.
- **Revenue forecast** -- Below the chart, see the 30-day total predicted revenue with a confidence range, average predicted occupancy, and peak and lowest days.
- **Daily prediction table** -- A detailed table with date, day of week, occupancy percentage, occupied units, predicted revenue, confidence range, and influencing factors.
- **Model performance metrics** -- R-squared, MAE (mean absolute error), MAPE (mean absolute percentage error), and RMSE show how accurate the model is.
- **Backtest chart** -- Shows predicted vs actual occupancy on historical data so you can see how well the model performs.
- **ML vs Rule-Based comparison** -- A side-by-side comparison proving the ML model outperforms simple rules.
- **Day-of-Week Seasonality chart** -- Shows which days of the week tend to have higher or lower occupancy.
- **Retrain Model button** -- Click to re-train the model with the latest booking data.

**How to read the forecast chart:**
1. Each bar represents one day. The height shows predicted occupancy.
2. The faded band behind the bar is the confidence range.
3. Green bars mean strong occupancy. Red bars are days to focus your marketing on.
4. Hover over any bar to see the exact numbers.

**Tips:**
- The model improves with more data. Retrain periodically as bookings accumulate.
- Use low-occupancy predictions to trigger promotional rates or marketing campaigns.

---

### 4. Workflow Engine

**What it does:** The Workflow Engine turns AI Brain decisions and manual actions into structured, step-by-step action plans. Each workflow has numbered steps, approval checkpoints, execution tracking, and outcome recording.

**How to access:** Sidebar > **Workflows**

**Key features:**
- **Workflow list** -- All workflows are displayed with their title, source (AI Brain, automation, event, or manual), status, priority, and progress.
- **Source badges** -- Each workflow shows where it originated: purple for AI Brain, cyan for automation, green for events, blue for manual creation.
- **Status tracking** -- Workflows progress through: pending, approved, in_progress, completed, or failed.
- **Step-by-step execution** -- Click into a workflow to see each step, its type, parameters, whether it requires approval, and its current status (pending, in_progress, completed, failed, or skipped).
- **Approval flow** -- Steps marked as "requires approval" pause the workflow until you approve or reject them.
- **Outcome recording** -- When a workflow completes, you can record notes about the outcome for future reference.
- **Stats overview** -- Total workflows, breakdown by status, completed this week, average completion time, and approval rate.
- **Create workflow** -- Start a new workflow manually using the "New Workflow" button.

**How approvals work:**
1. An AI Brain decision or automation creates a workflow.
2. The workflow appears with status "pending".
3. You review the steps and click "Approve" to begin execution.
4. Each step runs in order. Some steps may pause for further approval.
5. When all steps complete, the workflow status changes to "completed".

**Tips:**
- Use workflows for complex multi-step operations like VIP preparations or rate changes that involve multiple departments.
- Check the average completion time to identify bottlenecks in your operational processes.

---

### 5. AI Command Centre

**What it does:** The AI Command Centre is your at-a-glance intelligence dashboard. It combines data from every system into a single view with a health score, insights, pricing recommendations, and an occupancy forecast.

**How to access:** Sidebar > **AI Command Centre**

**Key features:**
- **Health Score (0-100)** -- A circular gauge showing the overall state of the property. The score factors in occupancy levels, revenue performance, operational efficiency, energy usage, guest satisfaction, and maintenance backlog.
  - **80-100 (green):** Property is running well. Keep doing what you are doing.
  - **60-79 (amber):** Some areas need attention. Check the insights below for specifics.
  - **Below 60 (red):** Significant issues detected. Review critical insights immediately.
- **Stat cards** -- Active insights count (and how many need action), revenue opportunity for the next 7 days, energy savings potential, and 7-day occupancy forecast.
- **AI Insights** -- A scrollable list of insights, each categorised by type (pricing, energy, maintenance, occupancy, revenue, guest, housekeeping) and severity:
  - **Critical (red):** Requires immediate attention.
  - **Warning (amber):** Should be addressed soon.
  - **Opportunity (green):** A chance to improve revenue or efficiency.
  - **Info (blue):** Good to know, no action required.
  Each insight includes a title, description, confidence percentage, impact estimate, and a suggested action.
- **Dynamic Pricing table** -- Shows current rates vs AI-suggested rates for each apartment type, with the percentage change and confidence level.
- **14-Day Occupancy Forecast** -- A bar chart showing predicted occupancy for the next two weeks with colour-coded bars (green = high, gold = normal, red = low).

**Tips:**
- Check the Command Centre first thing in the morning for a complete picture.
- Focus on critical and warning insights first. Opportunities can be addressed when time allows.

---

### 6. Smart Automations

**What it does:** Smart Automations are five pre-built AI routines that handle common operational tasks without manual intervention. Each can be enabled or disabled independently.

**How to access:** Sidebar > **Smart Automations**

**The five automations:**

| Automation | What it does |
|-----------|-------------|
| **Auto Pricing** | Analyses occupancy, demand, day of week, and competitor context to adjust room rates dynamically. |
| **Auto Housekeeping** | Creates and prioritises cleaning tasks automatically based on checkouts, VIP arrivals, and room status. |
| **Maintenance Patterns** | Detects recurring maintenance issues and creates preventive tasks before problems escalate. |
| **VIP Preparation** | Identifies arriving VIP guests and triggers preparation workflows (room upgrades, welcome amenities, priority cleaning). |
| **Energy Standby** | Puts vacant rooms into energy-saving mode and pre-activates rooms before guest arrival. |

**Key features:**
- **Enable/Disable toggle** -- Each automation has its own toggle. Disable individual automations you want to handle manually.
- **Run All** -- Click "Run All" to execute every enabled automation immediately.
- **Individual Run** -- Click the play button on a single automation to run just that one.
- **Action log** -- Below each automation, see a history of recent actions it has taken, with descriptions and impact notes.
- **Actions taken counter** -- Each automation shows how many actions it has performed in total.
- **Last run timestamp** -- See when each automation last executed.

**Tips:**
- Enable all five automations and let the scheduler run them periodically for maximum efficiency.
- If you disable an automation, remember that you are now responsible for handling that task manually.

---

### 7. Event Bus

**What it does:** The Event Bus is the communication backbone of HospitAI. When something happens in one system (a guest checks out, a booking is confirmed), the Event Bus broadcasts the event and other systems react automatically.

**How to access:** Sidebar > **Event Bus**

**Key features:**
- **Event stream** -- A live feed of all system events, showing the event type, source system, when it happened, and whether it has been processed.
- **Event types** -- Colour-coded badges for each event type: checkout (amber), check-in (green), confirmed (blue), and others.
- **Handler results** -- Expand any event to see what reactions it triggered. Each handler shows the target system, the action taken, a description, and whether it succeeded.
- **Stats** -- Events today, actions triggered, systems connected, and average response time.
- **Filters** -- Filter events by type to find specific activity.
- **Emit Test Event** -- Use the emit button to send a test event and verify that handlers react correctly.

**The checkout cascade -- an example:**

When a guest checks out, the Event Bus fires a `booking.checked_out` event. This triggers a chain of automatic reactions:
1. **Housekeeping** receives a "create cleaning task" action for the room.
2. **Energy** puts the room into standby/low-power mode.
3. **Maintenance** checks if any pending maintenance can now be scheduled.
4. **Revenue** updates availability for the room.
5. **Notifications** alerts the front desk that the room is now in turnover.

All of this happens within seconds, without anyone clicking anything.

**Tips:**
- The Event Bus is mostly a monitoring tool. You do not need to interact with it daily, but it is invaluable for understanding why something happened automatically.
- Use the test event feature when troubleshooting to confirm that handlers are working.

---

### 8. Audit Trail

**What it does:** The Audit Trail records every significant action in the system -- who did what, when, and what changed. It is your compliance and accountability log.

**How to access:** Sidebar > **Admin** > **Audit**

**Key features:**
- **Complete action log** -- Every action is recorded with the user's email, the action taken, the category, a description, and a timestamp.
- **Category filtering** -- Filter entries by category: AI decisions, AI Brain, automation, booking, guest, housekeeping, maintenance, finance, energy, settings, authentication, or system.
- **Before and after data** -- For data changes, the audit trail stores both the old data and the new data so you can see exactly what changed.
- **Stats overview** -- Total entries, entries today, breakdown by category, and recent AI decisions.
- **Category icons** -- Each entry has an icon matching its category for quick visual scanning.

**What gets logged:**
- Every AI Brain decision (approve, reject, auto-execute)
- All automation actions
- Booking changes (create, check-in, check-out, cancel)
- Guest profile updates
- Housekeeping and maintenance task changes
- Financial transactions
- Settings modifications
- Login and logout events
- System configuration changes

**Tips:**
- If something looks wrong or unexpected, the audit trail is your first stop for investigation.
- Use the category filter to narrow down to the area you are investigating.

---

## Operational Modules

### 9. Dashboard

**What it does:** The Dashboard is your home screen -- a real-time summary of the property's status across all departments.

**How to access:** Sidebar > **Dashboard** (or click the HospitAI logo)

**Key features:**
- **AI Intelligence Row** (top):
  - **AI Brain Status** -- Shows the current mode (supervised/autonomous), last cycle time, and how many decisions are pending approval.
  - **Energy Savings** -- Daily savings potential in GBP and any energy waste detected today.
  - **Revenue Opportunity** -- ADR (average daily rate), RevPAR (revenue per available room), and potential channel optimization savings.
- **Stats Grid** (six cards):
  - **Occupancy** -- Current occupancy percentage with a trend indicator (up or down vs last week).
  - **Revenue Today** -- Total revenue earned today in GBP.
  - **Arrivals Today** -- Number of guests checking in.
  - **Departures Today** -- Number of guests checking out.
  - **Maintenance** -- Open maintenance tickets with a count of urgent ones.
  - **Housekeeping** -- Number of rooms needing cleaning.
- **Recent Bookings table** -- The latest bookings with reference number, guest name, apartment number, nights, and status badge.
- **Housekeeping Status** -- Visual progress bars showing clean, to-clean, and in-progress room counts.
- **AI Insights** -- The top three AI-generated insights with severity badges and impact descriptions. Click "Command Centre" to see all.
- **Guest Alerts** -- VIP arrivals today and at-risk guests count.

**Tips:**
- Make the Dashboard your first stop every morning.
- Click on any booking reference to jump directly to its details.

---

### 10. Apartments

**What it does:** View and manage all 270 apartments in the property, with their current status, booking information, and operational details.

**How to access:** Sidebar > **Apartments**

**Key features:**
- **Full apartment list** -- All 270 units displayed in a searchable, sortable table.
- **Status filters** -- Filter by: available, occupied, cleaning, maintenance, blocked, or out of service.
- **Floor filter** -- View apartments by floor (Ground, Floor 1 through Floor 5).
- **Status badges** -- Each apartment shows its current status with a colour-coded badge.
- **Booking column** -- Shows the current or next booking reference for each apartment.
- **Energy column** -- Indicates whether the apartment is in active or standby energy mode.
- **Task column** -- Shows any open housekeeping or maintenance tasks.
- **Click to view details** -- Click any apartment to see its full details, current guest, booking history, and maintenance records.

**Tips:**
- Use the floor filter when assigning rooms to group guests on the same floor.
- Check the maintenance filter regularly to see how many rooms are out of rotation.

---

### 11. Bookings

**What it does:** Manage all guest bookings from creation through checkout, including a calendar view for visual planning.

**How to access:** Sidebar > **Bookings**

**Key features:**
- **Booking list** -- All bookings with reference, guest name, apartment, check-in/check-out dates, nights, status, and channel.
- **Create new booking** -- Click "New Booking" to start the booking form. Select guest, apartment, dates, and channel.
- **Check-in process** -- Open a confirmed booking and click "Check In" to mark the guest as arrived.
- **Check-out process** -- Open a checked-in booking and click "Check Out". This triggers the checkout cascade (housekeeping, energy standby, availability update) via the Event Bus.
- **Status badges** -- Bookings show their status: pending (grey), confirmed (cyan), checked_in (green), checked_out (blue), cancelled (red), no_show (amber).
- **Guest tier indicator** -- VIP and loyalty tier badges appear next to guest names.
- **Calendar view** -- Click "Calendar" to switch to the visual availability calendar (see module 13).

**Tips:**
- Always confirm bookings promptly -- confirmed bookings are included in occupancy calculations and AI forecasting.
- Use the booking reference (e.g., BK-XXXXX) when communicating with guests for easy lookup.

---

### 12. Guests

**What it does:** Manage guest profiles with contact information, booking history, loyalty tier, lifetime value, and churn risk assessment.

**How to access:** Sidebar > **Guests**

**Key features:**
- **Guest directory** -- All guests listed with name, email, phone, loyalty tier, total bookings, lifetime value (LTV), and churn risk.
- **Churn risk indicator** -- A colour-coded bar next to each guest:
  - **Green (0-30%):** Low risk. Guest is likely to return.
  - **Amber (31-60%):** Medium risk. Consider a retention offer.
  - **Red (61-100%):** High risk. Reach out personally or offer a special deal.
- **Lifetime Value (LTV)** -- The total revenue this guest has generated across all their stays.
- **Loyalty tiers** -- Guests earn points on spending. Tiers are:
  - **Bronze:** 0 - 999 points
  - **Silver:** 1,000 - 4,999 points
  - **Gold:** 5,000 - 14,999 points
  - **Platinum:** 15,000+ points
- **Create new guest** -- Click "New Guest" to add a profile before creating their booking.
- **Guest detail page** -- Click any guest to see their full profile, booking history, preferences, and notes.

**Tips:**
- Pay special attention to platinum guests. They are your most valuable customers.
- When churn risk turns red, act quickly. A personal call or a small gesture can make the difference.

---

### 13. Availability Calendar

**What it does:** A visual grid showing every apartment's availability over time. Each row is an apartment, each column is a day, and bookings appear as coloured bars spanning their check-in to check-out dates.

**How to access:** Sidebar > **Bookings** > click **Calendar** tab (or via the calendar view toggle)

**Key features:**
- **Grid layout** -- Apartments listed vertically (grouped by floor), dates shown horizontally.
- **Colour coding:**
  - **Cyan** -- Confirmed booking
  - **Green** -- Checked-in (guest currently in residence)
  - **Amber** -- Pending booking (not yet confirmed)
- **Navigation** -- Use the left/right arrows to move forward and backward in time.
- **Click to create** -- Click on an empty cell to start a new booking for that apartment and date.
- **Booking details on hover** -- Hover over any booking bar to see the guest name, reference, and dates.
- **VIP arrivals count** -- The header shows how many VIP guests are arriving in the visible date range.
- **Building and floor filters** -- Narrow the view to specific buildings or floors.

**Tips:**
- Use the calendar view for a quick visual check of gaps in occupancy. Clusters of empty cells are opportunities for promotions.
- The calendar is the fastest way to find available apartments for walk-in guests.

---

### 14. Housekeeping

**What it does:** Manage cleaning tasks for all 270 apartments, with AI-powered prioritisation based on guest arrivals, VIP status, and energy considerations.

**How to access:** Sidebar > **Housekeeping**

**Key features:**
- **Task list** -- All housekeeping tasks with apartment number, type, priority, status, and assigned staff member.
- **Task types** -- checkout_clean, midstay_clean, deep_clean, inspection, and turndown.
- **Priority levels** -- Low, normal, high, and urgent. Tasks are sorted by priority automatically.
- **Status tracking** -- Tasks move through: pending, assigned, in_progress, completed, verified, or issue_found.
- **Next guest arriving indicator** -- Tasks for rooms with an upcoming arrival show a badge with the guest's arrival time, so you know which rooms to clean first.
- **Energy standby badge** -- Rooms in energy standby mode are marked, reminding you that HVAC will need to be re-activated when cleaning is done and a guest is due.
- **VIP priority card** -- Tasks for VIP guest rooms are highlighted with a special badge and automatically set to high priority.
- **Create task** -- Click "New Task" to manually create a housekeeping task. Select the apartment, type, priority, and assign a staff member.
- **Assign tasks** -- Use the assignment dropdown to allocate tasks to available housekeeping staff.

**Tips:**
- Focus on tasks with the "next guest arriving" badge first to ensure rooms are ready for check-in.
- The auto-housekeeping automation can create tasks for you. Check the Smart Automations module to enable it.

---

### 15. Maintenance

**What it does:** Track and manage maintenance requests across the property, with priority levels, impact assessment, and pattern detection.

**How to access:** Sidebar > **Maintenance**

**Key features:**
- **Ticket list** -- All maintenance tickets with apartment, category, description, priority, status, and impact badge.
- **Creating a ticket** -- Click "New Ticket". Fill in the apartment, category (plumbing, electrical, HVAC, appliance, structural, furniture, painting, pest control, or general), description, and priority.
- **Priority levels** -- Low, normal, high, urgent, and emergency. Emergency tickets appear at the top with a red badge.
- **Status tracking** -- Tickets progress through: open, assigned, in_progress, on_hold, completed, or cancelled.
- **Impact badge** -- Each ticket shows whether the apartment is currently occupied or vacant. This helps prioritise: occupied rooms with issues need faster attention.
- **Pattern detection** -- The maintenance patterns automation analyses recurring issues. If the same type of problem keeps appearing on the same floor or in the same apartment type, the system flags it.
- **HVAC energy badge** -- For HVAC-related tickets, the system shows the room's energy status, helping coordinate between maintenance and energy management.
- **Category breakdown** -- Filter tickets by category to see all plumbing issues, all electrical issues, and so on.

**Tips:**
- Always set the correct priority. The AI uses priority data to make scheduling decisions.
- Check for maintenance patterns monthly. Recurring issues often signal a larger problem that needs a permanent fix rather than repeated repairs.

---

### 16. Finance

**What it does:** Track revenue, expenses, and profitability with channel analysis, energy cost tracking, and revenue forecasting.

**How to access:** Sidebar > **Finance**

**Key features:**
- **Revenue overview** -- Total revenue, broken down by booking channel and apartment type.
- **Expense tracking** -- Record and categorise expenses (utilities, staff, maintenance, supplies, marketing, insurance, taxes, software, professional services, travel, other).
- **Profit calculation** -- Revenue minus expenses, with a clear profit/loss indicator.
- **Channel analysis** -- See how much revenue comes from each channel (direct, Booking.com, Airbnb, Expedia, phone, walk-in) and the commission cost for each.
- **Channel commissions:**
  - Direct: 0%
  - Booking.com: 15%
  - Airbnb: 14%
  - Expedia: 18%
  - Phone: 0%
  - Walk-in: 0%
- **Energy cost tracking** -- See how much energy is costing and where waste is occurring.
- **Revenue forecast** -- A forward-looking revenue projection based on confirmed bookings and AI predictions.
- **Invoices** -- Create, send, and track invoices with statuses: draft, sent, paid, partially_paid, overdue, or cancelled.
- **Payment methods** -- Card, bank transfer, cash, Stripe, or cheque.

**Tips:**
- Compare channel revenue regularly. Channels with high commissions (Expedia at 18%) eat into margins. Use the Revenue Copilot to optimise your channel mix.
- Record expenses promptly for accurate profit reporting.

---

### 17. Staff

**What it does:** Manage staff accounts, roles, and see active task assignments.

**How to access:** Sidebar > **Staff**

**Key features:**
- **Staff directory** -- All staff members with name, role, email, and status.
- **Roles** -- Owner, manager, receptionist, housekeeping, maintenance, and admin.
- **Active tasks per person** -- See how many open tasks each staff member currently has assigned, helping balance workload.
- **Create new staff** -- Click "New Staff" to add a team member. Set their name, email, role, and initial password.
- **Edit staff** -- Click a staff member to update their details or change their role.
- **Staff detail page** -- View a staff member's profile, assigned tasks, and work history.

**Tips:**
- Keep roles accurate. Roles determine what each person can see and do in the system.
- Check active task counts before assigning new tasks to avoid overloading one person.

---

### 18. Settings

**What it does:** Configure property details, booking policies, room rates, and channel commissions.

**How to access:** Sidebar > **Settings**

**Key features:**
- **Property configuration** -- Property name, address, total apartments, floors, and contact information.
- **Booking policies** -- Minimum and maximum stay lengths, cancellation policies, check-in and check-out times.
- **Rate management** -- Set base rates for each apartment type. These are the starting rates that the AI pricing engine adjusts dynamically.
- **Length of stay discounts:**
  - 7+ nights: 5% discount
  - 14+ nights: 10% discount
  - 21+ nights: 15% discount
  - 28+ nights: 20% discount
- **Channel commissions** -- Configure the commission percentage for each booking channel.
- **Currencies** -- GBP, EUR, USD, and EGP are supported.
- **Languages** -- English, Arabic, Russian, and German.

**Tips:**
- Review base rates monthly. The AI adjusts rates dynamically, but the base rate sets the floor and ceiling for those adjustments.
- Length of stay discounts encourage longer bookings, which reduce turnover costs.

---

## Intelligence Modules

### 19. Energy Dashboard

**What it does:** Monitor energy consumption across the property, detect waste in vacant rooms, and see AI recommendations for reducing costs.

**How to access:** Sidebar > **Energy**

**Key features:**
- **Overview stats** -- Total consumption (kWh), estimated cost, waste detected, and savings potential.
- **Waste detection heatmap** -- A visual grid showing energy usage by apartment. Red cells indicate rooms consuming energy that should not be (vacant rooms with HVAC running, for example).
- **Floor breakdown with occupancy overlay** -- Bar charts for each floor showing energy consumption alongside occupancy rate. Floors with high energy use but low occupancy are wasting energy.
- **Timeline** -- A time-series view of energy consumption over the day or week.
- **AI Recommendations** -- Specific, actionable suggestions such as "Put 12 vacant rooms on Floor 3 into standby mode" or "Schedule HVAC pre-cooling for Room 415 arriving at 14:00".
- **Arriving rooms pre-cooling** -- The system identifies rooms with guests arriving soon and recommends activating climate control in advance so the room is comfortable on arrival.

**Tips:**
- Check the heatmap daily. A single vacant floor with HVAC running can waste significant energy.
- Enable the Energy Standby automation to handle vacant room power-down automatically.

---

### 20. Guest Intelligence

**What it does:** Deep analytics on your guest base, including lifetime value scoring, churn prediction, upsell opportunities, and segment analysis.

**How to access:** Sidebar > **Guest Intelligence**

**Key features:**
- **LTV (Lifetime Value) scoring** -- Each guest is scored based on total revenue, number of stays, average spend per stay, and booking channel. Higher LTV guests deserve more attention and better service.
- **Churn detection** -- Guests at risk of not returning are flagged:
  - **Green (low risk):** No action needed.
  - **Amber (medium risk):** Send a personalised follow-up or offer.
  - **Red (high risk):** Urgent -- personal outreach recommended.
  What to do when a guest is at risk: review their stay history for issues, contact them with a personalised offer, and log the outreach in their profile.
- **Upsell opportunities** -- The AI identifies guests who are likely to accept room upgrades, extended stays, or additional services based on their profile and behaviour patterns.
- **Segment analysis** -- Guests are grouped by nationality, booking channel, loyalty tier, and stay patterns. Use segments to target marketing campaigns effectively.
- **Guest insights** -- AI-generated observations about your guest base, such as "German guests book 30% longer stays on average" or "Platinum guests are 4x more likely to book direct."
- **Predictions** -- Forward-looking predictions about guest behaviour.

**Tips:**
- Focus retention efforts on high-LTV guests with rising churn risk. Losing a platinum guest costs far more than losing a one-time visitor.
- Use segment analysis to tailor your marketing. Different guest segments respond to different offers.

---

### 21. Revenue Copilot

**What it does:** Your AI-powered revenue management assistant. Analyse your channel mix, simulate rate changes, optimise length of stay pricing, and see a 30-day revenue forecast.

**How to access:** Sidebar > **Revenue Copilot**

**Key features:**
- **Revenue overview stats** -- ADR, RevPAR, total revenue, occupancy, and trends vs previous period.
- **Channel mix analysis** -- A visual breakdown of revenue by channel with colour-coded bars. Each channel shows its contribution percentage, revenue amount, and commission cost.
- **Channel optimisation** -- AI recommendations for shifting bookings toward lower-commission channels to improve net revenue.
- **What-If Simulator** -- Adjust a rate slider to model different pricing scenarios. The simulator shows the predicted impact on occupancy and revenue. Slide the rate up and see how many bookings you might lose; slide it down to see if additional volume makes up for the lower price.
- **Rate performance** -- Historical analysis of how different rate levels have performed. See which price points maximise revenue.
- **Length of Stay analysis** -- Shows the distribution of booking lengths and the revenue impact of stay-length discounts.
- **30-Day Forecast** -- Revenue projection based on confirmed bookings, pending bookings, and AI-predicted new bookings.

**How to use the What-If Simulator:**
1. Select the apartment type you want to analyse.
2. Drag the rate slider up or down from the current rate.
3. The simulator instantly shows the predicted change in occupancy and total revenue.
4. Use this to find the optimal price point that maximises revenue, not just occupancy.

**Tips:**
- Direct bookings (0% commission) are always more profitable than OTA bookings. Use the channel analysis to identify opportunities to shift guests to direct booking.
- The What-If Simulator is especially useful before setting rates for high-demand periods.

---

### 22. AI Chat

**What it does:** A conversational AI assistant that can answer questions about your property using live data from all systems. Ask it anything in plain English.

**How to access:** Click the **cyan chat button** in the bottom-right corner of any page.

**Key features:**
- **Natural language queries** -- Ask questions like you would ask a colleague: "How full are we this weekend?", "Who is arriving today?", "What are our top revenue channels?"
- **Live data** -- The AI pulls from real-time occupancy, booking, guest, maintenance, housekeeping, energy, and financial data.
- **Quick prompts** -- Six pre-built prompts to get you started:
  - "How full are we?"
  - "Who's arriving today?"
  - "Any urgent maintenance?"
  - "What rates should I set?"
  - "Show me VIP guests"
  - "Energy savings?"
- **Conversation history** -- Your chat history persists during your session so you can ask follow-up questions.
- **Close and reopen** -- Click the X to close the chat panel. Click the cyan button again to reopen with your conversation intact.

**Tips:**
- Use the AI Chat for quick answers instead of navigating through multiple pages.
- Be specific in your questions for better answers. "What is our occupancy for next Thursday?" is better than "How are bookings?"

---

### 23. Notifications

**What it does:** Real-time alerts about important events across the property, delivered via the bell icon in the header.

**How to access:** Click the **bell icon** in the top-right corner of the header bar.

**Key features:**
- **Notification dropdown** -- A panel drops down showing all recent notifications.
- **Unread count** -- The bell icon shows a badge with the number of unread notifications.
- **Category icons** -- Each notification has an icon matching its source: bookings, housekeeping, maintenance, energy, guests, pricing, brain, or system.
- **Type colours** -- Notifications are colour-coded by severity: critical (red), warning (amber), success (green), or informational (blue).
- **Click to navigate** -- Many notifications include a link. Click the notification to go directly to the relevant page.
- **Mark as read** -- Click a notification to mark it as read, or use "Mark all as read" to clear the badge.
- **Dismiss** -- Swipe or click to dismiss individual notifications.

**What triggers notifications:**
- New bookings confirmed
- Guest check-ins and check-outs
- Urgent maintenance tickets created
- AI Brain decisions pending approval
- Energy waste detected
- VIP guest arrivals
- Automation actions completed
- System alerts

**Tips:**
- Do not ignore red (critical) notifications. They indicate issues that need immediate attention.
- If you are getting too many notifications, review your automation settings to reduce noise.

---

### 24. Reports

**What it does:** Generate detailed reports across eight categories with date range filtering, CSV export, and print support.

**How to access:** Sidebar > **Reports**

**Key features:**
- **8 report types:**
  1. **Executive Summary** -- High-level overview with all key metrics.
  2. **Occupancy** -- Detailed occupancy analysis by day, apartment type, and floor.
  3. **Revenue** -- Revenue breakdown by channel, apartment type, and time period.
  4. **Guests** -- Guest analytics including new guests, returning guests, and loyalty distribution.
  5. **Operations** -- Housekeeping and maintenance performance metrics.
  6. **Financial** -- Profit and loss, expense breakdown, and cash flow.
  7. **Energy** -- Consumption data, waste analysis, and savings achieved.
  8. **AI Decisions** -- All AI Brain decisions with approval rates and outcomes.
- **Date range selector** -- Pick "From" and "To" dates to generate reports for any period.
- **Auto-generation** -- The report generates automatically when you select a type or change the date range.
- **CSV export** -- Click the download button to export the report data as a CSV file for use in spreadsheets.
- **Print to PDF** -- Press **Cmd+P** (Mac) or **Ctrl+P** (Windows) to print the current report or save it as a PDF.

**Tips:**
- Generate the Executive Summary weekly for management meetings.
- Export the Financial report monthly for accounting.

---

### 25. Admin Panel

**What it does:** System administration tools for database management, user accounts, and system configuration.

**How to access:** Sidebar > **Admin**

**Key features:**
- **Database Explorer** (Admin > Database) -- Browse and inspect database tables directly. Useful for troubleshooting data issues. Use with caution -- this shows raw system data.
- **User Management** (Admin > Users) -- View all user accounts, their roles, and last login times. Create new users, deactivate accounts, or change roles.
- **System Config** (Admin > Config) -- Advanced system configuration options. Modify these settings only if you understand the impact.
- **Audit Trail** (Admin > Audit) -- See module 8 above.

**Tips:**
- Restrict Admin access to managers and technical staff only.
- Use the Database Explorer for troubleshooting, not for day-to-day operations.

---

### 26. Marketplace

**What it does:** A future module for managing partner services including excursions, beach passes, airport shuttles, flash deals, and commission tracking.

**How to access:** Sidebar > **Marketplace**

**Current status:** This module is planned for Phase 2 and displays a placeholder page. When launched, it will allow you to:
- Manage partner excursion providers.
- Sell beach day passes to guests.
- Arrange airport shuttle services.
- Create flash deals and promotional packages.
- Track partner commissions.

---

### 27-29. Theme, Mobile, and Authentication

**Theme:**
HospitAI uses a dark-first design with an optional light mode. The theme toggle is in the header bar. Dark mode reduces eye strain during long shifts, especially at the front desk during evening hours. Your choice is saved in your browser and applies automatically on your next login.

**Mobile:**
HospitAI is a responsive web application that works on phones, tablets, and desktops. There is no app to install -- visit **app.hospitai.uk** in your mobile browser. On mobile:
- The sidebar becomes a slide-out drawer (tap the hamburger menu).
- Tables scroll horizontally.
- Charts and cards stack vertically.
- The AI Chat button remains accessible in the bottom-right corner.

For the best mobile experience, add the site to your home screen (Safari: Share > Add to Home Screen; Chrome: three dots > Add to Home Screen).

**Authentication:**
HospitAI uses secure email and password authentication powered by Supabase. Sessions persist until you log out or your session expires. If you are redirected to the login page unexpectedly, your session has expired -- simply log in again. For security:
- Change the default admin password after first login.
- Each staff member should have their own account.
- Do not share login credentials between staff.

---

## Tips and Best Practices

**Daily routine:**
1. **Start with the Dashboard.** Check occupancy, arrivals, departures, and any AI alerts.
2. **Review notifications.** Clear any critical alerts first.
3. **Check the AI Command Centre.** Look at the health score and top insights.
4. **Review pending Brain decisions.** Approve or reject any decisions waiting for your input.
5. **Scan housekeeping tasks.** Ensure rooms for today's arrivals are assigned and on track.
6. **Glance at maintenance.** Address urgent and emergency tickets.

**Weekly routine:**
1. **Review AI Brain decision history.** Look for patterns in what you approve and reject. If you consistently approve a certain type of decision, consider switching that category to autonomous mode.
2. **Check the Revenue Copilot.** Review channel mix and run a What-If simulation for next week's rates.
3. **Generate the Executive Summary report.** Share with management.
4. **Review Guest Intelligence.** Check for high-churn-risk guests and follow up.
5. **Check the Energy Dashboard.** Look for new waste patterns.

**General best practices:**
- **Keep the scheduler running** during operating hours for continuous intelligence. The AI gets smarter with more data.
- **Use the AI Chat** for quick answers instead of clicking through multiple pages.
- **Record outcomes** on completed workflows. This feedback helps the AI make better decisions over time.
- **Check the audit trail** if something looks wrong or unexpected.
- **Use reports with CSV export** for any analysis you need to share outside HospitAI.
- **Enable all five automations** once you are comfortable with the system. Manual operation is slower and more error-prone.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Page will not load or looks broken** | Hard refresh: press **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows). This clears the browser cache for the page. |
| **Styles are missing or the page looks unstyled** | Clear the `.next` build cache and restart the development server. In production, try a hard refresh first. |
| **Data shows 0 or dashboards are empty** | Check the database connection. Verify that the Supabase environment variables are correctly set. Contact your system administrator. |
| **Cannot log in** | Verify your email and password are correct. Check that your account has not been deactivated in Admin > Users. Try clearing cookies for the site. |
| **AI Brain shows "No brain cycles yet"** | Click "Run Brain Cycle" to trigger the first cycle. The brain needs at least one cycle to produce decisions. |
| **Scheduler stops running** | The scheduler resets on server redeploy. Go to Sidebar > AI Scheduler and click "Start Scheduler" again. |
| **Predictions show an error** | The ML model needs at least 10 days of historical booking data to train. If the property is new, wait for more bookings to accumulate and click "Retrain Model". |
| **Notifications are not appearing** | Check that your browser allows notifications from app.hospitai.uk. Also verify the notification bell is visible in the header. |
| **Charts are not displaying** | Try a different browser. Some older browsers do not support modern chart rendering. Chrome, Firefox, Safari, and Edge are all supported. |
| **Mobile sidebar won't close** | Tap outside the sidebar overlay (the dark background area) or tap the X button at the top of the sidebar. |

**Getting help:**
If you encounter an issue not covered here, check the audit trail for error entries, note the exact steps that led to the problem, and contact your system administrator with this information.

---

*HospitAI -- The AI Operating System for Hotels*
*Bastet Hurghada | 270 Apartments | 5 Floors*
*Manual version 1.0 | March 2026*
