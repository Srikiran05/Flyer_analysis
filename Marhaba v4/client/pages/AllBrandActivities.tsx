import { useState, useMemo, FC } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LabelList
} from 'recharts';
import { ChevronDown, ChevronRight, Filter, ImageIcon, Loader2 } from 'lucide-react';
import { getISOWeek, getISOWeekYear } from 'date-fns';
// import { getISOWeek } from 'date-fns';
import React from 'react';
import { getCurrency } from '../utils/offerBankUtils';


// --- Types ---
interface FlyerProduct {
  id: number;
  brand: string | null;
  category: string | null;
  type: string | null;
  product_name?: string | null;
  regular_price: string | null;
  discounted_price: string | null;
  offer_timeline: string | null;
  weight_quantity: string | null;
  country: string | null;
  coverage_regions: string | null;
  mart_name: string | null;
  image_path?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface AllBrandActivitiesProps {
  products: FlyerProduct[];
  allBrands: string[];
  myBrand: string;
  selectedCategory: string | null;
  selectedRegion: string | null;
  selectedCountry: string | null; // <--- ADD THIS LINE
  selectedCompetitor: string | null;
  offerType: string | null;
  isLoading?: boolean; // <--- ADD THIS LINE
}



const KPICard = ({ title, myBrandVal, compVal, format = 'number', reverseColor = false, currency = '' }: any) => {
  const isBetter = reverseColor ? myBrandVal < compVal : myBrandVal > compVal;
  const colorClass = isBetter ? 'text-green-400' : 'text-red-400';

  const fmt = (v: number) => {
    if (format === 'currency') return `${currency} ${v.toFixed(1)}`;
    if (format === 'percent') return `${v.toFixed(1)}%`;
    return Math.round(v).toLocaleString();
  };

  return (
    // CHANGED: Use Grid instead of Flex to guarantee column alignment
    // 1fr (Title) | 90px (My Brand) | 90px (Comp)
    <div className="grid grid-cols-[1fr_90px_90px] items-center py-3 border-b border-zinc-800 last:border-0">
      <span className="text-gray-400 text-sm font-medium text-left">{title}</span>

      {/* My Brand Value - Right Aligned */}
      <span className={`font-bold text-sm text-center ${colorClass}`}>
        {fmt(myBrandVal)}
      </span>

      {/* Comp Value - Right Aligned */}
      <span className="text-gray-300 font-medium text-sm text-center">
        {fmt(compVal)}
      </span>
    </div>
  );
};
// --- Colors for Stacked Chart ---
const STACK_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#6366f1', '#84cc16', '#f97316'
];

// --- Custom Tooltip for Stacked Chart ---
const CustomStackedTooltip = ({ active, payload, hoveredItem }: any) => {
  if (active && hoveredItem && payload && payload.length) {
    const { brandName, segmentName, value, total } = hoveredItem;
    const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';

    return (
      <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="chart-tooltip text-white text-xs z-50">
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{brandName}</div>
        <div className="space-y-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#a1a1aa' }}>{hoveredItem.mode}</span><span style={{ color: '#fff', fontWeight: 600 }}>{segmentName}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#a1a1aa' }}>Offer Count</span><span style={{ color: '#fff', fontWeight: 600 }}>{value}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#a1a1aa' }}>Share %</span><span style={{ color: '#8b5cf6', fontWeight: 700 }}>{percent}%</span></div>
        </div>
      </div>
    );
  }
  return null;
};

// --- Strict Date Parser ---
// Only accepts "YYYY-MM-DD". Rejects "2025/11/01" or "11-01-2025"
// Strict Date Parser: Only accepts "YYYY-MM-DD"
const parseStrictDate = (dateStr: string | null): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const parts = dateStr.trim().split('-');

  // strict check: must have exactly 3 parts
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-11
  const day = parseInt(parts[2], 10);

  // Check for NaN
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const date = new Date(year, month, day);

  // Validation: Check if Date object matches input (handles "2025-02-30" invalid dates)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const renderStackedBarLabel = (props: any) => {
  const x = props.x ?? props.viewBox?.x ?? 0;
  const y = props.y ?? props.viewBox?.y ?? 0;
  const width = props.width ?? props.viewBox?.width ?? 0;
  const height = props.height ?? props.viewBox?.height ?? 0;
  const value = props.value;

  const dataItem = props.payload ?? props.entry?.payload ?? props.entry;
  const total = dataItem?.total;

  let pct = 0;

  // stackOffset="expand" passes value as [startFraction, endFraction]
  if (value && Array.isArray(value) && value.length >= 2) {
    const start = typeof value[0] === 'string' ? parseFloat(value[0]) : value[0];
    const end = typeof value[1] === 'string' ? parseFloat(value[1]) : value[1];
    pct = (end - start) * 100;
  } else if (typeof value === 'number' && total && typeof total === 'number' && total > 0) {
    // Fallback: compute from raw count / total
    pct = (value / total) * 100;
  } else {
    return null;
  }

  // Skip segments with negligible percentage
  if (pct < 0.5 || width < 1) return null;

  const label = `${Math.round(pct)}%`;

  // Wide segments: full percentage label
  if (width >= 30) {
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#fff"
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    );
  }

  // Medium segments: smaller font
  if (width >= 18) {
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#ffffffe6"
        fontSize={8}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    );
  }

  // Narrow segments: show '...' hint
  if (width >= 8) {
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#ffffffb3"
        fontSize={7}
        fontWeight={500}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        ..
      </text>
    );
  }

  return null;
};

