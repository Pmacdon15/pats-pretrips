-- "Allow AI apps to sign for me" (the Signature page). Run once against the
-- database, after 2026-11-15-pretrip-signatures.sql; it's safe to run again.
-- Until it has run, the app still works: AI apps can't sign (every trip they
-- start is saved unsigned), the switch on the Signature page can't be turned
-- on, and the server logs once that the column is missing.

-- allow_ai_signing: whether AI apps connected through the MCP server may sign
-- pre-trips with this saved signature. Off unless the driver turns it on, so
-- every driver, including those who already saved a signature, starts with
-- it off and has to opt in.
--
-- It lives on the saved signature's row because it only means something while
-- a signature is saved:
-- - Replacing the signature (drawing a new one) updates the same row and
--   keeps the driver's choice.
-- - Deleting the signature deletes the row and the choice with it, so a
--   signature saved later starts with AI signing off again.
ALTER TABLE pt_driver_signatures
    ADD COLUMN IF NOT EXISTS allow_ai_signing BOOLEAN NOT NULL DEFAULT FALSE;
