-- ============================================================
-- Migration 00004: Operations Module (5 tables)
-- Tables: staff, housekeeping_tasks, maintenance_requests,
--         inventory, staff_schedules
-- Also: ALTER guest_communications to add sent_by FK
-- ============================================================

-- 1. staff
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  property_id UUID NOT NULL REFERENCES properties(id),
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('owner', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'admin')),
  department VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT true,
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  avatar_url TEXT,
  hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. housekeeping_tasks
CREATE TABLE housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  assigned_to UUID REFERENCES staff(id),
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('checkout_clean', 'midstay_clean', 'deep_clean', 'inspection', 'turndown')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'verified', 'issue_found')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES staff(id),
  verified_at TIMESTAMPTZ,
  photo_before TEXT[],
  photo_after TEXT[],
  notes TEXT,
  checklist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER housekeeping_tasks_updated_at
  BEFORE UPDATE ON housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. maintenance_requests
CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  apartment_id UUID REFERENCES apartments(id),
  reported_by_guest UUID REFERENCES guests(id),
  reported_by_staff UUID REFERENCES staff(id),
  assigned_to UUID REFERENCES staff(id),
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('plumbing', 'electrical', 'hvac', 'furniture', 'appliance', 'structural', 'pest', 'other')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'emergency')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  photos TEXT[],
  resolution_notes TEXT,
  estimated_cost_gbp DECIMAL(10,2),
  actual_cost_gbp DECIMAL(10,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. inventory
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('linens', 'toiletries', 'cleaning', 'kitchen', 'maintenance', 'office', 'other')),
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(50),
  unit VARCHAR(20) NOT NULL DEFAULT 'piece',
  quantity_in_stock INT NOT NULL DEFAULT 0,
  minimum_stock INT NOT NULL DEFAULT 0,
  reorder_quantity INT,
  unit_cost_egp DECIMAL(10,2),
  supplier VARCHAR(100),
  last_restocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. staff_schedules
CREATE TABLE staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  shift_type VARCHAR(20) NOT NULL DEFAULT 'regular'
    CHECK (shift_type IN ('regular', 'overtime', 'on_call', 'holiday')),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'absent', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, date, shift_start)
);

-- Add sent_by FK to guest_communications
ALTER TABLE guest_communications
  ADD CONSTRAINT fk_guest_communications_sent_by
  FOREIGN KEY (sent_by) REFERENCES staff(id) ON DELETE SET NULL;
