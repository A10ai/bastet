# Bastet PMS — R&D Technical Log

> This log documents technical decisions and innovations that qualify for UK R&D tax credit claims under the SME scheme. Each entry records the technical uncertainty, approach taken, and resolution.

---

## RD-001: Variable-Length Stay Pricing Algorithm

**Date:** 2026-03-12
**Category:** Novel Algorithm
**Status:** In Development

**Technical Challenge:**
No existing PMS handles the full range of 1-night to 6-month stays with tiered length-of-stay discounts. Standard hotel PMS systems assume nightly stays; long-stay systems (e.g., serviced apartment platforms) don't handle short stays well.

**Approach:**
- Store base rates as weekly amounts with calculated nightly rates
- Apply tiered discount breakpoints at 7/14/21/28 nights (5%/10%/15%/20%)
- Discount curve designed to incentivise longer stays while remaining profitable
- Different discount curves planned per guest segment (tourist vs nomad vs corporate)

**Uncertainty:**
- Optimal discount percentages per segment are unknown
- A/B testing framework needed to determine optimal curves
- Interaction between length-of-stay discounts and seasonal pricing requires modelling

**Novel vs Standard:** This tiered approach for aparthotel-length stays is novel. Standard hotel PMS systems don't implement this.

---

## RD-002: 58-Field Guest Preference DNA

**Date:** 2026-03-12
**Category:** AI/ML Data Architecture
**Status:** Schema Designed

**Technical Challenge:**
Building a comprehensive guest preference profile that auto-learns from behaviour rather than requiring manual input. No existing system combines accommodation preferences, dietary needs, activity preferences, communication channels, and IoT settings into a single learnable profile.

**Approach:**
- Hybrid storage: typed SQL columns for critical preferences (floor, view, temperature) + JSONB for flexible/experimental fields
- Confidence scoring (0.00-1.00) per preference — higher confidence = more auto-learned data points
- Source tracking: which interaction taught us each preference
- The schema supports 58+ distinct preference fields

**Uncertainty:**
- Minimum number of data points needed before auto-learned preferences are reliable
- How to handle conflicting signals (e.g., guest chose sea view once but garden view twice)
- Privacy implications of behavioural learning — need consent framework

**Novel vs Standard:** Standard guest profiles store 5-10 fields. A 58-field auto-learning DNA is novel for the hospitality industry.

---

## RD-003: AI Learning Loop Architecture

**Date:** 2026-03-12
**Category:** AI/ML System Design
**Status:** Schema Designed

**Technical Challenge:**
Designing a closed-loop AI system for aparthotels: predict → recommend → measure → learn → improve. The challenge is building the data pipeline that captures recommendation outcomes to train improved models.

**Approach:**
- Separate tables for predictions (`guest_predictions`), feedback (`ai_learning_feedback`), and events (`analytics_events`)
- Each prediction stores the model version and features used, enabling A/B testing of models
- Feedback table tracks: was_shown → was_clicked → was_converted → guest_rating
- This creates a complete training data pipeline for supervised learning

**Uncertainty:**
- Cold-start problem: how to make useful recommendations with limited guest history
- Feature engineering: which guest attributes are most predictive
- Model evaluation: defining "accuracy" for subjective recommendations

**Novel vs Standard:** Most hospitality recommendation systems are rule-based. A full learning loop with feedback tracking is novel.

---

## RD-004: Flash Deals Capacity-Filling Engine

**Date:** 2026-03-12
**Category:** Real-time Marketplace
**Status:** Schema Designed

**Technical Challenge:**
Real-time matching of partner capacity gaps with guest preferences. Partners have unsold capacity (empty boat seats, spa slots); guests have preferences. The engine must create time-limited offers that fill gaps while ensuring minimum quality standards.

**Approach:**
- Minimum 25% discount constraint (must be genuinely valuable)
- Maximum 48-hour duration (creates urgency)
- Linked to partner capacity data
- Auto-targeting based on guest preference DNA and current stay status
- Quality gate: partners below 3.5/5 rating are auto-suspended from deals

**Uncertainty:**
- Optimal deal duration for conversion
- Pricing strategy: should discounts vary by demand or be fixed?
- Guest notification timing: when during their stay are guests most receptive?

**Novel vs Standard:** Time-limited, capacity-driven, personalised deals in a hotel context are novel.

---

## RD-005: Multi-Currency Real-Time Financial Architecture

**Date:** 2026-03-12
**Category:** Financial Systems
**Status:** In Development

**Technical Challenge:**
Supporting 4 currencies (GBP, EUR, USD, EGP) with daily FX rates, dual-jurisdiction reporting (UK + Egypt), and real-time conversion display. Guests pay in their currency; the system must report in both GBP (UK company) and EGP (Egyptian operations).

**Approach:**
- Store all amounts in GBP as the canonical currency
- Fetch daily FX rates from Open Exchange Rates API
- Display amounts in guest's preferred currency with GBP equivalent
- R&D expense tracking for tax credit claims (is_r_and_d flag)
- Dual reporting: UK GAAP (GBP) + Egyptian tax (EGP)

**Uncertainty:**
- Handling FX rate fluctuations between booking and payment
- Reconciliation between Stripe (multi-currency) and local cash (EGP)
- Egyptian tax reporting requirements for foreign-owned entities

**Novel vs Standard:** Multi-currency with dual-jurisdiction reporting is uncommon in PMS systems targeting this market segment.
