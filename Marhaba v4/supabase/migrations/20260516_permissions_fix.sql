-- ============================================================
-- GRANT PERMISSIONS on the new materialized view and RPCs
-- Without these, the Supabase anon/authenticated roles can't access them
-- ============================================================

-- 1. Grant SELECT on the materialized view
GRANT SELECT ON mv_promo_dimensions TO anon, authenticated;

-- 2. Grant EXECUTE on all the new/recreated RPCs
GRANT EXECUTE ON FUNCTION get_promo_brands_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promo_subcategories_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promo_pack_sizes_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promotion_analysis_stats_multi(text, text, text[], text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_market_totals(text, text, text, text, text, text, boolean) TO anon, authenticated;
