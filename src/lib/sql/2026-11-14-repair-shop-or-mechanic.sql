-- A repair names the mechanic, the shop, or both: the mechanic is no longer
-- required. Run once after 2026-11-13-defect-repairs.sql; it's safe to run
-- again.
ALTER TABLE pt_defect_repairs ALTER COLUMN mechanic_name DROP NOT NULL;

ALTER TABLE pt_defect_repairs
    DROP CONSTRAINT IF EXISTS pt_defect_repairs_who_check;
ALTER TABLE pt_defect_repairs
    ADD CONSTRAINT pt_defect_repairs_who_check
    CHECK (COALESCE(mechanic_name, '') <> '' OR COALESCE(shop_name, '') <> '');
