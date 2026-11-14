-- Personal API keys (`ppt_...`) are no longer accepted by the AI connector
-- (/api/mcp): it takes Clerk OAuth access tokens only. Run once against the
-- database; it's safe to run again, and safe to run where pt_api_keys was
-- never created (then it does nothing).
--
-- Marks every key that isn't revoked yet as revoked now. The table and its
-- rows stay, as a record of which keys existed, who they belonged to and when
-- they were last used. The app never reads the table any more.
--
-- To see first whether anyone is affected:
--   SELECT count(*) FROM pt_api_keys WHERE revoked_at IS NULL;
DO $$
BEGIN
    IF to_regclass('pt_api_keys') IS NOT NULL THEN
        UPDATE pt_api_keys SET revoked_at = NOW() WHERE revoked_at IS NULL;
    END IF;
END
$$;

-- Once the record isn't needed, the table can be dropped:
-- DROP TABLE IF EXISTS pt_api_keys;
