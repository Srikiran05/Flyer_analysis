-- ============================================================
-- Brand Summary min/max must follow the selected metric
-- (Offer Price / Regular Price / Discount % / Price per Kg).
-- The RPC previously returned only the offer-price min/max, so the
-- table showed the same numbers whatever the toggle was set to.
-- ============================================================

DROP FUNCTION IF EXISTS get_competitor_pack_aggregations(text,text,text,text,text,text[],text,boolean,integer);

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
  max_price NUMERIC,
  min_regular NUMERIC,
  max_regular NUMERIC,
  min_discount NUMERIC,
  max_discount NUMERIC,
  min_perkg NUMERIC,
  max_perkg NUMERIC
) AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - (p_period_weeks * 7);
  v_category TEXT := CASE WHEN p_category IS NOT NULL AND btrim(p_category) <> '' THEN lower(btrim(p_category)) ELSE NULL END;
BEGIN
  IF p_distinct_offers THEN
    RETURN QUERY
    WITH distinct_products AS (
      SELECT DISTINCT ON (fp.brand, fp.product_name, fp.weight_quantity)
        fp.brand,
        fp.weight_quantity,
        fp.offer_price_num::NUMERIC AS offer_price,
        fp.reg_price_num::NUMERIC   AS reg_price,
        fp.weight_kg_num::NUMERIC   AS weight_kg
      FROM flyer_products fp
      WHERE lower(fp.country) = lower(p_country)
        AND fp.start_date >= cutoff_date
        AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
        AND (v_category IS NULL OR fp.category = v_category)
        AND (p_subcategory IS NULL OR fp.type = p_subcategory)
        AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
        AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
        AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
      ORDER BY fp.brand, fp.product_name, fp.weight_quantity, fp.start_date DESC
    )
    SELECT
      dp.brand::TEXT,
      COALESCE(dp.weight_quantity, 'N/A')::TEXT,
      COUNT(*)::BIGINT,
      ROUND(COALESCE(MIN(NULLIF(GREATEST(dp.offer_price, 0), 0)), 0), 2),
      ROUND(COALESCE(MAX(NULLIF(GREATEST(dp.offer_price, 0), 0)), 0), 2),
      ROUND(COALESCE(MIN(NULLIF(GREATEST(dp.reg_price, 0), 0)), 0), 2),
      ROUND(COALESCE(MAX(NULLIF(GREATEST(dp.reg_price, 0), 0)), 0), 2),
      ROUND(COALESCE(MIN(CASE WHEN dp.reg_price > dp.offer_price AND dp.offer_price > 0
                              THEN ((dp.reg_price - dp.offer_price) / dp.reg_price) * 100 END), 0), 1),
      ROUND(COALESCE(MAX(CASE WHEN dp.reg_price > dp.offer_price AND dp.offer_price > 0
                              THEN ((dp.reg_price - dp.offer_price) / dp.reg_price) * 100 END), 0), 1),
      ROUND(COALESCE(MIN(CASE WHEN dp.weight_kg > 0 AND dp.offer_price > 0
                              THEN dp.offer_price / dp.weight_kg END), 0), 2),
      ROUND(COALESCE(MAX(CASE WHEN dp.weight_kg > 0 AND dp.offer_price > 0
                              THEN dp.offer_price / dp.weight_kg END), 0), 2)
    FROM distinct_products dp
    GROUP BY dp.brand, dp.weight_quantity
    ORDER BY dp.brand, 3 DESC;
  ELSE
    RETURN QUERY
    SELECT
      fp.brand::TEXT,
      COALESCE(fp.weight_quantity, 'N/A')::TEXT,
      COUNT(*)::BIGINT,
      ROUND(COALESCE(MIN(NULLIF(GREATEST(fp.offer_price_num::NUMERIC, 0), 0)), 0), 2),
      ROUND(COALESCE(MAX(NULLIF(GREATEST(fp.offer_price_num::NUMERIC, 0), 0)), 0), 2),
      ROUND(COALESCE(MIN(NULLIF(GREATEST(fp.reg_price_num::NUMERIC, 0), 0)), 0), 2),
      ROUND(COALESCE(MAX(NULLIF(GREATEST(fp.reg_price_num::NUMERIC, 0), 0)), 0), 2),
      ROUND(COALESCE(MIN(CASE WHEN fp.reg_price_num::NUMERIC > fp.offer_price_num::NUMERIC AND fp.offer_price_num::NUMERIC > 0
                              THEN ((fp.reg_price_num::NUMERIC - fp.offer_price_num::NUMERIC) / fp.reg_price_num::NUMERIC) * 100 END), 0), 1),
      ROUND(COALESCE(MAX(CASE WHEN fp.reg_price_num::NUMERIC > fp.offer_price_num::NUMERIC AND fp.offer_price_num::NUMERIC > 0
                              THEN ((fp.reg_price_num::NUMERIC - fp.offer_price_num::NUMERIC) / fp.reg_price_num::NUMERIC) * 100 END), 0), 1),
      ROUND(COALESCE(MIN(CASE WHEN fp.weight_kg_num::NUMERIC > 0 AND fp.offer_price_num::NUMERIC > 0
                              THEN fp.offer_price_num::NUMERIC / fp.weight_kg_num::NUMERIC END), 0), 2),
      ROUND(COALESCE(MAX(CASE WHEN fp.weight_kg_num::NUMERIC > 0 AND fp.offer_price_num::NUMERIC > 0
                              THEN fp.offer_price_num::NUMERIC / fp.weight_kg_num::NUMERIC END), 0), 2)
    FROM flyer_products fp
    WHERE lower(fp.country) = lower(p_country)
      AND fp.start_date >= cutoff_date
      AND (p_region IS NULL OR fp.coverage_regions ILIKE '%' || p_region || '%')
      AND (v_category IS NULL OR fp.category = v_category)
      AND (p_subcategory IS NULL OR fp.type = p_subcategory)
      AND (p_retailer IS NULL OR fp.mart_name = p_retailer)
      AND (p_quantity IS NULL OR fp.weight_quantity = p_quantity)
      AND (p_brands IS NULL OR fp.brand = ANY(p_brands))
    GROUP BY fp.brand, fp.weight_quantity
    ORDER BY fp.brand, 3 DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_competitor_pack_aggregations(text,text,text,text,text,text[],text,boolean,integer) TO anon, authenticated;
