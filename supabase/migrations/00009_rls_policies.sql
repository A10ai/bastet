-- ============================================================
-- Migration 00009: Row Level Security Policies
-- Enables RLS on all tables and creates access policies
-- ============================================================

-- Helper function: get current staff member's property_id
CREATE OR REPLACE FUNCTION get_staff_property_id()
RETURNS UUID AS $$
  SELECT property_id FROM staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current staff member's role
CREATE OR REPLACE FUNCTION get_staff_role()
RETURNS TEXT AS $$
  SELECT role FROM staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is a guest
CREATE OR REPLACE FUNCTION is_guest()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM guests WHERE auth_user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_programme ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE excursions ENABLE ROW LEVEL SECURITY;
ALTER TABLE excursion_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beach_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_bookings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Staff policies: staff can access data within their property
-- ============================================================

-- Properties: staff can read their own property
CREATE POLICY staff_read_property ON properties
  FOR SELECT TO authenticated
  USING (id = get_staff_property_id());

-- Buildings: staff can CRUD for their property
CREATE POLICY staff_manage_buildings ON buildings
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Apartment types: staff can CRUD for their property
CREATE POLICY staff_manage_apartment_types ON apartment_types
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Apartments: staff can CRUD for their property
CREATE POLICY staff_manage_apartments ON apartments
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Apartment images: staff can manage
CREATE POLICY staff_manage_apartment_images ON apartment_images
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Facilities: staff can CRUD for their property
CREATE POLICY staff_manage_facilities ON facilities
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Facility bookings: staff can manage all
CREATE POLICY staff_manage_facility_bookings ON facility_bookings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Booking channels: all staff can read
CREATE POLICY staff_read_channels ON booking_channels
  FOR SELECT TO authenticated
  USING (true);

-- Bookings: staff can manage for their property
CREATE POLICY staff_manage_bookings ON bookings
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Rates: staff can manage for their property
CREATE POLICY staff_manage_rates ON rates
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Availability: staff can manage
CREATE POLICY staff_manage_availability ON availability
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Promotions: staff can manage for their property
CREATE POLICY staff_manage_promotions ON promotions
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Booking addons: staff can manage
CREATE POLICY staff_manage_booking_addons ON booking_addons
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Guest segments: all staff can read
CREATE POLICY staff_read_segments ON guest_segments
  FOR SELECT TO authenticated
  USING (true);

-- Guests: all staff can manage
CREATE POLICY staff_manage_guests ON guests
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Guest preferences: all staff can manage
CREATE POLICY staff_manage_guest_prefs ON guest_preferences
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Guest communications: all staff can manage
CREATE POLICY staff_manage_guest_comms ON guest_communications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Guest activity log: all staff can read
CREATE POLICY staff_read_activity_log ON guest_activity_log
  FOR SELECT TO authenticated
  USING (true);

-- Loyalty programme: all staff can read
CREATE POLICY staff_read_loyalty ON loyalty_programme
  FOR SELECT TO authenticated
  USING (true);

-- Reviews: all staff can manage
CREATE POLICY staff_manage_reviews ON reviews
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Staff: can read all staff in their property
CREATE POLICY staff_read_staff ON staff
  FOR SELECT TO authenticated
  USING (property_id = get_staff_property_id());

-- Housekeeping: staff can manage for their property
CREATE POLICY staff_manage_housekeeping ON housekeeping_tasks
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Maintenance: staff can manage for their property
CREATE POLICY staff_manage_maintenance ON maintenance_requests
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Inventory: staff can manage for their property
CREATE POLICY staff_manage_inventory ON inventory
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Staff schedules: staff can read their property's schedules
CREATE POLICY staff_read_schedules ON staff_schedules
  FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM staff WHERE property_id = get_staff_property_id()));

-- Invoices: staff can manage for their property
CREATE POLICY staff_manage_invoices ON invoices
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Payments: staff can manage
CREATE POLICY staff_manage_payments ON payments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Expenses: staff can manage for their property
CREATE POLICY staff_manage_expenses ON expenses
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Currency rates: all authenticated can read
CREATE POLICY read_currency_rates ON currency_rates
  FOR SELECT TO authenticated
  USING (true);

-- Financial reports: staff can manage for their property
CREATE POLICY staff_manage_reports ON financial_reports
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Partners: staff can manage for their property
CREATE POLICY staff_manage_partners ON partners
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Partner certifications: staff can manage
CREATE POLICY staff_manage_certs ON partner_certifications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Excursions: staff can manage for their property
CREATE POLICY staff_manage_excursions ON excursions
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Excursion bookings: staff can manage
CREATE POLICY staff_manage_excursion_bookings ON excursion_bookings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Beach partnerships: staff can manage for their property
CREATE POLICY staff_manage_beaches ON beach_partnerships
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Flash deals: staff can manage for their property
CREATE POLICY staff_manage_flash_deals ON flash_deals
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- AI tables: staff can read for their property
CREATE POLICY staff_read_forecasts ON demand_forecasts
  FOR SELECT TO authenticated
  USING (property_id = get_staff_property_id());

CREATE POLICY staff_read_pricing_decisions ON pricing_decisions
  FOR SELECT TO authenticated
  USING (property_id = get_staff_property_id());

CREATE POLICY staff_read_predictions ON guest_predictions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY staff_read_ai_feedback ON ai_learning_feedback
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY staff_read_analytics ON analytics_events
  FOR SELECT TO authenticated
  USING (property_id = get_staff_property_id());

-- Shuttle routes: staff can manage for their property
CREATE POLICY staff_manage_shuttle_routes ON shuttle_routes
  FOR ALL TO authenticated
  USING (property_id = get_staff_property_id())
  WITH CHECK (property_id = get_staff_property_id());

-- Shuttle schedules: staff can manage
CREATE POLICY staff_manage_shuttle_schedules ON shuttle_schedules
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Shuttle bookings: staff can manage
CREATE POLICY staff_manage_shuttle_bookings ON shuttle_bookings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
