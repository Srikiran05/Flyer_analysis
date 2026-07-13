-- ============================================================
-- SECURITY LOCKDOWN: remove all anon access to business data
--
-- Before this migration, every analytics RPC and the
-- mv_promo_dimensions materialized view were granted to `anon`,
-- and core tables had no RLS. Anyone holding the public anon key
-- (it ships in the JS bundle) could read the entire dataset
-- without logging in. This migration:
--   1. Revokes anon EXECUTE on all RPCs
--   2. Revokes anon SELECT on mv_promo_dimensions
--   3. Revokes anon table privileges on core tables
--   4. Enables RLS on core tables with authenticated-only policies
--
-- The backend ingestion pipeline connects with the service role /
-- direct postgres connection, which bypasses RLS, so it is
-- unaffected.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Revoke anon EXECUTE on all analytics RPCs
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_promo_brands_by_category(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_promo_subcategories_by_category(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_promo_pack_sizes_by_category(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_promotion_analysis_stats_multi(text, text, text[], text, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_per_competitor_stats(text, text[], text, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_market_totals(text, text, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_competitor_pricing_aggregations(text, text, text, text, text, text[], text, boolean, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_competitor_pack_aggregations(text, text, text, text, text, text[], text, boolean, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_retailer_activity(text, text, text[], text[], text[], text[], boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_offers_filtered_paged(
    text, text[], text[], text[], text[], text[], text[], text, date, date, boolean, integer, integer
) FROM anon;

-- get_current_user_permissions is defined outside these migrations;
-- revoke defensively without failing if the signature differs.
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.get_current_user_permissions() FROM anon;
EXCEPTION
    WHEN undefined_function THEN
        RAISE NOTICE 'get_current_user_permissions() not found with this signature; revoke it manually if it exists.';
END;
$$;

-- Belt and braces: new functions in public should not be callable by
-- anon by default (PUBLIC gets EXECUTE on new functions otherwise).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ------------------------------------------------------------
-- 2. Materialized view (RLS does not apply to matviews;
--    revoking the grant is the only lever)
-- ------------------------------------------------------------
REVOKE SELECT ON public.mv_promo_dimensions FROM anon;

-- ------------------------------------------------------------
-- 3. Revoke anon privileges on core tables
-- ------------------------------------------------------------
REVOKE ALL ON public.flyer_products FROM anon;
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.client_users FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_saved_filters FROM anon;
REVOKE ALL ON public.user_liked_offers FROM anon;
REVOKE ALL ON public.user_offer_notes FROM anon;

-- Analytics data is read-only from the app; writes go through the
-- service-role pipeline.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.flyer_products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.clients FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_users FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM authenticated;

-- ------------------------------------------------------------
-- 4. Enable RLS with authenticated-only policies
-- ------------------------------------------------------------

-- flyer_products: shared analytics data, readable by any signed-in user.
-- (Per-client scoping happens inside SECURITY DEFINER RPCs via
-- get_current_user_permissions.)
ALTER TABLE public.flyer_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read flyer products" ON public.flyer_products;
CREATE POLICY "Authenticated users can read flyer products"
    ON public.flyer_products
    FOR SELECT
    TO authenticated
    USING (true);

-- clients / client_users / profiles: some of these may be views rather
-- than tables (profiles is a view in this project). RLS only applies to
-- tables, so enable it conditionally; views keep their revoked anon
-- grant from section 3, and their per-user filtering must live in the
-- view definition itself (see follow-up migration).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'clients' AND c.relkind = 'r') THEN
        ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;
        CREATE POLICY "Authenticated users can read clients"
            ON public.clients
            FOR SELECT
            TO authenticated
            USING (true);
    ELSE
        RAISE NOTICE 'public.clients is not a plain table; skipping RLS.';
    END IF;

    -- client_users: a user may read only their own row (looked up by
    -- email in AuthContext.fetchAndStoreClientUserId).
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'client_users' AND c.relkind = 'r') THEN
        ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can read their own client_users row" ON public.client_users;
        CREATE POLICY "Users can read their own client_users row"
            ON public.client_users
            FOR SELECT
            TO authenticated
            USING (email = (auth.jwt() ->> 'email'));
    ELSE
        RAISE NOTICE 'public.client_users is not a plain table; skipping RLS.';
    END IF;

    -- profiles: a user may read only their own profile (looked up by
    -- email in AuthContext.loadUserProfile). In this project profiles
    -- is a VIEW, so RLS cannot be enabled here; the row filtering must
    -- be enforced in the view definition or its underlying table.
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'profiles' AND c.relkind = 'r') THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
        CREATE POLICY "Users can read their own profile"
            ON public.profiles
            FOR SELECT
            TO authenticated
            USING (email = (auth.jwt() ->> 'email'));
    ELSE
        RAISE NOTICE 'public.profiles is not a plain table; skipping RLS. Secure the view definition instead.';
    END IF;
END;
$$;