// --- MAIN COMPONENT ---
const AllBrandActivities: FC<AllBrandActivitiesProps> = ({ products, allBrands, myBrand, selectedCategory,
  selectedRegion, selectedCountry, selectedCompetitor, offerType, isLoading = false }) => {
  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);

  // --- Local State ---
  const [showOfferImage, setShowOfferImage] = useState(false);
  const [expandedRetailers, setExpandedRetailers] = useState<Record<string, boolean>>({});
  const [hoveredProduct, setHoveredProduct] = useState<{ id: number, x: number, y: number } | null>(null);

  // Filters & View State
  const [myBrandSummary, setMyBrandSummary] = useState(false);
  const [rightChartMode, setRightChartMode] = useState<'Retailer' | 'Region'>('Retailer');
  const [tableMetric, setTableMetric] = useState('Offer Price');
  const [analysisPeriod, setAnalysisPeriod] = useState('52_WEEKS');
  // Tooltip State for Stacked Chart
  const [hoveredStackItem, setHoveredStackItem] = useState<{
    brandName: string;
    segmentName: string;
    value: number;
    total: number;
    mode: string;
  } | null>(null);

  // Currency follows the country the user picked. It used to be read off
  // safeProducts[0].country, but flyer_products stores country lowercased
  // ("saudi arabia") while the map was keyed Title Case, so every lookup missed
  // and the UI fell back to a hardcoded "$".
  const currentCurrency = useMemo(
    () => getCurrency(selectedCountry) || getCurrency(safeProducts[0]?.country) || '',
    [selectedCountry, safeProducts],
  );

  const parseDateSafe = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };


  const timeFilteredProducts = useMemo(() => {
    if (!safeProducts || safeProducts.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate fromDate correctly — always start fresh from today
    let fromDate: Date;
    switch (analysisPeriod) {
      case '12_WEEKS':
        fromDate = new Date(today.getTime() - 84 * 24 * 60 * 60 * 1000);
        break;
      case '52_WEEKS':
        fromDate = new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000);
        break;
      case 'YTD':
        fromDate = new Date(today.getFullYear(), 0, 1);
        break;
      default: // 4_WEEKS
        fromDate = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
        break;
    }

    let filtered = products.filter(p => {
      const start = parseDateSafe(p.start_date);
      if (!start) return false;

      // Match the server-side stats RPC (get_promotion_analysis_stats_multi):
      // count offers whose START date falls in the analysis window. The end
      // date is not required, so rows with missing end dates are no longer
      // silently dropped — keeps this tab's counts identical to the
      // Overall Summary numbers.
      return start >= fromDate;
    });

    // Handle Distinct Offers: dedupe by brand + product name — the same
    // definition the stats RPC uses (COUNT(DISTINCT product_name) per brand).
    if (offerType === 'Distinct Offers') {
      const uniqueMap = new Map();
      filtered.forEach(item => {
        const key = `${(item.brand || '').toLowerCase()}_${(item.product_name || '')}`.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      filtered = Array.from(uniqueMap.values());
    }

    return filtered;
  }, [products, analysisPeriod, offerType]);

  // --- Data Processing (Updated for Year-Week Sorting) ---
  const {
    processedWeeks,
    retailerData,
    brandStats,
    kpiData,
    stackedRetailerData,
    stackedRegionData,
    retailerKeys,
    regionKeys
  } = useMemo(() => {
    if (!timeFilteredProducts.length) return {
      processedWeeks: [], retailerData: {}, brandStats: [], kpiData: null,
      stackedRetailerData: [], stackedRegionData: [], retailerKeys: [], regionKeys: []
    };

    const weeks = new Set<string>();

    // Aggregation objects
    const brandCounts: Record<string, number> = {};
    const sRetailerMap: Record<string, any> = {};
    const sRegionMap: Record<string, any> = {};
    const rKeys = new Set<string>();
    const regKeys = new Set<string>();

    let myBrandData = { count: 0, discountSum: 0, priceSum: 0, minDisc: 100, maxDisc: 0, minPrice: 1000, maxPrice: 0 };
    let compData = { count: 0, discountSum: 0, priceSum: 0, minDisc: 100, maxDisc: 0, minPrice: 1000, maxPrice: 0 };

    const rData: Record<string, Record<string, Record<string, { count: number, priceSum: number, regPriceSum: number, discountSum: number, products: FlyerProduct[] }>>> = {};

    timeFilteredProducts.forEach(p => {
      let validDate = parseStrictDate(p.end_date);

      // 2. If End Date is null/invalid, try Start Date
      if (!validDate) {
        validDate = parseStrictDate(p.start_date);
      }

      // 3. If both are null/invalid, skip
      if (!validDate) return;

      const date = validDate;

      // Competitor Filter — only filter if a specific single competitor is selected
      // MULTI_COMPETITORS means multiple competitors are selected; the parent already fetches filtered data
      // Note: Country, Category, Region are already filtered by the parent's Supabase query
      if (selectedCompetitor && selectedCompetitor !== 'ALL_COMPETITORS' && selectedCompetitor !== 'MULTI_COMPETITORS') {
        const pBrand = (p.brand || '').trim().toLowerCase();
        const targetMy = (myBrand || '').trim().toLowerCase();
        const targetComp = selectedCompetitor.trim().toLowerCase();

        // Only allow My Brand and the Selected Competitor
        if (pBrand !== targetMy && pBrand !== targetComp) {
          return;
        }
      }

      const weekNum = getISOWeek(date);
      const yearNum = getISOWeekYear(date);

      const weekKey = `${yearNum}-Week${weekNum.toString().padStart(2, '0')}`;

      weeks.add(weekKey);

      const price = parseFloat(p.discounted_price || '0') || 0;
      const regPrice = parseFloat(p.regular_price || '0') || 0;
      // Both prices must be present. A missing/unparsable offer price (0) used to
      // read as a 100% discount, which blew up Max Discount and the averages.
      const discount = price > 0 && regPrice > price ? ((regPrice - price) / regPrice) * 100 : 0;

      const brand = (p.brand || 'Unknown').trim();
      const retailer = (p.mart_name || 'Unknown').trim();
      const region = (p.coverage_regions || 'Unknown').trim();

      brandCounts[brand] = (brandCounts[brand] || 0) + 1;

      if (!sRetailerMap[brand]) sRetailerMap[brand] = { name: brand, total: 0 };
      sRetailerMap[brand][retailer] = (sRetailerMap[brand][retailer] || 0) + 1;
      sRetailerMap[brand].total += 1;
      rKeys.add(retailer);

      if (!sRegionMap[brand]) sRegionMap[brand] = { name: brand, total: 0 };
      sRegionMap[brand][region] = (sRegionMap[brand][region] || 0) + 1;
      sRegionMap[brand].total += 1;
      regKeys.add(region);

      const isMyBrand = brand.toLowerCase() === myBrand.trim().toLowerCase();
      const target = isMyBrand ? myBrandData : compData;

      target.count++;
      if (discount > 0) {
        target.discountSum += discount;
        target.minDisc = Math.min(target.minDisc, discount);
        target.maxDisc = Math.max(target.maxDisc, discount);
      }
      if (price > 0) {
        target.priceSum += price;
        target.minPrice = Math.min(target.minPrice, price);
        target.maxPrice = Math.max(target.maxPrice, price);
      }

      if (!rData[retailer]) rData[retailer] = {};
      if (!rData[retailer][brand]) rData[retailer][brand] = {};
      if (!rData[retailer][brand][weekKey]) {
        rData[retailer][brand][weekKey] = { count: 0, priceSum: 0, regPriceSum: 0, discountSum: 0, products: [] };
      }

      const cell = rData[retailer][brand][weekKey];
      cell.count += 1;
      cell.priceSum += price;
      cell.regPriceSum += regPrice;
      cell.discountSum += discount;
      cell.products.push(p);
    });

    const finalizeKPI = (d: typeof myBrandData) => ({
      ...d,
      avgDisc: d.count ? d.discountSum / d.count : 0,
      avgPrice: d.count ? d.priceSum / d.count : 0,
      minDisc: d.minDisc === 100 ? 0 : d.minDisc,
      minPrice: d.minPrice === 1000 ? 0 : d.minPrice,
    });

    const kpiFinal = {
      myBrand: finalizeKPI(myBrandData),
      competitor: finalizeKPI(compData)
    };

    const toChartData = (source: Record<string, number>) =>
      Object.entries(source)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({ name, value }));

    const sortedWeeks = Array.from(weeks).sort().reverse();

    const processedStackedRetailer = Object.values(sRetailerMap).sort((a: any, b: any) => b.total - a.total);
    const processedStackedRegion = Object.values(sRegionMap).sort((a: any, b: any) => b.total - a.total);

    return {
      processedWeeks: sortedWeeks,
      retailerData: rData,
      brandStats: toChartData(brandCounts),
      kpiData: kpiFinal,
      stackedRetailerData: processedStackedRetailer,
      stackedRegionData: processedStackedRegion,
      retailerKeys: Array.from(rKeys),
      regionKeys: Array.from(regKeys)
    };

  }, [timeFilteredProducts, myBrand, analysisPeriod, selectedCountry, selectedCompetitor, selectedCategory, selectedRegion]);

  const toggleRetailer = (retailer: string) => {
    setExpandedRetailers(prev => ({ ...prev, [retailer]: !prev[retailer] }));
  };

  const handleMouseEnter = (e: React.MouseEvent, productId: number) => {
    if (!showOfferImage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredProduct({ id: productId, x: rect.left, y: rect.top - 200 });
  };

  const getCellValue = (data: any) => {
    if (!data || data.count === 0) return '';
    switch (tableMetric) {
      case 'Regular Price': return (data.regPriceSum / data.count).toFixed(1);
      case 'Discount': return (data.discountSum / data.count).toFixed(1) + '%';
      case 'Price Per Kg/Ltr': return (data.priceSum / data.count).toFixed(1); // Simplified
      case 'Offer Price': default: return (data.priceSum / data.count).toFixed(1);
    }
  };

  // Chart Logic
  const activeStackKeys = rightChartMode === 'Retailer' ? retailerKeys : regionKeys;
  const activeStackData = rightChartMode === 'Retailer' ? stackedRetailerData : stackedRegionData;

  const handleStackBarEnter = (data: any, key: string) => {
    if (data) {
      setHoveredStackItem({
        brandName: data.name,
        segmentName: key,
        value: data[key] || 0,
        total: data.total || 0,
        mode: rightChartMode
      });
    }
  };

  // Helper for Dynamic Height (approx 56px per bar to prevent congestion;
  // the wrapper scrolls, so more brands just extend the scroll area)
  const getDynamicHeight = (itemCount: number) => Math.max(itemCount * 56, 320);

  // Filter Brand Stats based on checkbox
  const displayedBrandStats = myBrandSummary
    ? brandStats.filter(b => b.name === myBrand)
    : brandStats;


  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* INJECTED STYLES FOR SCROLLBAR */}
      <style>{`
        /* height matters for horizontal bars — without it they fall back to
           the OS default (~15px) while vertical ones honour width. */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        /* Translucent grey reads correctly on both the dark and light panels;
           a solid zinc-800 thumb looked like a black bar in light mode. */
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(113, 113, 122, 0.45);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(113, 113, 122, 0.7);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(113, 113, 122, 0.45) transparent;
        }
      `}</style>

      {/* --- SECTION 1: FILTERS --- */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-2 text-purple-400">
          <Filter className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Advanced Filtering</h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-semibold uppercase">Analysis Week:</span>
          {/* UPDATED SELECT INPUT */}
          <select
            value={analysisPeriod}
            onChange={(e) => setAnalysisPeriod(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:ring-1 focus:ring-purple-500 outline-none"
          >
            <option value="4_WEEKS">Latest 4 Weeks</option>
            <option value="12_WEEKS">Latest 12 Weeks</option>
            <option value="52_WEEKS">Latest 52 Weeks</option>
            <option value="YTD">YTD</option>
          </select>
        </div>
      </div>

      {/* --- SECTION 2: DASHBOARD (KPIs + CHARTS) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[450px]">

        {/* LEFT: KPI SCORECARD */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col h-[450px]">

          {/* CHANGED: Header now matches the Grid of KPICard (1fr_90px_90px) */}
          <div className="grid grid-cols-[1fr_90px_90px] items-center mb-4 pb-2 border-b border-zinc-700">
            <span className="font-bold text-gray-200 text-left">Metric</span>
            <span className="text-xs font-bold text-gray-400 text-center">My Brand</span>
            <span className="text-xs font-bold text-gray-400 text-center">Comp.</span>
          </div>

          <div className="flex-1 flex flex-col justify-around relative">
            {isLoading ? (
              // SKELETON LOADER FOR KPIs
              <div className="animate-pulse space-y-4 w-full px-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-zinc-800/50">
                    <div className="h-3 bg-zinc-700/50 rounded w-1/3"></div>
                    <div className="h-4 bg-zinc-700/50 rounded w-12"></div>
                    <div className="h-4 bg-zinc-700/50 rounded w-12"></div>
                  </div>
                ))}
              </div>
            ) : (kpiData && (
              <>
                <KPICard title="Offer Count" myBrandVal={kpiData.myBrand.count} compVal={kpiData.competitor.count} />
                <KPICard title="Avg Discount" myBrandVal={kpiData.myBrand.avgDisc} compVal={kpiData.competitor.avgDisc} format="percent" />
                <KPICard title="Min Discount" myBrandVal={kpiData.myBrand.minDisc} compVal={kpiData.competitor.minDisc} format="percent" />
                <KPICard title="Max Discount" myBrandVal={kpiData.myBrand.maxDisc} compVal={kpiData.competitor.maxDisc} format="percent" />

                <KPICard
                  title="Avg Price"
                  myBrandVal={kpiData.myBrand.avgPrice}
                  compVal={kpiData.competitor.avgPrice}
                  format="currency"
                  reverseColor
                  currency={currentCurrency}
                />
              </>
            )
            )}
          </div>
        </div>

        {/* MIDDLE: HORIZONTAL BAR CHART (Scrollable) */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-[450px] flex flex-col">
          <div className="flex justify-between items-center mb-2 flex-shrink-0">
            <h4 className="text-sm font-bold text-gray-300">Brandwise Offer Count</h4>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="myBrandOnly"
                checked={myBrandSummary}
                onChange={(e) => setMyBrandSummary(e.target.checked)}
                className="rounded bg-zinc-700 border-zinc-600 text-purple-600 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="myBrandOnly" className="text-xs text-gray-400 cursor-pointer select-none">My Brand Summary</label>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10 h-[300px]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  <span className="text-xs text-zinc-500 font-medium">Loading Data...</span>
                </div>
              </div>
            ) : (<div style={{ height: `${getDynamicHeight(displayedBrandStats.length)}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={displayedBrandStats}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="barGradPurpleH" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#a78bfa" /></linearGradient>
                    <linearGradient id="barGradBrandH" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#9333ea" /><stop offset="100%" stopColor="#f97316" /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fill: '#9ca3af', fontSize: 12 }} tickLine={false} axisLine={false} interval={0} />
                  <Tooltip
                    cursor={{ fill: '#3f3f46', opacity: 0.15 }}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0];
                      const isMyBrand = data.payload.name === myBrand;
                      return (
                        <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="chart-tooltip text-white text-xs z-50">
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8, color: '#fff' }}>{data.payload.name}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: isMyBrand ? '#8b5cf6' : '#0ea5e9' }} />
                              <span style={{ color: '#a1a1aa', fontSize: 12 }}>Offer Count</span>
                            </div>
                            <span style={{ color: '#fff', fontWeight: 700 }}>{data.value}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={30} animationDuration={800}>
                    {displayedBrandStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === myBrand ? 'url(#barGradPurpleH)' : 'url(#barGradBrandH)'} />
                    ))}
                    <LabelList
                      dataKey="value"
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (!value) return null;
                        const label = value.toLocaleString();
                        // Place label inside the bar if it fits, otherwise outside
                        const textFits = width > 36;
                        return (
                          <text
                            x={textFits ? x + width - 8 : x + width + 6}
                            y={y + height / 2}
                            fill={textFits ? '#fff' : '#a1a1aa'}
                            fontSize={11}
                            fontWeight={700}
                            textAnchor={textFits ? 'end' : 'start'}
                            dominantBaseline="middle"
                          >
                            {label}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>
        </div>

        {/* RIGHT: STACKED BAR CHART (Scrollable) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-[450px] flex flex-col">
          <div className="flex justify-between items-center mb-2 flex-shrink-0">
            <h4 className="text-sm font-bold text-gray-300">Brandwise Offer Count</h4>
            <div className="bg-zinc-800 rounded-full p-0.5 flex items-center border border-zinc-700">
              <button
                onClick={() => setRightChartMode('Retailer')}
                className={`px-3 py-1 text-[10px] rounded-full transition-all duration-200 font-medium ${rightChartMode === 'Retailer' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Retailer
              </button>
              <button
                onClick={() => setRightChartMode('Region')}
                className={`px-3 py-1 text-[10px] rounded-full transition-all duration-200 font-medium ${rightChartMode === 'Region' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Region
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto pr-2 custom-scrollbar relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10 h-[300px]">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              </div>
            ) : (<div
              className="flex"
              style={{ height: `${getDynamicHeight(activeStackData.length)}px`, width: `${Math.max(activeStackKeys.length * 56 + 120, 560)}px`, minWidth: '100%' }}
            >
              {/* Pinned brand-name column: sticks to the left while the bars
                  scroll horizontally. Row heights mirror recharts' even band
                  distribution (same total height, same 5px v-margins). */}
              <div className="w-[120px] shrink-0 flex flex-col py-[5px] sticky left-0 z-10 bg-zinc-900">
                {activeStackData.map((d: any) => (
                  <div key={d.name} className="flex-1 flex items-center justify-end pr-3 text-xs text-gray-400 truncate" title={d.name}>
                    {d.name}
                  </div>
                ))}
              </div>
              {/* Bars grow with the number of stack segments so slices stay
                  readable; the panel below scrolls both axes. */}
              <div className="flex-1 min-w-0">
                <div style={{ width: '100%', height: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={activeStackData}
                      stackOffset="expand"
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" hide interval={0} />

                      <Tooltip
                        content={<CustomStackedTooltip hoveredItem={hoveredStackItem} />}
                        cursor={{ fill: 'transparent' }}
                      />

                      {activeStackKeys.map((key, index) => {
                        const color = STACK_COLORS[index % STACK_COLORS.length];
                        return (
                          <Bar
                            key={key}
                            dataKey={key}
                            stackId="a"
                            fill={color}
                            barSize={34}
                            onMouseEnter={(data) => handleStackBarEnter(data, key)}
                            onMouseLeave={() => setHoveredStackItem(null)}
                            shape={(props: any) => {
                              const { x, y, width, height, payload } = props;
                              const segmentValue = payload?.[key] || 0;
                              const total = payload?.total || 0;
                              const pct = total > 0 ? Math.round((segmentValue / total) * 100) : 0;

                              return (
                                <g>
                                  <rect x={x} y={y} width={width} height={height} fill={color} rx={0} />
                                  {pct >= 1 && width >= 28 && (
                                    <text
                                      x={x + width / 2}
                                      y={y + height / 2}
                                      fill="#fff"
                                      fontSize={width >= 36 ? 11 : 9}
                                      fontWeight={700}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                    >
                                      {pct}%
                                    </text>
                                  )}
                                  {pct >= 1 && width >= 14 && width < 28 && (
                                    <text
                                      x={x + width / 2}
                                      y={y + height / 2}
                                      fill="#ffffffcc"
                                      fontSize={7}
                                      fontWeight={600}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                    >
                                      {pct}%
                                    </text>
                                  )}
                                </g>
                              );
                            }}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SECTION 3: PIVOT TABLE --- */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-lg mt-8">

        {/* Table Controls */}
        <div className="p-4 border-b border-zinc-700 bg-zinc-800/50 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <span className="text-gray-400 font-medium text-sm">Average:</span>
            <select
              value={tableMetric}
              onChange={(e) => setTableMetric(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-purple-500"
            >
              <option>Regular Price</option>
              <option>Offer Price</option>
              <option>Price Per Kg/Ltr</option>
              <option>Discount</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300 font-medium">Show Offer Image:</span>
            <button
              onClick={() => setShowOfferImage(!showOfferImage)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showOfferImage ? 'bg-purple-600' : 'bg-zinc-800'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${showOfferImage ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* The Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              {/* Header Row 1: Weeks */}
              <tr className="bg-blue-900/30 text-blue-200">
                <th className="p-3 border-r border-zinc-700 w-64 min-w-[200px] sticky left-0 bg-zinc-900 z-10 font-bold">Week Number</th>
                {processedWeeks.map(week => (
                  <th key={week} colSpan={3} className="p-2 border-r border-zinc-700 text-center font-bold border-b border-blue-800/50">
                    {week}
                  </th>
                ))}
              </tr>
              {/* Header Row 2: Metrics */}
              <tr className="bg-blue-900/20 text-blue-300">
                <th className="p-2 border-r border-zinc-700 sticky left-0 bg-zinc-900 z-10 font-semibold border-b border-zinc-700">Retailer / Brand</th>
                {processedWeeks.map(week => (
                  <React.Fragment key={week}>
                    <th className="px-2 py-1 text-center border-r border-zinc-800 w-16">Activity</th>
                    <th className="px-2 py-1 text-center border-r border-zinc-800 w-16">Share</th>

                    {/* CHANGED: Added currency to the header title for clarity */}
                    <th
                      className="px-2 py-1 text-center border-r border-zinc-700 w-20 whitespace-nowrap overflow-hidden text-ellipsis"
                      title={`${tableMetric} (${currentCurrency})`}
                    >
                      {tableMetric === 'Discount' ? 'Avg Value' : `Avg (${currentCurrency})`}
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={100} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-10 h-10 text-purple-600 animate-spin mb-3" />
                      <span className="text-zinc-400 font-medium animate-pulse">Processing brand activities...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {(() => {
                    const formatAverageVal = (count: number, priceSum: number, regPriceSum: number, discountSum: number) => {
                      if (count === 0) return '';
                      switch (tableMetric) {
                        case 'Regular Price': return (regPriceSum / count).toFixed(1);
                        case 'Discount': return (discountSum / count).toFixed(1) + '%';
                        case 'Price Per Kg/Ltr': return (priceSum / count).toFixed(1);
                        case 'Offer Price': default: return (priceSum / count).toFixed(1);
                      }
                    };

                    return Object.keys(retailerData).sort().map(retailer => {
                      const isExpanded = expandedRetailers[retailer];
                      const rBrands = retailerData[retailer];

                      return (
                        <React.Fragment key={retailer}>
                          {/* Retailer Row (Parent) */}
                          <tr
                            onClick={() => toggleRetailer(retailer)}
                            className="bg-zinc-800/30 hover:bg-zinc-800 cursor-pointer transition-colors"
                          >
                            <td className="p-3 border-r border-zinc-700 sticky left-0 bg-zinc-900/95 font-bold text-gray-200 flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                              {retailer}
                            </td>
                            {processedWeeks.map(week => {
                              const rCount = Object.values(rBrands).reduce((sum: number, bData: any) => sum + (bData[week]?.count || 0), 0);
                              const rPriceSum = Object.values(rBrands).reduce((sum: number, bData: any) => sum + (bData[week]?.priceSum || 0), 0);
                              const rRegPriceSum = Object.values(rBrands).reduce((sum: number, bData: any) => sum + (bData[week]?.regPriceSum || 0), 0);
                              const rDiscountSum = Object.values(rBrands).reduce((sum: number, bData: any) => sum + (bData[week]?.discountSum || 0), 0);

                              const totalWeekOffers = Object.values(retailerData).reduce((mSum: number, otherBrands: any) => {
                                return mSum + (Object.values(otherBrands).reduce((rSum: number, bData: any) => rSum + (bData[week]?.count || 0), 0) as number);
                              }, 0);

                              const sharePercent = (totalWeekOffers > 0)
                                ? ((rCount / totalWeekOffers) * 100).toFixed(1)
                                : '0.0';

                              const share = rCount > 0 ? `${sharePercent}%` : '';
                              const avgVal = rCount > 0 ? formatAverageVal(rCount, rPriceSum, rRegPriceSum, rDiscountSum) : '';

                              return (
                                <React.Fragment key={week}>
                                  <td className="px-2 py-3 text-center border-r border-zinc-800 text-gray-300 font-bold">{rCount > 0 ? rCount : '-'}</td>
                                  <td className="px-2 py-3 text-center border-r border-zinc-800 text-gray-300 font-bold">{share || '-'}</td>
                                  <td className="px-2 py-3 text-center border-r border-zinc-700 text-gray-300 font-bold">{avgVal || '-'}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>

                          {/* Brand Rows (Children) */}
                          {isExpanded && Object.keys(rBrands).sort().map(brand => {
                            return (
                              <tr key={`${retailer}-${brand}`} className="bg-zinc-900/50 hover:bg-zinc-800/80 transition-colors">
                                <td className="p-2 pl-8 border-r border-zinc-700 sticky left-0 bg-zinc-900 z-10 text-gray-400 text-[11px]">
                                  {brand}
                                </td>
                                {processedWeeks.map(week => {
                                  const data = rBrands[brand][week];
                                  //  const share = data ? '100%' : '';
                                  // CALCULATE SHARE: Sum all offers for this Retailer in this Week
                                  const totalWeekOffers = Object.values(rBrands).reduce((sum: number, brandData: any) => {
                                    return sum + (brandData[week]?.count || 0);
                                  }, 0);

                                  const sharePercent = (data && totalWeekOffers > 0)
                                    ? ((data.count / totalWeekOffers) * 100).toFixed(1)
                                    : '0.0';

                                  const share = data ? `${sharePercent}%` : '';
                                  const cellVal = getCellValue(data);

                                  let bgClass = '';
                                  if (data?.count && tableMetric === 'Offer Price') {
                                    const avg = data.priceSum / data.count;
                                    if (avg > 25) bgClass = 'bg-orange-500/20 text-orange-200';
                                    else if (avg > 15) bgClass = 'bg-yellow-500/20 text-yellow-200';
                                    else bgClass = 'bg-green-500/20 text-green-200';
                                  }

                                  return (
                                    <React.Fragment key={week}>
                                      <td className="px-2 py-2 text-center border-r border-zinc-800 border-b border-zinc-800 text-gray-500">
                                        {data ? data.count : ''}
                                      </td>
                                      <td className="px-2 py-2 text-center border-r border-zinc-800 border-b border-zinc-800 text-gray-500">
                                        {share}
                                      </td>
                                      <td
                                        className={`px-2 py-2 text-center border-r border-zinc-700 border-b border-zinc-800 font-medium relative ${bgClass}`}
                                        onMouseEnter={(e) => data?.products[0] && handleMouseEnter(e, data.products[0].id)}
                                        onMouseLeave={() => setHoveredProduct(null)}
                                      >
                                        {cellVal}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()}

                  {/* Average Summary Row */}
                  <tr className="bg-zinc-800 font-bold border-t-2 border-zinc-600">
                    <td className="p-3 border-r border-zinc-600 sticky left-0 bg-zinc-800 z-10 text-white">Average</td>
                    {processedWeeks.map(week => {
                      const mCount = Object.values(retailerData).reduce((mSum: number, otherBrands: any) => {
                        return mSum + (Object.values(otherBrands).reduce((rSum: number, bData: any) => rSum + (bData[week]?.count || 0), 0) as number);
                      }, 0);
                      const mPriceSum = Object.values(retailerData).reduce((mSum: number, otherBrands: any) => {
                        return mSum + (Object.values(otherBrands).reduce((rSum: number, bData: any) => rSum + (bData[week]?.priceSum || 0), 0) as number);
                      }, 0);
                      const mRegPriceSum = Object.values(retailerData).reduce((mSum: number, otherBrands: any) => {
                        return mSum + (Object.values(otherBrands).reduce((rSum: number, bData: any) => rSum + (bData[week]?.regPriceSum || 0), 0) as number);
                      }, 0);
                      const mDiscountSum = Object.values(retailerData).reduce((mSum: number, otherBrands: any) => {
                        return mSum + (Object.values(otherBrands).reduce((rSum: number, bData: any) => rSum + (bData[week]?.discountSum || 0), 0) as number);
                      }, 0);

                      const formatAverageVal = (count: number, priceSum: number, regPriceSum: number, discountSum: number) => {
                        if (count === 0) return '';
                        switch (tableMetric) {
                          case 'Regular Price': return (regPriceSum / count).toFixed(1);
                          case 'Discount': return (discountSum / count).toFixed(1) + '%';
                          case 'Price Per Kg/Ltr': return (priceSum / count).toFixed(1);
                          case 'Offer Price': default: return (priceSum / count).toFixed(1);
                        }
                      };

                      const avgVal = mCount > 0 ? formatAverageVal(mCount, mPriceSum, mRegPriceSum, mDiscountSum) : '';

                      return (
                        <React.Fragment key={week}>
                          <td className="text-center text-white py-3 border-r border-zinc-700">{mCount > 0 ? mCount : '-'}</td>
                          <td className="text-center text-white py-3 border-r border-zinc-700">{mCount > 0 ? '100%' : '-'}</td>
                          <td className="text-center text-white py-3 border-r border-zinc-600">{avgVal || '-'}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Image Hover Popup --- */}
      {showOfferImage && hoveredProduct && (
        <div
          className="fixed z-50 bg-white p-2 rounded-lg shadow-2xl border-4 border-purple-500 pointer-events-none transform -translate-x-1/2 transition-opacity duration-200"
          style={{ left: hoveredProduct.x + 40, top: hoveredProduct.y }}
        >
          <div className="w-48 h-48 bg-gray-100 rounded flex items-center justify-center relative overflow-hidden">
            {/* UPDATED IMAGE LOGIC */}
            {(() => {
              const product = safeProducts.find(p => p.id === hoveredProduct.id);
              // Check for image_path (from DB) or image_url (legacy)
              const imgSource = product?.image_path;

              return imgSource ? (
                <img
                  src={imgSource}
                  alt="Product Offer"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center">
                  <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-semibold px-2">Product ID: {hoveredProduct.id}</p>
                </div>
              );
            })()}
          </div>
          {/* ... existing price tag div ... */}
          <div className="absolute bottom-2 right-2 bg-pink-500 text-white font-bold rounded-full w-12 h-12 flex items-center justify-center shadow-md text-xs z-10">
            {(() => {
              const p = safeProducts.find(p => p.id === hoveredProduct.id);
              if (!p) return null;
              const price = parseFloat(p.discounted_price || '0');
              const reg = parseFloat(p.regular_price || '0');
              const disc = price > 0 && reg > price ? Math.round(((reg - price) / reg) * 100) : 0;
              return disc > 0 ? `-${disc}%` : 'Low';
            })()}
          </div>
        </div>
      )}

    </div>
  );
};

export default AllBrandActivities;
