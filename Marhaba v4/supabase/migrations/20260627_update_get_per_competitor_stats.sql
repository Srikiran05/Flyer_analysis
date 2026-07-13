-- ============================================================
-- UPDATE get_per_competitor_stats TO RETURN avg_regular AND avg_discount
-- ============================================================

-- 1. Drop existing function to avoid type conflicts
DROP FUNCTION IF EXISTS get_per_competitor_stats(text, text[], text, text, text, text, text, boolean);

-- 2. Create updated function with avg_regular and avg_discount columns in the returns table
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
  avg_offer NUMERIC,
  avg_regular NUMERIC,
  avg_discount NUMERIC
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
        ROUND(COALESCE(AVG(fp.offer_price_num), 0::NUMERIC), 2),
        ROUND(COALESCE(AVG(fp.reg_price_num), 0::NUMERIC), 2),
        ROUND(COALESCE(AVG(CASE WHEN fp.reg_price_num > 0 THEN ((fp.reg_price_num - fp.offer_price_num) / fp.reg_price_num) * 100 ELSE 0 END), 0::NUMERIC), 1)
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
        ROUND(COALESCE(AVG(fp.offer_price_num), 0::NUMERIC), 2),
        ROUND(COALESCE(AVG(fp.reg_price_num), 0::NUMERIC), 2),
        ROUND(COALESCE(AVG(CASE WHEN fp.reg_price_num > 0 THEN ((fp.reg_price_num - fp.offer_price_num) / fp.reg_price_num) * 100 ELSE 0 END), 0::NUMERIC), 1)
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

-- 3. Grant execution permissions
GRANT EXECUTE ON FUNCTION get_per_competitor_stats(text, text[], text, text, text, text, text, boolean) TO anon, authenticated;
