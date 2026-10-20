-- 00030: Point of sale to folio
--
-- Outlets (restaurant, bar, spa, shop, minibar) sell items from a catalogue.
-- A ticket for an in-house guest is posted to the stay's folio as ordinary
-- charge lines (one per item, VAT line per charge via post_folio_charge), so
-- the bill, invoices, refunds and reports need nothing special. The ticket
-- itself is kept for outlet reporting and to point at the lines it created.
--
-- Objects: pos_outlets, pos_items, pos_tickets (+ RLS), post_pos_ticket()

CREATE TABLE IF NOT EXISTS pos_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code varchar(20) NOT NULL,
  name varchar(100) NOT NULL,
  type varchar(20) NOT NULL DEFAULT 'restaurant' CHECK (type IN ('restaurant', 'bar', 'spa', 'shop', 'minibar', 'other')),
  default_tax_rate_percent numeric(5,2),                 -- NULL = property VAT rate
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, code)
);
CREATE TABLE IF NOT EXISTS pos_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES pos_outlets(id) ON DELETE CASCADE,
  sku varchar(30),
  name varchar(120) NOT NULL,
  category varchar(60),
  unit_price_gbp numeric(10,2) NOT NULL CHECK (unit_price_gbp >= 0),
  tax_rate_percent numeric(5,2),                         -- NULL = outlet default, then property VAT
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, name)
);
CREATE TABLE IF NOT EXISTS pos_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES pos_outlets(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  folio_id uuid NOT NULL REFERENCES folios(id),
  ticket_reference varchar(40),
  items jsonb NOT NULL,                                  -- what was sold, as posted
  folio_line_ids uuid[] NOT NULL DEFAULT '{}',           -- lines created on the folio (charges and VAT)
  subtotal_gbp numeric(10,2) NOT NULL,
  tax_gbp numeric(10,2) NOT NULL,
  total_gbp numeric(10,2) NOT NULL,
  business_date date NOT NULL,
  posted_by uuid REFERENCES staff(id),
  posted_by_name text,
  status varchar(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_tickets_outlet_date ON pos_tickets (outlet_id, business_date);
CREATE INDEX IF NOT EXISTS idx_pos_tickets_booking ON pos_tickets (booking_id);
DROP TRIGGER IF EXISTS pos_outlets_updated_at ON pos_outlets;
CREATE TRIGGER pos_outlets_updated_at BEFORE UPDATE ON pos_outlets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS pos_items_updated_at ON pos_items;
CREATE TRIGGER pos_items_updated_at BEFORE UPDATE ON pos_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE pos_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_outlets_select ON pos_outlets;
DROP POLICY IF EXISTS pos_outlets_manage ON pos_outlets;
DROP POLICY IF EXISTS pos_items_select ON pos_items;
DROP POLICY IF EXISTS pos_items_manage ON pos_items;
DROP POLICY IF EXISTS pos_tickets_select ON pos_tickets;
DROP POLICY IF EXISTS pos_tickets_insert ON pos_tickets;
DROP POLICY IF EXISTS pos_tickets_update ON pos_tickets;
CREATE POLICY pos_outlets_select ON pos_outlets FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY pos_outlets_manage ON pos_outlets FOR ALL TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id)) WITH CHECK (role_at_least(70) AND can_access_property(property_id));
CREATE POLICY pos_items_select ON pos_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pos_outlets o WHERE o.id = outlet_id AND can_access_property(o.property_id)));
CREATE POLICY pos_items_manage ON pos_items FOR ALL TO authenticated
  USING (role_at_least(70) AND EXISTS (SELECT 1 FROM pos_outlets o WHERE o.id = outlet_id AND can_access_property(o.property_id)))
  WITH CHECK (role_at_least(70) AND EXISTS (SELECT 1 FROM pos_outlets o WHERE o.id = outlet_id AND can_access_property(o.property_id)));
