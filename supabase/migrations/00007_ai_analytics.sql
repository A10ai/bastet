-- ============================================================
-- Migration 00007: AI & Analytics Module (5 tables)
-- Tables: demand_forecasts, pricing_decisions, guest_predictions,
--         ai_learning_feedback, analytics_events
-- ============================================================

-- R&D NOTE: AI Learning Loop Architecture
-- Challenge: Building a closed-loop AI system that predicts, recommends, measures, and learns
-- Approach: Separate tables for predictions and feedback to create a training data pipeline
-- The predict → recommend → measure → learn → improve cycle is novel for aparthotels

-- 1. demand_forecasts
CREATE TABLE demand_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  forecast_date DATE NOT NULL,
  horizon_days INT NOT NULL,
  predicted_occupancy DECIMAL(5,2) NOT NULL,
  predicted_adr_gbp DECIMAL(10,2),
  predicted_revenue_gbp DECIMAL(12,2),
  confidence_score DECIMAL(3,2) NOT NULL,
  model_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  factors JSONB DEFAULT '{}'::jsonb,
  actual_occupancy DECIMAL(5,2),
  actual_revenue_gbp DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. pricing_decisions
CREATE TABLE pricing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  apartment_type_id UUID NOT NULL REFERENCES apartment_types(id),
  decision_date DATE NOT NULL,
  base_rate_gbp DECIMAL(10,2) NOT NULL,
  recommended_rate_gbp DECIMAL(10,2) NOT NULL,
  applied_rate_gbp DECIMAL(10,2),
  adjustment_reason VARCHAR(50)
    CHECK (adjustment_reason IN ('high_demand', 'low_demand', 'competitor', 'event', 'manual', 'seasonal')),
  demand_score DECIMAL(3,2),
  was_accepted BOOLEAN,
  accepted_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. guest_predictions
CREATE TABLE guest_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id),
  prediction_type VARCHAR(30) NOT NULL
    CHECK (prediction_type IN ('return_probability', 'spend_forecast', 'upsell_likelihood', 'churn_risk', 'segment_change')),
  predicted_value DECIMAL(10,4) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  model_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  features_used JSONB DEFAULT '{}'::jsonb,
  actual_outcome DECIMAL(10,4),
  was_accurate BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);

-- 4. ai_learning_feedback
CREATE TABLE ai_learning_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID,
  recommendation_type VARCHAR(30) NOT NULL,
  recommendation_detail JSONB NOT NULL,
  was_shown BOOLEAN NOT NULL DEFAULT false,
  was_clicked BOOLEAN NOT NULL DEFAULT false,
  was_converted BOOLEAN NOT NULL DEFAULT false,
  guest_rating SMALLINT CHECK (guest_rating BETWEEN 1 AND 5),
  feedback_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. analytics_events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  guest_id UUID REFERENCES guests(id),
  event_name VARCHAR(50) NOT NULL,
  event_category VARCHAR(30) NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  session_id VARCHAR(50),
  device_type VARCHAR(20),
  platform VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
