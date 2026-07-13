-- ============================================================
-- PROMO ANALYSIS REWRITE — Materialized View & RPCs
-- ============================================================
-- This migration creates:
--   1. mv_promo_dimensions   — fast filter loading (category-scoped brands, subcategories, packs)
--   2. get_promo_brands_by_category — brands within a category
--   3. get_promo_subcategories_by_category — subcategories within a category  
--   4. get_promo_pack_sizes_by_category — pack sizes within a category
--   5. get_promotion_analysis_stats_multi — main analysis RPC (rewritten)
--   6. get_market_totals — market totals RPC (rewritten)
-- ============================================================

-- ============================================================
-- 1. MATERIALIZED VIEW: mv_promo_dimensions
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS mv_promo_dimensions CASCADE;

CREATE MATERIALIZED VIEW mv_promo_dimensions AS

-- Categories (country-level, no parent)
SELECT
  lower(country::text) AS country_key,
  'category'::text     AS dimension_type,
  category             AS dimension_value,
  NULL::text           AS parent_category
FROM flyer_products
WHERE country IS NOT NULL AND category IS NOT NULL
GROUP BY lower(country::text), category

UNION ALL

-- Brands scoped to category
SELECT
  lower(country::text) AS country_key,
  'brand'::text        AS dimension_type,
  brand                AS dimension_value,
  category             AS parent_category
FROM flyer_products
WHERE country IS NOT NULL AND brand IS NOT NULL AND category IS NOT NULL
GROUP BY lower(country::text), brand, category

UNION ALL

-- Subcategories (type) scoped to category
SELECT
  lower(country::text) AS country_key,
  'subcategory'::text  AS dimension_type,
  type                 AS dimension_value,
  category             AS parent_category
FROM flyer_products
WHERE country IS NOT NULL AND type IS NOT NULL AND category IS NOT NULL
GROUP BY lower(country::text), type, category

UNION ALL

-- Regions (country-level, not category-scoped)
SELECT DISTINCT
  lower(fp.country::text) AS country_key,
  'region'::text          AS dimension_type,
  trim(r.region)          AS dimension_value,
  NULL::text              AS parent_category
FROM flyer_products fp,
     LATERAL unnest(string_to_array(fp.coverage_regions, ',')) AS r(region)
WHERE fp.country IS NOT NULL
  AND fp.coverage_regions IS NOT NULL
  AND trim(r.region) != ''

UNION ALL

-- Retailers (country-level)
SELECT
  lower(country::text) AS country_key,
  'retailer'::text     AS dimension_type,
  mart_name            AS dimension_value,
  NULL::text           AS parent_category
FROM flyer_products
WHERE country IS NOT NULL AND mart_name IS NOT NULL
GROUP BY lower(country::text), mart_name

UNION ALL

-- Pack sizes scoped to category
SELECT
  lower(country::text)  AS country_key,
  'pack_size'::text     AS dimension_type,
  weight_quantity       AS dimension_value,
  category              AS parent_category
FROM flyer_products
WHERE country IS NOT NULL AND weight_quantity IS NOT NULL AND category IS NOT NULL
GROUP BY lower(country::text), weight_quantity, category;

-- Indexes for fast lookups
CREATE INDEX idx_mv_promo_dims_country
  ON mv_promo_dimensions (country_key);

CREATE INDEX idx_mv_promo_dims_country_type
  ON mv_promo_dimensions (country_key, dimension_type);

CREATE INDEX idx_mv_promo_dims_country_type_parent
  ON mv_promo_dimensions (country_key, dimension_type, parent_category);

CREATE INDEX idx_mv_promo_dims_country_type_value
  ON mv_promo_dimensions (country_key, dimension_type, dimension_value);


