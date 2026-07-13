-- ============================================================
-- PERFORMANCE: indexes for flyer_products
--
-- Every analytics RPC and client query filters this table by some
-- combination of country, category, brand, mart_name, type,
-- weight_quantity, dates, and ILIKE patterns on coverage_regions /
-- product_name. Without indexes each query is a sequential scan,
-- which stops working somewhere between 1M and 10M rows (Supabase's
-- API statement timeout will start killing queries).
--
-- All statements are idempotent (IF NOT EXISTS), so this is safe to
-- run even if some indexes already exist under other names.
-- ============================================================

-- Trigram support: the only index type that accelerates
-- ILIKE 'value' and ILIKE '%substring%' predicates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- 1. B-tree indexes for equality / range predicates
-- ------------------------------------------------------------

-- Competitor pricing RPCs filter: lower(country) = ... AND start_date >= cutoff
CREATE INDEX IF NOT EXISTS idx_fp_lower_country_start_date
    ON public.flyer_products (lower(country), start_date DESC);

-- get_offers_filtered_paged filters: lower(trim(country)) = ...
CREATE INDEX IF NOT EXISTS idx_fp_lower_trim_country
    ON public.flyer_products (lower(btrim(country)));

-- Client-side .eq() filters and RPC = ANY(...) filters
CREATE INDEX IF NOT EXISTS idx_fp_country          ON public.flyer_products (country);
CREATE INDEX IF NOT EXISTS idx_fp_category         ON public.flyer_products (category);
CREATE INDEX IF NOT EXISTS idx_fp_brand            ON public.flyer_products (brand);
CREATE INDEX IF NOT EXISTS idx_fp_mart_name        ON public.flyer_products (mart_name);
CREATE INDEX IF NOT EXISTS idx_fp_type             ON public.flyer_products (type);
CREATE INDEX IF NOT EXISTS idx_fp_weight_quantity  ON public.flyer_products (weight_quantity);

-- Date-range filters (offers active between p_date_from / p_date_to)
CREATE INDEX IF NOT EXISTS idx_fp_start_date       ON public.flyer_products (start_date DESC);
CREATE INDEX IF NOT EXISTS idx_fp_end_date         ON public.flyer_products (end_date);

-- ------------------------------------------------------------
-- 2. Trigram GIN indexes for ILIKE predicates
--    (region filtering and the Offer Bank text search)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fp_trgm_coverage_regions
    ON public.flyer_products USING gin (coverage_regions gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_product_name
    ON public.flyer_products USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_brand
    ON public.flyer_products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_category
    ON public.flyer_products USING gin (category gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_mart_name
    ON public.flyer_products USING gin (mart_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_type
    ON public.flyer_products USING gin (type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fp_trgm_weight_quantity
    ON public.flyer_products USING gin (weight_quantity gin_trgm_ops);

-- Refresh planner statistics so the new indexes are used immediately.
ANALYZE public.flyer_products;
