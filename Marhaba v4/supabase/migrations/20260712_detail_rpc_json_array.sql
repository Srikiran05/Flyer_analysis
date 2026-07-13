-- ============================================================
-- get_flyer_products_detail: return ONE jsonb array instead of rows
--
-- PostgREST caps every response at its max-rows setting (1000 on
-- Supabase by default), so the previous set-returning version silently
-- truncated results to 1000 rows no matter the internal LIMIT — the
-- root cause of sub-tab counts not matching the Overall Summary.
-- Aggregating into a single jsonb value returns one row, which the cap
-- does not apply to.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_flyer_products_detail(text, text, text, text, text, text, date, integer);

CREATE OR REPLACE FUNCTION public.get_flyer_products_detail(
    p_country text,
    p_region text DEFAULT NULL,
    p_retailer text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_subcategory text DEFAULT NULL,
    p_quantity text DEFAULT NULL,
    p_from_date date DEFAULT NULL,
    p_max_rows integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT coalesce(jsonb_agg(p.product), '[]'::jsonb)
    FROM (
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
        ) AS product
        FROM public.flyer_products fp
        WHERE lower(fp.country) = lower(btrim(p_country))
          AND (p_from_date IS NULL OR fp.start_date >= p_from_date)
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
    ) p
$$;

REVOKE EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, date, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