-- ============================================================
-- 2. RPC: get_promo_brands_by_category
-- ============================================================
CREATE OR REPLACE FUNCTION get_promo_brands_by_category(
  p_country TEXT,
  p_category TEXT
)
RETURNS TABLE(brand_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT dimension_value
  FROM mv_promo_dimensions
  WHERE country_key = lower(p_country)
    AND dimension_type = 'brand'
    AND parent_category = p_category
  ORDER BY dimension_value;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 3. RPC: get_promo_subcategories_by_category
-- ============================================================
CREATE OR REPLACE FUNCTION get_promo_subcategories_by_category(
  p_country TEXT,
  p_category TEXT
)
RETURNS TABLE(subcategory_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT dimension_value
  FROM mv_promo_dimensions
  WHERE country_key = lower(p_country)
    AND dimension_type = 'subcategory'
    AND parent_category = p_category
  ORDER BY dimension_value;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 4. RPC: get_promo_pack_sizes_by_category
-- ============================================================
CREATE OR REPLACE FUNCTION get_promo_pack_sizes_by_category(
  p_country TEXT,
  p_category TEXT
)
RETURNS TABLE(pack_size TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT dimension_value
  FROM mv_promo_dimensions
  WHERE country_key = lower(p_country)
    AND dimension_type = 'pack_size'
    AND parent_category = p_category
  ORDER BY dimension_value;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 4b. RPC: get_per_competitor_stats (Per-brand breakdown)
-- ============================================================
DROP FUNCTION IF EXISTS get_per_competitor_stats(text, text[], text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION get_per_competitor_stats(
  p_country TEXT,
  p_brands TEXT[],
  p_region TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_distinct_offers BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  brand_name TEXT,
  period_key TEXT,
  offer_count BIGINT,
  category_total BIGINT,
  share_pct NUMERIC,
  avg_offer NUMERIC
) AS $$
DECLARE
  today DATE := CURRENT_DATE;
  pkeys TEXT[] := ARRAY['latest4Weeks','latest12Weeks','ytd','latest52Weeks'];
  pfroms DATE[] := ARRAY[today - 27, today - 84, date_trunc('year', today)::date, today - 364];
  i INT;
  cat_total BIGINT;
BEGIN
  FOR i IN 1..4 LOOP
    IF p_distinct_offers THEN
      SELECT COUNT(DISTINCT fp.product_name) INTO cat_total
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= pfroms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    ELSE
      SELECT COUNT(*) INTO cat_total
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= pfroms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    END IF;

    IF p_distinct_offers THEN
      RETURN QUERY
      SELECT fp.brand, pkeys[i],
        COUNT(DISTINCT fp.product_name)::bigint, cat_total,
        CASE WHEN cat_total > 0 THEN ROUND((COUNT(DISTINCT fp.product_name)::numeric / cat_total) * 100, 1) ELSE 0 END,
        ROUND(COALESCE(AVG(fp.offer_price_num), 0::NUMERIC), 2)
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand = ANY(p_brands)
        AND fp.start_date >= pfroms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
      GROUP BY fp.brand;
    ELSE
      RETURN QUERY
      SELECT fp.brand, pkeys[i],
        COUNT(*)::bigint, cat_total,
        CASE WHEN cat_total > 0 THEN ROUND((COUNT(*)::numeric / cat_total) * 100, 1) ELSE 0 END,
        ROUND(COALESCE(AVG(fp.offer_price_num), 0::NUMERIC), 2)
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand = ANY(p_brands)
        AND fp.start_date >= pfroms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
      GROUP BY fp.brand;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 5. RPC: get_promotion_analysis_stats_multi (Rewritten)
-- ============================================================
DROP FUNCTION IF EXISTS get_promotion_analysis_stats_multi(text,text,text[],text,text,text,text,text,boolean);

CREATE OR REPLACE FUNCTION get_promotion_analysis_stats_multi(
  p_country TEXT,
  p_my_brand TEXT,
  p_competitors TEXT[] DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_distinct_offers BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  period_keys TEXT[] := ARRAY['latest4Weeks','latest12Weeks','ytd','latest52Weeks'];
  period_froms DATE[];
  today DATE := CURRENT_DATE;
  i INT;
  my_count BIGINT;
  comp_count BIGINT;
  total_ct BIGINT;
  avg_offer_my NUMERIC; avg_offer_comp NUMERIC;
  avg_reg_my NUMERIC; avg_reg_comp NUMERIC;
  avg_disc_my NUMERIC; avg_disc_comp NUMERIC;
  avg_pkg_my NUMERIC; avg_pkg_comp NUMERIC;
  use_specific_competitors BOOLEAN;
  period_result JSONB;
BEGIN
  -- Define period boundaries (no upper bound — data may have future start_dates)
  period_froms := ARRAY[
    today - 27,
    today - 84,
    date_trunc('year', today)::date,
    today - 364
  ];

  use_specific_competitors := (p_competitors IS NOT NULL AND array_length(p_competitors, 1) > 0);

  FOR i IN 1..4 LOOP

    -- ---- MY BRAND COUNT ----
    IF p_distinct_offers THEN
      SELECT COUNT(DISTINCT product_name) INTO my_count
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand = p_my_brand
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    ELSE
      SELECT COUNT(*) INTO my_count
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand = p_my_brand
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    END IF;

    -- ---- COMPETITOR COUNT ----
    IF use_specific_competitors THEN
      IF p_distinct_offers THEN
        SELECT COUNT(DISTINCT product_name) INTO comp_count
        FROM flyer_products fp
        WHERE lower(fp.country) = lower(p_country)
          AND fp.brand = ANY(p_competitors)
          AND fp.start_date >= period_froms[i]
          AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
          AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
          AND (p_category IS NULL OR fp.category = p_category)
          AND (p_subcategory IS NULL OR fp.type = p_subcategory)
          AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
      ELSE
        SELECT COUNT(*) INTO comp_count
        FROM flyer_products fp
        WHERE lower(fp.country) = lower(p_country)
          AND fp.brand = ANY(p_competitors)
          AND fp.start_date >= period_froms[i]
          AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
          AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
          AND (p_category IS NULL OR fp.category = p_category)
          AND (p_subcategory IS NULL OR fp.type = p_subcategory)
          AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
      END IF;
    ELSE
      IF p_distinct_offers THEN
        SELECT COUNT(DISTINCT product_name) INTO comp_count
        FROM flyer_products fp
        WHERE lower(fp.country) = lower(p_country)
          AND fp.brand != p_my_brand
          AND fp.start_date >= period_froms[i]
          AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
          AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
          AND (p_category IS NULL OR fp.category = p_category)
          AND (p_subcategory IS NULL OR fp.type = p_subcategory)
          AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
      ELSE
        SELECT COUNT(*) INTO comp_count
        FROM flyer_products fp
        WHERE lower(fp.country) = lower(p_country)
          AND fp.brand != p_my_brand
          AND fp.start_date >= period_froms[i]
          AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
          AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
          AND (p_category IS NULL OR fp.category = p_category)
          AND (p_subcategory IS NULL OR fp.type = p_subcategory)
          AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
      END IF;
    END IF;

    -- ---- TOTAL MARKET COUNT (all brands in the category/filters) ----
    IF p_distinct_offers THEN
      SELECT COUNT(DISTINCT product_name) INTO total_ct
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    ELSE
      SELECT COUNT(*) INTO total_ct
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    END IF;

    -- ---- AVG PRICES: MY BRAND ----
    SELECT
      COALESCE(AVG(fp.offer_price_num), 0::NUMERIC),
      COALESCE(AVG(fp.reg_price_num), 0::NUMERIC),
      COALESCE(AVG(CASE WHEN fp.reg_price_num > 0 THEN ((fp.reg_price_num - fp.offer_price_num) / fp.reg_price_num) * 100 ELSE 0 END), 0::NUMERIC),
      COALESCE(AVG(CASE WHEN fp.weight_kg_num > 0 THEN fp.offer_price_num / fp.weight_kg_num ELSE 0 END), 0::NUMERIC)
    INTO avg_offer_my, avg_reg_my, avg_disc_my, avg_pkg_my
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.brand = p_my_brand
      AND fp.start_date >= period_froms[i]
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_category IS NULL OR fp.category = p_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);

    -- ---- AVG PRICES: COMPETITORS ----
    IF use_specific_competitors THEN
      SELECT
        COALESCE(AVG(fp.offer_price_num), 0::NUMERIC),
        COALESCE(AVG(fp.reg_price_num), 0::NUMERIC),
        COALESCE(AVG(CASE WHEN fp.reg_price_num > 0 THEN ((fp.reg_price_num - fp.offer_price_num) / fp.reg_price_num) * 100 ELSE 0 END), 0::NUMERIC),
        COALESCE(AVG(CASE WHEN fp.weight_kg_num > 0 THEN fp.offer_price_num / fp.weight_kg_num ELSE 0 END), 0::NUMERIC)
      INTO avg_offer_comp, avg_reg_comp, avg_disc_comp, avg_pkg_comp
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand = ANY(p_competitors)
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    ELSE
      SELECT
        COALESCE(AVG(fp.offer_price_num), 0::NUMERIC),
        COALESCE(AVG(fp.reg_price_num), 0::NUMERIC),
        COALESCE(AVG(CASE WHEN fp.reg_price_num > 0 THEN ((fp.reg_price_num - fp.offer_price_num) / fp.reg_price_num) * 100 ELSE 0 END), 0::NUMERIC),
        COALESCE(AVG(CASE WHEN fp.weight_kg_num > 0 THEN fp.offer_price_num / fp.weight_kg_num ELSE 0 END), 0::NUMERIC)
      INTO avg_offer_comp, avg_reg_comp, avg_disc_comp, avg_pkg_comp
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.brand != p_my_brand
        AND fp.start_date >= period_froms[i]
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
    END IF;

    period_result := jsonb_build_object(
      'myBrandCount', my_count,
      'competitorCount', comp_count,
      'totalCount', total_ct,
      'myBrandShare', CASE WHEN total_ct > 0 THEN ROUND((my_count::numeric / total_ct) * 100, 1) ELSE 0 END,
      'competitorShare', CASE WHEN total_ct > 0 THEN ROUND((comp_count::numeric / total_ct) * 100, 1) ELSE 0 END,
      'avgOfferPrice', jsonb_build_object('myBrand', ROUND(avg_offer_my, 2), 'competitor', ROUND(avg_offer_comp, 2)),
      'avgRegularPrice', jsonb_build_object('myBrand', ROUND(avg_reg_my, 2), 'competitor', ROUND(avg_reg_comp, 2)),
      'avgDiscount', jsonb_build_object('myBrand', ROUND(avg_disc_my, 1), 'competitor', ROUND(avg_disc_comp, 1)),
      'avgPricePerKg', jsonb_build_object('myBrand', ROUND(avg_pkg_my, 2), 'competitor', ROUND(avg_pkg_comp, 2))
    );

    result := result || jsonb_build_object(period_keys[i], period_result);
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 6. RPC: get_market_totals (Rewritten)
-- ============================================================
DROP FUNCTION IF EXISTS get_market_totals(text,text,text,text,text,text,boolean);

CREATE OR REPLACE FUNCTION get_market_totals(
  p_country TEXT,
  p_region TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_distinct_offers BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  total_4w BIGINT,
  total_12w BIGINT,
  total_ytd BIGINT,
  total_52w BIGINT
) AS $$
DECLARE
  today DATE := CURRENT_DATE;
BEGIN
  IF p_distinct_offers THEN
    RETURN QUERY
    SELECT
      COUNT(DISTINCT CASE WHEN fp.start_date >= today - 27  THEN fp.product_name END)::bigint,
      COUNT(DISTINCT CASE WHEN fp.start_date >= today - 84  THEN fp.product_name END)::bigint,
      COUNT(DISTINCT CASE WHEN fp.start_date >= date_trunc('year', today)::date THEN fp.product_name END)::bigint,
      COUNT(DISTINCT CASE WHEN fp.start_date >= today - 364 THEN fp.product_name END)::bigint
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.start_date >= today - 364
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_category IS NULL OR fp.category = p_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
  ELSE
    RETURN QUERY
    SELECT
      COUNT(CASE WHEN fp.start_date >= today - 27  THEN 1 END)::bigint,
      COUNT(CASE WHEN fp.start_date >= today - 84  THEN 1 END)::bigint,
      COUNT(CASE WHEN fp.start_date >= date_trunc('year', today)::date THEN 1 END)::bigint,
      COUNT(CASE WHEN fp.start_date >= today - 364 THEN 1 END)::bigint
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.start_date >= today - 364
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_category IS NULL OR fp.category = p_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- REFRESH the materialized view
-- ============================================================
REFRESH MATERIALIZED VIEW mv_promo_dimensions;


-- ============================================================
-- GRANT PERMISSIONS to anon/authenticated roles
-- ============================================================
GRANT SELECT ON mv_promo_dimensions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promo_brands_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promo_subcategories_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promo_pack_sizes_by_category(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_promotion_analysis_stats_multi(text, text, text[], text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_per_competitor_stats(text, text[], text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_market_totals(text, text, text, text, text, text, boolean) TO anon, authenticated;
