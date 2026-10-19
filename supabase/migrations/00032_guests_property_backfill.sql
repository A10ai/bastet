-- 00032: guests must belong to a property
--
-- Row-level security on guests is `can_access_property(property_id)`, which is
-- false for NULL, so a guest row without a property is invisible to every staff
-- member (the seed used to create ten such guests, and a fresh install showed
-- an empty guest list). Attach orphan guests to the property when there is
-- exactly one; a multi-property deployment keeps its rows untouched and the
-- NOT NULL constraint is only added when nothing would violate it.

UPDATE guests g
SET property_id = (SELECT id FROM properties)
WHERE g.property_id IS NULL
  AND (SELECT count(*) FROM properties) = 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guests WHERE property_id IS NULL) THEN
    ALTER TABLE guests ALTER COLUMN property_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'guests.property_id left nullable: % orphan guest(s) in a multi-property database', (SELECT count(*) FROM guests WHERE property_id IS NULL);
  END IF;
END $$;