-- Any staff member of the property can sell (housekeeping posts minibar); only the function inserts.
CREATE POLICY pos_tickets_select ON pos_tickets FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY pos_tickets_insert ON pos_tickets FOR INSERT TO authenticated WITH CHECK (role_at_least(30) AND can_access_property(property_id));
CREATE POLICY pos_tickets_update ON pos_tickets FOR UPDATE TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id)) WITH CHECK (role_at_least(70) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_outlets, pos_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pos_tickets TO authenticated;
GRANT ALL ON pos_outlets, pos_items, pos_tickets TO service_role;

-- Post a ticket to the in-house guest's folio. Items: [{item_id?, name, quantity, unit_price_gbp, tax_rate_percent?}].
-- Prices come from the catalogue when item_id is given (the till cannot invent prices); free-text lines
-- need a name and a price and are allowed for managers' use ("other" items).
CREATE OR REPLACE FUNCTION post_pos_ticket(
  p_outlet_id uuid,
  p_booking_id uuid,
  p_items jsonb,
  p_ticket_reference text DEFAULT NULL,
  p_posted_by uuid DEFAULT NULL,
  p_posted_by_name text DEFAULT 'pos'
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_o pos_outlets%ROWTYPE;
  v_b bookings%ROWTYPE;
  v_item pos_items%ROWTYPE;
  v_folio uuid;
  v_type text;
  it jsonb;
  v_name text; v_qty numeric; v_price numeric; v_rate numeric;
  v_res jsonb;
  v_lines uuid[] := '{}';
  v_posted jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_tax numeric := 0;
  v_ticket pos_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM pos_outlets WHERE id = p_outlet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OUTLET_NOT_FOUND: outlet % not found', p_outlet_id; END IF;
  IF NOT v_o.is_active THEN RAISE EXCEPTION 'OUTLET_CLOSED: % is closed', v_o.name; END IF;
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % not found', p_booking_id; END IF;
  IF v_b.property_id <> v_o.property_id THEN RAISE EXCEPTION 'PROPERTY_FORBIDDEN: outlet and booking belong to different properties'; END IF;
  IF v_b.status <> 'checked_in' THEN RAISE EXCEPTION 'NOT_IN_HOUSE: booking % is % (room charges need an in-house guest)', v_b.reference, v_b.status; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: a ticket needs at least one item';
  END IF;
  v_folio := open_folio(p_booking_id);
  v_type := CASE WHEN v_o.type IN ('restaurant', 'bar', 'minibar') THEN 'fnb' ELSE 'extra' END;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((it->>'quantity')::numeric, 1);
    IF v_qty <= 0 OR v_qty > 999 THEN RAISE EXCEPTION 'INVALID_AMOUNT: quantity must be between 1 and 999'; END IF;
    IF (it->>'item_id') IS NOT NULL THEN
      SELECT * INTO v_item FROM pos_items WHERE id = (it->>'item_id')::uuid AND outlet_id = p_outlet_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: item % is not sold by %', it->>'item_id', v_o.name; END IF;
      IF NOT v_item.is_active THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: % is no longer on the menu', v_item.name; END IF;
      v_name := v_item.name; v_price := v_item.unit_price_gbp;
      v_rate := COALESCE(v_item.tax_rate_percent, v_o.default_tax_rate_percent);
    ELSE
      v_name := NULLIF(trim(it->>'name'), '');
      v_price := (it->>'unit_price_gbp')::numeric;
      v_rate := COALESCE((it->>'tax_rate_percent')::numeric, v_o.default_tax_rate_percent);
      IF v_name IS NULL OR v_price IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT: free-text items need a name and a price'; END IF;
    END IF;
    v_res := post_folio_charge(v_folio, v_type, v_o.name || ': ' || v_name, v_qty, v_price, v_rate, p_posted_by_name);
    v_lines := v_lines || (v_res->'line'->>'id')::uuid;
    IF (v_res->>'tax_line_id') IS NOT NULL THEN
      v_lines := v_lines || (v_res->>'tax_line_id')::uuid;
      v_tax := v_tax + COALESCE((SELECT debit_gbp FROM folio_lines WHERE id = (v_res->>'tax_line_id')::uuid), 0);
    END IF;
    v_sub := v_sub + ROUND(v_qty * v_price, 2);
    v_posted := v_posted || jsonb_build_object('name', v_name, 'quantity', v_qty, 'unit_price_gbp', v_price, 'tax_rate_percent', (v_res->'line'->>'tax_rate_percent')::numeric, 'line_id', v_res->'line'->>'id');
  END LOOP;

  INSERT INTO pos_tickets (property_id, outlet_id, booking_id, folio_id, ticket_reference, items, folio_line_ids, subtotal_gbp, tax_gbp, total_gbp, business_date, posted_by, posted_by_name)
  VALUES (v_o.property_id, p_outlet_id, p_booking_id, v_folio, p_ticket_reference, v_posted, v_lines, ROUND(v_sub, 2), ROUND(v_tax, 2), ROUND(v_sub + v_tax, 2), property_business_date(v_o.property_id), p_posted_by, p_posted_by_name)
  RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket.id, 'folio_id', v_folio, 'booking_id', p_booking_id, 'reference', v_b.reference,
    'outlet', v_o.name, 'items', v_posted, 'subtotal_gbp', v_ticket.subtotal_gbp, 'tax_gbp', v_ticket.tax_gbp,
    'total_gbp', v_ticket.total_gbp, 'folio_balance_gbp', folio_balance(v_folio)
  );
END $$;
GRANT EXECUTE ON FUNCTION post_pos_ticket(uuid, uuid, jsonb, text, uuid, text) TO authenticated, service_role;

-- Void a whole ticket: reverses every line it posted (manager, reason required) and marks the ticket.
CREATE OR REPLACE FUNCTION void_pos_ticket(p_ticket_id uuid, p_reason text, p_actor text DEFAULT 'manager') RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v_t pos_tickets%ROWTYPE; v_line uuid; v_n integer := 0;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to void a ticket'; END IF;
  SELECT * INTO v_t FROM pos_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND: ticket % not found', p_ticket_id; END IF;
  IF v_t.status = 'voided' THEN RAISE EXCEPTION 'ALREADY_VOIDED: ticket already voided'; END IF;
  FOREACH v_line IN ARRAY v_t.folio_line_ids LOOP
    -- Every line the ticket created (charges and their VAT) that has not been reversed yet
    IF NOT EXISTS (SELECT 1 FROM folio_lines WHERE reversal_of = v_line) THEN
      PERFORM void_folio_line(v_line, p_reason, p_actor);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  UPDATE pos_tickets SET status = 'voided', voided_at = now() WHERE id = p_ticket_id;
  RETURN jsonb_build_object('ticket_id', p_ticket_id, 'lines_voided', v_n, 'folio_balance_gbp', folio_balance(v_t.folio_id));
END $$;
GRANT EXECUTE ON FUNCTION void_pos_ticket(uuid, text, text) TO authenticated, service_role;
