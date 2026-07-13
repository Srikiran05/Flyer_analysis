-- ============================================================
-- 1. CLOSE THE PUBLIC-EXECUTE GAP
--
-- Postgres grants EXECUTE on every new function to the PUBLIC
-- pseudo-role by default, and `anon` is a member of PUBLIC. The
-- earlier lockdown migration revoked the explicit anon grants, but
-- the implicit PUBLIC grant can still let anon call the RPCs —
-- including the SECURITY DEFINER one that bypasses RLS. Revoke
-- PUBLIC explicitly and re-grant to authenticated only.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_promo_brands_by_category(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_promo_subcategories_by_category(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_promo_pack_sizes_by_category(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_promotion_analysis_stats_multi(text, text, text[], text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_per_competitor_stats(text, text[], text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_market_totals(text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_competitor_pricing_aggregations(text, text, text, text, text, text[], text, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_competitor_pack_aggregations(text, text, text, text, text, text[], text, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_retailer_activity(text, text, text[], text[], text[], text[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_offers_filtered_paged(
    text, text[], text[], text[], text[], text[], text[], text, date, date, boolean, integer, integer
) FROM PUBLIC;

DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.get_current_user_permissions() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.get_current_user_permissions() TO authenticated, service_role;
EXCEPTION
    WHEN undefined_function THEN
        RAISE NOTICE 'get_current_user_permissions() not found with this signature; adjust manually.';
END;
$$;

-- Future functions in public should not be PUBLIC-executable either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Keep service_role working for backend/admin use.
GRANT EXECUTE ON FUNCTION public.get_promo_brands_by_category(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_promo_subcategories_by_category(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_promo_pack_sizes_by_category(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_promotion_analysis_stats_multi(text, text, text[], text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_per_competitor_stats(text, text[], text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_market_totals(text, text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_competitor_pricing_aggregations(text, text, text, text, text, text[], text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_competitor_pack_aggregations(text, text, text, text, text, text[], text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_retailer_activity(text, text, text[], text[], text[], text[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_offers_filtered_paged(
    text, text[], text[], text[], text[], text[], text[], text, date, date, boolean, integer, integer
) TO service_role;

-- ============================================================
-- 2. DETAIL-ROWS RPC
--
-- Replaces the client-side pattern of paging flyer_products 1000
-- rows at a time (10+ sequential round trips, hard 10k cap, silent
-- truncation). One call, filters applied server-side with the new
-- indexes, newest offers first so a hit on the cap keeps the most
-- relevant rows. Callers detect truncation via rows.length ===
-- p_max_rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_flyer_products_detail(
    p_country text,
    p_region text DEFAULT NULL,
    p_retailer text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_subcategory text DEFAULT NULL,
    p_quantity text DEFAULT NULL,
    p_max_rows integer DEFAULT 10000
)
RETURNS TABLE (product jsonb)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', fp.id,
        'brand', fp.brand,
        'category', fp.category,
        'type', fp.type,
        'product_name', fp.product_name,
        'offer_name', fp.offer_name,
        'regular_price', fp.regular_price,
        'discounted_price', fp.discounted_price,
        'weight_quantity', fp.weight_quantity,
        'country', fp.country,
        'coverage_regions', fp.coverage_regions,
        'mart_name', fp.mart_name,
        'image_path', fp.image_path,
        'start_date', fp.start_date,
        'end_date', fp.end_date
    )
    FROM public.flyer_products fp
    WHERE lower(fp.country) = lower(btrim(p_country))
      AND (nullif(btrim(p_region), '') IS NULL
           OR fp.coverage_regions ILIKE '%' || btrim(p_region) || '%')
      AND (nullif(btrim(p_retailer), '') IS NULL
           OR fp.mart_name ILIKE btrim(p_retailer))
      AND (nullif(btrim(p_category), '') IS NULL
           OR fp.category ILIKE btrim(p_category))
      AND (nullif(btrim(p_subcategory), '') IS NULL
           OR fp.type ILIKE btrim(p_subcategory))
      AND (nullif(btrim(p_quantity), '') IS NULL
           OR fp.weight_quantity ILIKE btrim(p_quantity))
    ORDER BY fp.start_date DESC NULLS LAST
    LIMIT greatest(coalesce(p_max_rows, 10000), 1)
$$;

REVOKE EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, integer) TO authenticated, service_role;
