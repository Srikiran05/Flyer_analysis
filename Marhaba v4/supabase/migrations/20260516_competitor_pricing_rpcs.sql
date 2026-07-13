-- ============================================================
-- COMPETITOR PRICING ANALYSIS — Missing RPCs
-- ============================================================
-- Creates:
--   1. get_competitor_pricing_aggregations  — brand-level avg pricing
--   2. get_competitor_pack_aggregations     — brand + pack-size pricing
--   3. get_retailer_activity               — retailer breakdown per brand
-- ============================================================

-- Force-drop ALL overloads of the 3 functions before recreating
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname IN (
      'get_competitor_pricing_aggregations',
      'get_competitor_pack_aggregations',
      'get_retailer_activity'
    )
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================
-- 1. get_competitor_pricing_aggregations
-- Returns one row per brand with avg offer/regular/discount/perkg prices
-- ============================================================

CREATE OR REPLACE FUNCTION get_competitor_pricing_aggregations(
  p_country TEXT,
  p_region TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_brands TEXT[] DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_distinct_offers BOOLEAN DEFAULT FALSE,
  p_period_weeks INT DEFAULT 52
)
RETURNS TABLE(
  brand_name TEXT,
  offer_count BIGINT,
  offer_avg NUMERIC,
  reg_avg NUMERIC,
  discount_avg NUMERIC,
  perkg_avg NUMERIC
) AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - (p_period_weeks * 7);
BEGIN
  IF p_distinct_offers THEN
    RETURN QUERY
    WITH distinct_products AS (
      SELECT DISTINCT ON (fp.brand, fp.product_name, fp.weight_quantity)
        fp.brand,
        fp.offer_price_num::NUMERIC AS offer_price,
        fp.reg_price_num::NUMERIC AS reg_price,
        fp.weight_kg_num::NUMERIC AS weight_kg
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= cutoff_date
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
        AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
      ORDER BY fp.brand, fp.product_name, fp.weight_quantity, fp.start_date DESC
    )
    SELECT
      dp.brand::TEXT AS brand_name,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(AVG(dp.offer_price), 0::NUMERIC), 2) AS offer_avg,
      ROUND(COALESCE(AVG(dp.reg_price), 0::NUMERIC), 2) AS reg_avg,
      ROUND(COALESCE(AVG(
        CASE WHEN dp.reg_price > 0 
          THEN ((dp.reg_price - dp.offer_price) / dp.reg_price) * 100 
          ELSE 0 END
      ), 0), 1) AS discount_avg,
      ROUND(COALESCE(AVG(
        CASE WHEN dp.weight_kg > 0 
          THEN dp.offer_price / dp.weight_kg 
          ELSE 0 END
      ), 0), 2) AS perkg_avg
    FROM distinct_products dp
    GROUP BY dp.brand
    ORDER BY offer_count DESC;
  ELSE
    RETURN QUERY
    SELECT
      fp.brand::TEXT AS brand_name,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(AVG(fp.offer_price_num::NUMERIC), 0::NUMERIC), 2) AS offer_avg,
      ROUND(COALESCE(AVG(fp.reg_price_num::NUMERIC), 0::NUMERIC), 2) AS reg_avg,
      ROUND(COALESCE(AVG(
        CASE WHEN fp.reg_price_num > 0 
          THEN ((fp.reg_price_num::NUMERIC - fp.offer_price_num::NUMERIC) / fp.reg_price_num::NUMERIC) * 100 
          ELSE 0 END
      ), 0), 1) AS discount_avg,
      ROUND(COALESCE(AVG(
        CASE WHEN fp.weight_kg_num > 0 
          THEN fp.offer_price_num::NUMERIC / fp.weight_kg_num::NUMERIC 
          ELSE 0 END
      ), 0), 2) AS perkg_avg
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.start_date >= cutoff_date
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (p_category IS NULL OR fp.category = p_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
      AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
    GROUP BY fp.brand
    ORDER BY offer_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 2. get_competitor_pack_aggregations
-- Returns one row per brand + pack size with offer count, min/max prices
-- ============================================================

CREATE OR REPLACE FUNCTION get_competitor_pack_aggregations(
  p_country TEXT,
  p_region TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_brands TEXT[] DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_distinct_offers BOOLEAN DEFAULT FALSE,
  p_period_weeks INT DEFAULT 52
)
RETURNS TABLE(
  brand_name TEXT,
  weight_qty TEXT,
  offer_count BIGINT,
  min_price NUMERIC,
  max_price NUMERIC
) AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - (p_period_weeks * 7);
BEGIN
  IF p_distinct_offers THEN
    RETURN QUERY
    WITH distinct_products AS (
      SELECT DISTINCT ON (fp.brand, fp.product_name, fp.weight_quantity)
        fp.brand,
        fp.weight_quantity,
        fp.offer_price_num::NUMERIC AS offer_price
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= cutoff_date
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (p_category IS NULL OR fp.category = p_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
        AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
      ORDER BY fp.brand, fp.product_name, fp.weight_quantity, fp.start_date DESC
    )
    SELECT
      dp.brand::TEXT AS brand_name,
      COALESCE(dp.weight_quantity, 'N/A')::TEXT AS weight_qty,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(MIN(dp.offer_price), 0::NUMERIC), 2) AS min_price,
      ROUND(COALESCE(MAX(dp.offer_price), 0::NUMERIC), 2) AS max_price
    FROM distinct_products dp
    GROUP BY dp.brand, dp.weight_quantity
    ORDER BY dp.brand, offer_count DESC;
  ELSE
    RETURN QUERY
    SELECT
      fp.brand::TEXT AS brand_name,
      COALESCE(fp.weight_quantity, 'N/A')::TEXT AS weight_qty,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(MIN(fp.offer_price_num::NUMERIC), 0::NUMERIC), 2) AS min_price,
      ROUND(COALESCE(MAX(fp.offer_price_num::NUMERIC), 0::NUMERIC), 2) AS max_price
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.start_date >= cutoff_date
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (p_category IS NULL OR fp.category = p_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
      AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
    GROUP BY fp.brand, fp.weight_quantity
    ORDER BY fp.brand, offer_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 3. get_retailer_activity
-- Returns retailer breakdown for a specific brand
-- ============================================================

CREATE OR REPLACE FUNCTION get_retailer_activity(
  target_brand TEXT,
  selected_country TEXT,
  p_regions TEXT[] DEFAULT '{}',
  p_categories TEXT[] DEFAULT '{}',
  p_subcategories TEXT[] DEFAULT '{}',
  p_pack_sizes TEXT[] DEFAULT '{}',
  p_distinct_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  retailer TEXT,
  offer_count BIGINT,
  avg_offer_price NUMERIC,
  avg_regular_price NUMERIC,
  avg_discount NUMERIC,
  latest_date DATE
) AS $$
BEGIN
  IF p_distinct_only THEN
    RETURN QUERY
    WITH distinct_products AS (
      SELECT DISTINCT ON (fp.mart_name, fp.product_name, fp.weight_quantity)
        fp.mart_name,
        fp.offer_price_num::NUMERIC AS offer_price,
        fp.reg_price_num::NUMERIC AS reg_price,
        fp.start_date
      FROM flyer_products fp
      WHERE fp.brand = target_brand
        AND lower(fp.country) = lower(selected_country)
        AND (array_length(p_regions, 1) IS NULL OR array_length(p_regions, 1) = 0 
             OR EXISTS (SELECT 1 FROM unnest(p_regions) r WHERE fp.coverage_regions ILIKE '%' || r || '%'))
        AND (array_length(p_categories, 1) IS NULL OR array_length(p_categories, 1) = 0 
             OR fp.category = ANY(p_categories))
        AND (array_length(p_subcategories, 1) IS NULL OR array_length(p_subcategories, 1) = 0 
             OR fp.type = ANY(p_subcategories))
        AND (array_length(p_pack_sizes, 1) IS NULL OR array_length(p_pack_sizes, 1) = 0 
             OR fp.weight_quantity = ANY(p_pack_sizes))
      ORDER BY fp.mart_name, fp.product_name, fp.weight_quantity, fp.start_date DESC
    )
    SELECT
      dp.mart_name::TEXT AS retailer,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(AVG(dp.offer_price), 0::NUMERIC), 2) AS avg_offer_price,
      ROUND(COALESCE(AVG(dp.reg_price), 0::NUMERIC), 2) AS avg_regular_price,
      ROUND(COALESCE(AVG(
        CASE WHEN dp.reg_price > 0
          THEN ((dp.reg_price - dp.offer_price) / dp.reg_price) * 100
          ELSE 0 END
      ), 0), 1) AS avg_discount,
      MAX(dp.start_date) AS latest_date
    FROM distinct_products dp
    WHERE dp.mart_name IS NOT NULL
    GROUP BY dp.mart_name
    ORDER BY offer_count DESC;
  ELSE
    RETURN QUERY
    SELECT
      fp.mart_name::TEXT AS retailer,
      COUNT(*)::BIGINT AS offer_count,
      ROUND(COALESCE(AVG(fp.offer_price_num::NUMERIC), 0::NUMERIC), 2) AS avg_offer_price,
      ROUND(COALESCE(AVG(fp.reg_price_num::NUMERIC), 0::NUMERIC), 2) AS avg_regular_price,
      ROUND(COALESCE(AVG(
        CASE WHEN fp.reg_price_num > 0
          THEN ((fp.reg_price_num::NUMERIC - fp.offer_price_num::NUMERIC) / fp.reg_price_num::NUMERIC) * 100
          ELSE 0 END
      ), 0), 1) AS avg_discount,
      MAX(fp.start_date) AS latest_date
    FROM flyer_products fp
    WHERE fp.brand = target_brand
      AND lower(fp.country) = lower(selected_country)
      AND fp.mart_name IS NOT NULL
      AND (array_length(p_regions, 1) IS NULL OR array_length(p_regions, 1) = 0 
           OR EXISTS (SELECT 1 FROM unnest(p_regions) r WHERE fp.coverage_regions ILIKE '%' || r || '%'))
      AND (array_length(p_categories, 1) IS NULL OR array_length(p_categories, 1) = 0 
           OR fp.category = ANY(p_categories))
      AND (array_length(p_subcategories, 1) IS NULL OR array_length(p_subcategories, 1) = 0 
           OR fp.type = ANY(p_subcategories))
      AND (array_length(p_pack_sizes, 1) IS NULL OR array_length(p_pack_sizes, 1) = 0 
           OR fp.weight_quantity = ANY(p_pack_sizes))
    GROUP BY fp.mart_name
    ORDER BY offer_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION get_competitor_pricing_aggregations(text,text,text,text,text,text[],text,boolean,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_competitor_pack_aggregations(text,text,text,text,text,text[],text,boolean,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_retailer_activity(text,text,text[],text[],text[],text[],boolean) TO anon, authenticated;
