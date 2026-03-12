-- ============================================================
-- Migration 00010: Performance Indexes
-- ============================================================

-- Core Property
CREATE INDEX idx_buildings_property ON buildings(property_id);
CREATE INDEX idx_apartments_property ON apartments(property_id);
CREATE INDEX idx_apartments_building ON apartments(building_id);
CREATE INDEX idx_apartments_type ON apartments(apartment_type_id);
CREATE INDEX idx_apartments_status ON apartments(status);
CREATE INDEX idx_apartment_images_apartment ON apartment_images(apartment_id);
CREATE INDEX idx_apartment_images_type ON apartment_images(apartment_type_id);
CREATE INDEX idx_facilities_property ON facilities(property_id);

-- Bookings & Pricing
CREATE INDEX idx_bookings_property ON bookings(property_id);
CREATE INDEX idx_bookings_apartment ON bookings(apartment_id);
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_channel ON bookings(channel_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_checkin ON bookings(check_in);
CREATE INDEX idx_bookings_checkout ON bookings(check_out);
CREATE INDEX idx_bookings_reference ON bookings(reference);
CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX idx_rates_property_type ON rates(property_id, apartment_type_id);
CREATE INDEX idx_rates_dates ON rates(start_date, end_date);
CREATE INDEX idx_availability_apartment_date ON availability(apartment_id, date);
CREATE INDEX idx_promotions_property ON promotions(property_id);
CREATE INDEX idx_promotions_code ON promotions(code);

-- Guest & CRM
CREATE INDEX idx_guests_email ON guests(email);
CREATE INDEX idx_guests_auth ON guests(auth_user_id);
CREATE INDEX idx_guests_loyalty_tier ON guests(loyalty_tier);
CREATE INDEX idx_guest_preferences_guest ON guest_preferences(guest_id);
CREATE INDEX idx_guest_communications_guest ON guest_communications(guest_id);
CREATE INDEX idx_guest_communications_type ON guest_communications(type);
CREATE INDEX idx_guest_activity_guest ON guest_activity_log(guest_id);
CREATE INDEX idx_guest_activity_type ON guest_activity_log(activity_type);
CREATE INDEX idx_guest_activity_created ON guest_activity_log(created_at);
CREATE INDEX idx_loyalty_guest ON loyalty_programme(guest_id);
CREATE INDEX idx_reviews_booking ON reviews(booking_id);
CREATE INDEX idx_reviews_guest ON reviews(guest_id);

-- Operations
CREATE INDEX idx_staff_property ON staff(property_id);
CREATE INDEX idx_staff_auth ON staff(auth_user_id);
CREATE INDEX idx_staff_role ON staff(role);
CREATE INDEX idx_housekeeping_property ON housekeeping_tasks(property_id);
CREATE INDEX idx_housekeeping_apartment ON housekeeping_tasks(apartment_id);
CREATE INDEX idx_housekeeping_assigned ON housekeeping_tasks(assigned_to);
CREATE INDEX idx_housekeeping_status ON housekeeping_tasks(status);
CREATE INDEX idx_housekeeping_date ON housekeeping_tasks(scheduled_date);
CREATE INDEX idx_maintenance_property ON maintenance_requests(property_id);
CREATE INDEX idx_maintenance_apartment ON maintenance_requests(apartment_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_priority ON maintenance_requests(priority);
CREATE INDEX idx_inventory_property ON inventory(property_id);
CREATE INDEX idx_staff_schedules_staff ON staff_schedules(staff_id);
CREATE INDEX idx_staff_schedules_date ON staff_schedules(date);

-- Finance
CREATE INDEX idx_invoices_property ON invoices(property_id);
CREATE INDEX idx_invoices_booking ON invoices(booking_id);
CREATE INDEX idx_invoices_guest ON invoices(guest_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_expenses_property ON expenses(property_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_rnd ON expenses(is_r_and_d) WHERE is_r_and_d = true;
CREATE INDEX idx_currency_rates_pair ON currency_rates(base_currency, target_currency);
CREATE INDEX idx_financial_reports_property ON financial_reports(property_id);

-- Marketplace
CREATE INDEX idx_partners_property ON partners(property_id);
CREATE INDEX idx_partners_type ON partners(type);
CREATE INDEX idx_partners_status ON partners(status);
CREATE INDEX idx_partner_certs_partner ON partner_certifications(partner_id);
CREATE INDEX idx_excursions_property ON excursions(property_id);
CREATE INDEX idx_excursions_partner ON excursions(partner_id);
CREATE INDEX idx_excursion_bookings_excursion ON excursion_bookings(excursion_id);
CREATE INDEX idx_excursion_bookings_guest ON excursion_bookings(guest_id);
CREATE INDEX idx_beach_partnerships_property ON beach_partnerships(property_id);
CREATE INDEX idx_flash_deals_property ON flash_deals(property_id);
CREATE INDEX idx_flash_deals_active ON flash_deals(is_active, starts_at, expires_at);

-- AI & Analytics
CREATE INDEX idx_demand_forecasts_property ON demand_forecasts(property_id);
CREATE INDEX idx_demand_forecasts_date ON demand_forecasts(forecast_date);
CREATE INDEX idx_pricing_decisions_property ON pricing_decisions(property_id);
CREATE INDEX idx_guest_predictions_guest ON guest_predictions(guest_id);
CREATE INDEX idx_guest_predictions_type ON guest_predictions(prediction_type);
CREATE INDEX idx_analytics_events_property ON analytics_events(property_id);
CREATE INDEX idx_analytics_events_guest ON analytics_events(guest_id);
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);

-- Shuttle
CREATE INDEX idx_shuttle_routes_property ON shuttle_routes(property_id);
CREATE INDEX idx_shuttle_schedules_route ON shuttle_schedules(route_id);
CREATE INDEX idx_shuttle_bookings_schedule ON shuttle_bookings(schedule_id);
CREATE INDEX idx_shuttle_bookings_guest ON shuttle_bookings(guest_id);
CREATE INDEX idx_shuttle_bookings_date ON shuttle_bookings(travel_date);
