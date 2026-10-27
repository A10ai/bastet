-- Test helpers (schema tst). Identity switching works inside a transaction:
--   BEGIN; SELECT tst.as_user('recA'); ... ; ROLLBACK;
CREATE SCHEMA tst;
CREATE TABLE tst.users(name text PRIMARY KEY, id uuid NOT NULL);

CREATE FUNCTION tst.as_user(p text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  IF p = 'anon' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon; RETURN p;
  END IF;
  IF p = 'service' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SET LOCAL ROLE service_role; RETURN p;
  END IF;
  SELECT id INTO v FROM tst.users WHERE name = p;
  IF v IS NULL THEN RAISE EXCEPTION 'tst: no user %', p; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated; RETURN p;
END $$;

-- try(sql): run a statement as the current role; 'OK rows=N' or 'ERR <state>: <msg>'
CREATE FUNCTION tst.try(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT; RETURN 'OK rows=' || n;
EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLSTATE || ': ' || SQLERRM; END $$;

-- val(sql): first column of the first row as text ('<null>' if none), or 'ERR ...'
CREATE FUNCTION tst.val(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN EXECUTE q INTO r; RETURN coalesce(r, '<null>');
EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLSTATE || ': ' || SQLERRM; END $$;

-- denied: the statement must raise, or touch zero rows.
CREATE FUNCTION tst.denied(label text, q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text := tst.try(q);
BEGIN
  IF r LIKE 'OK rows=%' AND r <> 'OK rows=0' THEN
    RAISE EXCEPTION 'expected denied: % -> %', label, r;
  END IF;
END $$;

-- allowed: the statement must succeed and touch at least one row.
CREATE FUNCTION tst.allowed(label text, q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text := tst.try(q);
BEGIN
  IF r NOT LIKE 'OK rows=%' OR r = 'OK rows=0' THEN
    RAISE EXCEPTION 'expected allowed: % -> %', label, r;
  END IF;
END $$;

-- raises: the statement must raise an error whose text contains needle.
CREATE FUNCTION tst.raises(label text, q text, needle text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text := tst.try(q);
BEGIN
  IF r NOT LIKE 'ERR %' OR position(needle IN r) = 0 THEN
    RAISE EXCEPTION 'expected error containing "%": % -> %', needle, label, r;
  END IF;
END $$;

-- ok: the value query must succeed (not raise).
CREATE FUNCTION tst.ok(label text, q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text := tst.val(q);
BEGIN
  IF r LIKE 'ERR %' THEN RAISE EXCEPTION 'expected success: % -> %', label, r; END IF;
  RETURN r;
END $$;

CREATE FUNCTION tst.eq(label text, got text, want text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN RAISE EXCEPTION 'expected %: got %, want %', label, got, want; END IF;
END $$;

-- rows visible to the current role
CREATE FUNCTION tst.n(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r bigint; BEGIN EXECUTE 'SELECT count(*) FROM (' || q || ') s' INTO r; RETURN r; END $$;

GRANT USAGE ON SCHEMA tst TO anon, authenticated, service_role;
GRANT SELECT ON tst.users TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO anon, authenticated, service_role;

-- mk: insert a property-A booking as the current role.
--   tst.mk(id, apartment '101'..'103', status, check_in offset, check_out offset, nightly rate)
CREATE FUNCTION tst.mk(p_id uuid, p_apt text, p_status text, p_in int, p_out int, p_rate numeric DEFAULT 100) RETURNS text LANGUAGE sql AS $$
  SELECT tst.try(format($q$insert into bookings(id,property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,total_amount_gbp)
   values (%L,'aaaaaaaa-0000-0000-0000-000000000001',%L,'aaaaaaaa-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001',%L,%L,current_date+%s,current_date+%s,%s,%s)$q$,
   p_id, 'aaaaaaaa-0000-0000-0001-000000000' || p_apt, left(p_id::text, 8) || right(p_id::text, 4), p_status, p_in, p_out, p_rate, p_rate * (p_out - p_in))) $$;
GRANT EXECUTE ON FUNCTION tst.mk TO anon, authenticated, service_role;

CREATE FUNCTION tst.id(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM tst.users WHERE name = p $$;
GRANT EXECUTE ON FUNCTION tst.id TO anon, authenticated, service_role;
