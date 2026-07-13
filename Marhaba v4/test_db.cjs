require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  // 1. Test ilike category query (simulating fetchRawDataForSubTabs)
  console.log("--- Test 1: ilike category query ---");
  const { data: d1, error: e1 } = await supabase
    .from("flyer_products")
    .select("id, brand, category")
    .eq("country", "saudi arabia")
    .ilike("category", "Frozen Fries")
    .limit(5);
  console.log("ilike 'Frozen Fries' count:", d1?.length, "error:", e1?.message || "none");
  if (d1?.length) console.log("Sample:", d1[0]);

  // 2. Test RPC get_promotion_analysis_stats_multi
  console.log("\n--- Test 2: RPC get_promotion_analysis_stats_multi ---");
  const { data: d2, error: e2 } = await supabase.rpc("get_promotion_analysis_stats_multi", {
    p_country: "saudi arabia",
    p_my_brand: "LambWeston",
    p_competitors: null,
    p_region: null,
    p_retailer: null,
    p_category: "Frozen Fries",
    p_subcategory: null,
    p_quantity: null,
    p_distinct_offers: false
  });
  console.log("RPC result type:", typeof d2);
  if (d2) {
    console.log("ytd myBrandCount:", d2?.ytd?.myBrandCount);
    console.log("latest52Weeks myBrandCount:", d2?.latest52Weeks?.myBrandCount);
  }
  if (e2) console.log("RPC error:", e2);

  // 3. Test RPC get_per_competitor_stats
  console.log("\n--- Test 3: RPC get_per_competitor_stats ---");
  const { data: d3, error: e3 } = await supabase.rpc("get_per_competitor_stats", {
    p_country: "saudi arabia",
    p_brands: ["LambWeston"],
    p_region: null,
    p_retailer: null,
    p_category: "Frozen Fries",
    p_subcategory: null,
    p_quantity: null,
    p_distinct_offers: false
  });
  console.log("Per-competitor rows:", d3?.length, "error:", e3?.message || "none");
  if (d3?.length) console.log("First row:", d3[0]);

  // 4. Check what brand casing looks like
  console.log("\n--- Test 4: Brand casing in DB ---");
  const { data: d4 } = await supabase
    .from("flyer_products")
    .select("brand")
    .eq("country", "saudi arabia")
    .ilike("category", "frozen fries")
    .limit(20);
  const brands = [...new Set(d4?.map(r => r.brand) || [])];
  console.log("Unique brands in frozen fries:", brands.slice(0, 15));
}

run();
