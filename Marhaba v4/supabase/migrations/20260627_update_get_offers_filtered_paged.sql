-- ============================================================
-- UPDATE get_offers_filtered_paged TO INCLUDE start_date AND end_date IN JSONB RETURN
-- ============================================================

-- 1. Drop existing function overloads to avoid type definition conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname IN (
      'get_offers_filtered_paged',
      'get_offers_filtered_paged_duplicate'
    )
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;



-- We redefine the function body completely with actual logic
CREATE OR REPLACE FUNCTION public.get_offers_filtered_paged(
    p_country text default null,
    p_cities text[] default null,
    p_categories text[] default null,
    p_subcategories text[] default null,
    p_retailers text[] default null,
    p_brands text[] default null,
    p_pack_sizes text[] default null,
    p_search text default null,
    p_date_from date default null,
    p_date_to date default null,
    p_show_distinct boolean default false,
    p_page integer default 1,
    p_page_size integer default 20
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cats text[];
    v_regs text[];
    v_city_patterns text[];
    v_offset integer := greatest((p_page - 1) * p_page_size, 0);
BEGIN
    -- Fetch user permissions
    SELECT allowed_categories, allowed_regions
    INTO v_cats, v_regs
    FROM public.get_current_user_permissions();

    -- Pre-compile city ILIKE patterns to avoid doing unnest per row
    IF p_cities IS NOT NULL AND cardinality(p_cities) > 0 THEN
        SELECT array_agg('%' || c || '%')
        INTO v_city_patterns
        FROM unnest(p_cities) c;
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT
            fp.product_key_id AS id, fp.product_name, fp.brand, fp.type, fp.weight_quantity,
            fp.regular_price, fp.discounted_price, fp.category,
            fp.image_path, fp.mart_name, fp.offer_timeline, fp.country, fp.flyer_url,
            fp.start_date, fp.end_date,
            coalesce(fp.reg_price_num, public.safe_num(fp.regular_price)) as reg_num,
            coalesce(fp.offer_price_num, public.safe_num(fp.discounted_price)) as offer_num
        FROM public.flyer_products fp
        WHERE 1=1
          -- permissions: allowed regions mapped to country names case-insensitively
          AND (
                v_regs IS NULL OR cardinality(v_regs) = 0
                OR EXISTS (
                    SELECT 1 FROM unnest(v_regs) r
                    WHERE lower(trim(r)) = lower(trim(fp.country))
                       OR (lower(trim(fp.country)) = 'uae' AND lower(trim(r)) IN ('united arab emirates', 'uae'))
                       OR (lower(trim(fp.country)) = 'united arab emirates' AND lower(trim(r)) IN ('united arab emirates', 'uae'))
                )
              )
          -- permissions: allowed categories case-insensitively
          AND (
                v_cats IS NULL OR cardinality(v_cats) = 0 
                OR EXISTS (
                    SELECT 1 FROM unnest(v_cats) c
                    WHERE lower(trim(c)) = lower(trim(fp.category))
                )
              )

          -- user filters
          AND (
                p_country IS NULL OR p_country = '' 
                OR lower(trim(fp.country)) = lower(trim(p_country))
                OR (lower(trim(p_country)) IN ('united arab emirates', 'uae') AND lower(trim(fp.country)) = 'uae')
              )
          AND (p_categories IS NULL OR cardinality(p_categories) = 0 OR fp.category = ANY(p_categories))
          AND (p_subcategories IS NULL OR cardinality(p_subcategories) = 0 OR fp.type = ANY(p_subcategories))
          AND (p_retailers IS NULL OR cardinality(p_retailers) = 0 OR fp.mart_name = ANY(p_retailers))
          AND (p_brands IS NULL OR cardinality(p_brands) = 0 OR fp.brand = ANY(p_brands))
          AND (p_pack_sizes IS NULL OR cardinality(p_pack_sizes) = 0 OR fp.weight_quantity = ANY(p_pack_sizes))
          AND (p_date_from IS NULL OR fp.end_date >= p_date_from)
          AND (p_date_to IS NULL OR fp.start_date <= p_date_to)
          AND (
                p_cities IS NULL OR cardinality(p_cities) = 0
                OR fp.coverage_regions ILIKE ANY (v_city_patterns)
              )
          AND (
                p_search IS NULL OR btrim(p_search) = ''
                OR fp.product_name ILIKE '%' || p_search || '%'
                OR fp.brand ILIKE '%' || p_search || '%'
                OR fp.category ILIKE '%' || p_search || '%'
              )
    ),
    dedup AS (
        SELECT
            b.*,
            row_number() over (
                PARTITION BY coalesce(lower(b.brand), ''),
                             coalesce(lower(b.product_name), ''),
                             coalesce(lower(b.weight_quantity), ''),
                             coalesce(b.offer_num, -1)
                ORDER BY b.start_date DESC NULLS LAST, b.id DESC
            ) as rn
        from base b
    ),
    filtered AS (
        -- Calculate total count before paging limit
        SELECT 
            d.*,
            count(*) over() as full_count
        FROM dedup d
        WHERE (NOT p_show_distinct) OR d.rn = 1
    ),
    paged AS (
        SELECT *
        FROM filtered f
        ORDER BY f.start_date DESC NULLS LAST, f.id DESC
        LIMIT p_page_size OFFSET v_offset
    )
    SELECT jsonb_build_object(
        'id', id,
        'product_name', product_name,
        'brand', brand,
        'type', type,
        'weight_quantity', weight_quantity,
        'regular_price', regular_price,
        'discounted_price', discounted_price,
        'category', category,
        'image_path', image_path,
        'mart_name', mart_name,
        'offer_timeline', offer_timeline,
        'country', country,
        'flyer_url', flyer_url,
        'discount',
            CASE
                WHEN reg_num IS NOT NULL AND reg_num > 0 AND offer_num IS NOT NULL AND offer_num < reg_num
                THEN round(((reg_num - offer_num) / reg_num) * 100)
                ELSE 0
            END,
        'total_count', full_count,
        'start_date', start_date,
        'end_date', end_date
    )
    FROM paged;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_offers_filtered_paged(
    text, text[], text[], text[], text[], text[], text[], text, date, date, boolean, integer, integer
) TO anon, authenticated;
