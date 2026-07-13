-- ============================================================
-- get_flyer_products_detail: add optional date lower bound
--
-- The detail fetch previously pulled a filter slice's ENTIRE history
-- (newest first, capped at p_max_rows). For categories with more than
-- 10k all-time rows, offers from the older end of the 52-week analysis
-- window were silently cut by the cap, making sub-tab counts lower
-- than the Overall Summary RPC (which counts in the database).
--
-- p_from_date bounds the fetch to the analysis horizon so the cap no
-- longer bites. The old signature is dropped to avoid PostgREST
-- ambiguity between overloads.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_flyer_products_detail(text, text, text, text, text, text, integer);

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
$$;

REVOKE EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_flyer_products_detail(text, text, text, text, text, text, date, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
