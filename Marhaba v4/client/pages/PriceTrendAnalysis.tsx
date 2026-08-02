import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  format,
  subWeeks,
  subDays,
  startOfYear,
  isWithinInterval,
  parseISO,
  startOfDay,
  endOfDay,
  addDays,
  getISOWeek,
  getYear,
  subMonths
} from 'date-fns';
import {
  ChevronDown,
  Info,
  Calendar as CalendarIcon,
  Search,
  X
} from 'lucide-react';

// --- SUPABASE CLIENT ---
import { supabase } from '@/lib/supabaseClient';
import { buildBrandColorMap, getBrandColor } from '@/utils/brandColors';
import { getCurrency } from '../utils/offerBankUtils';
// --- Types ---
export interface FlyerProduct {
  id: number;
  product_name: string | null;
  brand: string | null;
  type: string | null;
  weight_quantity: string | null;
  regular_price: string | null;
  discounted_price: string | null;
  category: string | null;
  mart_name: string | null;
  offer_name: string | null;
  // offer_description?: string;
  // offer_timeline: string | null;
  coverage_regions: string | null;
  country: string | null;
  // created_at?: string;
  start_date: string | null; // Added
  end_date: string | null;   // Added
  image_path?: string | null; // <--- ADD THIS LINE
}

// The four comparison windows in the summary bar chart. This chart is the one
// place that does NOT use the shared brand colours: it puts four bars side by
// side per brand, so the hue has to separate the periods or the group reads as
// a single block. Brand identity is carried by the x-axis label here.
const PERIOD_BARS = [
  { key: 'latest4', label: 'Latest 4 weeks', from: '#38bdf8', to: '#0284c7' },
  { key: 'latest12', label: 'Latest 12 weeks', from: '#34d399', to: '#059669' },
  { key: 'ytd', label: 'YTD', from: '#a3e635', to: '#65a30d' },
  { key: 'latest52', label: 'Latest 52 weeks', from: '#fbbf24', to: '#d97706' },
] as const;

interface Props {
  products?: any[]; // Optional, as we fetch internally now
  isLoading?: boolean;
  primaryBrand: string;
  competitorBrand: string;
  competitorBrands?: string[]; // List of specific competitor brand names for MULTI_COMPETITORS mode
  selectedCategory: string;
  selectedCountry: string;
  selectedRegion: string;
  selectedRetailer?: string;
  selectedSubCategory?: string;
  offerType?: string;
  selectedBasePack?: string;
  selectedQuantity?: string;
}

type MetricType = 'Regular Price' | 'Offer Price' | 'Price Per Kg/Ltr' | 'Discount';

// --- Helpers ---
const getPrice = (p: string | null | number) => {
  if (!p) return 0;
  if (typeof p === 'number') return p;
  
  const str = p.toString().trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    const part = parts[0];
    const num = parseFloat(part.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : num;
  }
  
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  return isNaN(num) ? 0 : num;
};

const getWeightInUnits = (weightStr: string | null): number => {
  if (!weightStr) return 0;
  const lower = weightStr.toLowerCase().replace(/\s/g, '');
  let multiplier = 1;
  let unitPart = lower;
  if (lower.includes('x')) {
    const parts = lower.split('x');
    const m = parseFloat(parts[0]);
    if (!isNaN(m)) multiplier = m;
    unitPart = parts[1] || '';
  }
  const numVal = parseFloat(unitPart.replace(/[^\d.]/g, ''));
  if (isNaN(numVal)) return 0;
  if (unitPart.includes('kg') || unitPart.includes('ltr') || unitPart.includes('liter')) return numVal * multiplier;
  if (unitPart.includes('g') || unitPart.includes('ml')) return (numVal / 1000) * multiplier;
  return 0;
};
// --- NEW HELPERS ---
const formatTitleCase = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatWeekLabel = (key: string | null | undefined): string => {
  try {
    if (!key) return '';
    const str = key.toString();
    if (str.length !== 6) return str;
    const year = str.slice(0, 4);
    const week = parseInt(str.slice(4), 10);
    if (isNaN(week)) return str;
    return `W${week}, ${year}`;
  } catch (err) {
    console.error("[PriceTrendAnalysis] Error in formatWeekLabel:", err);
    return key ? key.toString() : '';
  }
};


// 1. Logic for Filtering/Charts: Prioritize End Date, fallback to Start Date
const getProductEffectiveDate = (p: FlyerProduct): Date | null => {
  try {
    if (p.end_date) {
      const d = parseISO(p.end_date);
      if (!isNaN(d.getTime())) return d;
    }
    if (p.start_date) {
      const d = parseISO(p.start_date);
      if (!isNaN(d.getTime())) return d;
    }
  } catch (err) {
    console.error("Error parsing date:", err);
  }
  return null;
};

// 2. Logic for Display in Table: Formats the range or shows "No date"
const formatTimelineDisplay = (start: string | null, end: string | null): string => {
  if (!start && !end) return 'No date';

  const formatDate = (d: string) => {
    try {
      const parsed = parseISO(d);
      if (!parsed || isNaN(parsed.getTime())) return '';
      return format(parsed, 'dd MMM yyyy');
    } catch {
      return '';
    }
  };

  const startFmt = start ? formatDate(start) : '';
  const endFmt = end ? formatDate(end) : '';

  if (startFmt && endFmt) return `${startFmt} - ${endFmt}`;
  if (endFmt) return `Ends ${endFmt}`;
  if (startFmt) return `Starts ${startFmt}`;

  return 'No date';
};

// --- NEW CUSTOM TOOLTIP COMPONENT ---
const CustomTooltip = ({ active, payload, label, metric, currency }: any) => {
  if (active && payload && payload.length) {
    // 1. Sort payload by value descending so top items appear first
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value);

    // 2. Slice to top 10
    const top10 = sortedPayload.slice(0, 10);
    const hiddenCount = sortedPayload.length - 10;

    return (
      <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="chart-tooltip text-white text-xs z-50">
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{formatWeekLabel(label)}</p>
        <div className="space-y-1">
          {top10.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-zinc-300 max-w-[120px] truncate" title={entry.name}>
                  {entry.name}
                </span>
              </div>
              <span className="font-mono font-medium">
                {metric === 'Discount' ? `${entry.value}%` : `${entry.value} ${currency}`}
              </span>
            </div>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #27272a' }} className="text-[10px] text-zinc-500 italic text-center">
            + {hiddenCount} other brands
          </div>
        )}
      </div>
    );
  }

  return null;
};

// --- NEW LOADER COMPONENT ---
const LoadingState = ({ height = "h-64" }: { height?: string }) => (
  <div className={`w-full ${height} flex flex-col items-center justify-center space-y-3 bg-zinc-900/30 rounded-lg border border-dashed border-zinc-800`}>
    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-zinc-500 text-xs font-mono animate-pulse">Syncing Market Data...</span>
  </div>
);


// --- CHART SUB-COMPONENT (UPDATED) ---
const TrendLineChart = ({
  data,
  lineKeys,
  metric,
  onChartClick,
  lineViewMode,
  getLineColor,
  height = 350,
  currency = '',
  isLoading = false // <--- Add this prop
}: any) => {

  // 1. Handle Loading State
  if (isLoading) {
    return <div style={{ height: `${height}px` }}><LoadingState height="h-full" /></div>;
  }

  if (!data || data.length === 0) {
    return <div style={{ height: `${height}px` }} className="w-full flex items-center justify-center text-zinc-500 bg-zinc-900/50 rounded-lg border border-zinc-800">No data available for this period.</div>;
  }

  return (
    <div style={{ height: `${height}px` }} className="w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          onClick={onChartClick}
          // margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dy={10} minTickGap={30} tickFormatter={formatWeekLabel} />
          <YAxis
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => metric === 'Discount' ? `${v}%` : `${v} ${currency}`}
          />
          <Tooltip
            content={<CustomTooltip metric={metric} currency={currency} />}
          />

          {/* Legend removed here, moved to parent button */}

          {lineKeys.map((key: string, idx: number) => (
            <Line
              key={key}
              type="natural"  // Changed from monotone to natural for smoother curves
              dataKey={key}
              stroke={getLineColor(key, idx)}
              strokeWidth={lineViewMode === 'average' ? 3 : 1.5}
              dot={{ r: 3, fill: getLineColor(key, idx), strokeWidth: 0 }} // Dots visible for all points
              activeDot={{ r: 5, fill: '#fff', stroke: getLineColor(key, idx), strokeWidth: 2 }}
              connectNulls={lineViewMode === 'average'}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- MAIN COMPONENT ---
const PriceTrendAnalysis = ({
  products,
  isLoading: externalIsLoading,
  primaryBrand,
  competitorBrand,
  competitorBrands = [],
  selectedRegion,
  selectedCategory,
  selectedCountry,
  selectedRetailer,
  selectedSubCategory,
  offerType,
  selectedBasePack,
  selectedQuantity
}: Props) => {

  // --- State ---
  const [fetchedData, setFetchedData] = useState<FlyerProduct[]>([]);
  const [internalIsLoading, setInternalIsLoading] = useState(false);
  const isLoading = externalIsLoading !== undefined ? externalIsLoading : internalIsLoading;
  const [metric, setMetric] = useState<MetricType>('Regular Price');
  const [lineViewMode, setLineViewMode] = useState<'average' | 'individual'>('average');
  const [isCustomPeriod, setIsCustomPeriod] = useState(false);

  // Custom Date Ranges
  const [p1Start, setP1Start] = useState<string>(format(subMonths(new Date(), 6), 'yyyy-MM-dd'));
  const [p1End, setP1End] = useState<string>(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [p2Start, setP2Start] = useState<string>(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [p2End, setP2End] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [showBrandList, setShowBrandList] = useState(false);
  // Weeks clicked on the trend chart accumulate, so several weeks can be
  // compared in the table at once. Clicking a selected week toggles it off.
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const toggleWeek = (week: string) =>
    setSelectedWeeks((prev) => prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week]);
  const [hoveredImage, setHoveredImage] = useState<{ url: string, x: number, y: number } | null>(null);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableSelectedRetailer, setTableSelectedRetailer] = useState('');
  const [tableStartDate, setTableStartDate] = useState('');
  const [tableEndDate, setTableEndDate] = useState('');

  const rawProducts = useMemo(() => {
    if (products && products.length > 0) return products;
    return fetchedData;
  }, [products, fetchedData]);

  // Process data to handle 'Distinct Offers' logic locally
  const processedData = useMemo(() => {
    if (!rawProducts || rawProducts.length === 0) return [];

    if (offerType === 'Distinct Offers') {
      const uniqueMap = new Map();
      rawProducts.forEach((item) => {
        // Create a unique key based on Brand + Product + Weight + Price
        const key = `${item.brand}_${item.product_name}_${item.weight_quantity}_${item.discounted_price}`.toLowerCase();

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      return Array.from(uniqueMap.values());
    }

    return rawProducts;
  }, [rawProducts, offerType]);


  const competitorBrandsStr = useMemo(() => {
    return JSON.stringify(competitorBrands);
  }, [competitorBrands]);

  const currentCurrency = useMemo(() => {
    // CHANGE: Use processedData here
    if (processedData.length > 0 && processedData[0].country) {
      return getCurrency(processedData[0].country);
    }
    return '';
  }, [processedData]); // Update dependency

  const brandsToDisplay = useMemo(() => {
    if (!primaryBrand) return [];

    const list = [primaryBrand];

    if (competitorBrand !== 'ALL_COMPETITORS' && competitorBrand !== 'MULTI_COMPETITORS') {
      if (competitorBrand && competitorBrand !== primaryBrand) {
        list.push(competitorBrand);
      }
    } else if (competitorBrand === 'MULTI_COMPETITORS') {
      competitorBrands.forEach(b => {
        if (b && b !== primaryBrand && !list.includes(b)) {
          list.push(b);
        }
      });
    } else {
      const brandCounts = new Map<string, number>();
      processedData.forEach(p => {
        if (p.brand && p.brand !== primaryBrand) {
          brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);
        }
      });

      const sortedOthers = Array.from(brandCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([b]) => b);

      const topOthers = sortedOthers.slice(0, 5);
      list.push(...topOthers);
    }

    return list.filter(Boolean).sort();
  }, [processedData, primaryBrand, competitorBrand, competitorBrandsStr]);

  // FIXED: previously lowercased every country (e.g. "Qatar" -> "qatar"), which
  // no longer matched the Title-Case values actually stored in the DB (and used
  // as keys in currencyMap above), so .eq('country', ...) silently matched zero rows.
  const getCountryKey = (c: string): string => {
    if (!c) return '';
    const trimmed = c.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'united arab emirates' || lower === 'uae') return 'United Arab Emirates';
    return trimmed;
  };

  // --- Fetch Logic ---
  useEffect(() => {
    // FIXED: previously checked `products !== undefined`, which also skipped the
    // fetch when the parent passed an empty array (e.g. while its own data was
    // still loading), permanently starving this component of data. Now we only
    // skip when the parent has actually provided usable data.
    if (products && products.length > 0) {
      console.log("[PriceTrendAnalysis] products passed via props, skipping internal DB fetch.");
      return;
    }

    const fetchData = async () => {
      console.log("[PriceTrendAnalysis] fetchData triggered with:", {
        primaryBrand,
        competitorBrand,
        competitorBrandsStr,
        selectedCategory,
        selectedCountry,
        selectedRegion,
        selectedRetailer,
        selectedSubCategory,
        offerType,
        selectedBasePack,
        selectedQuantity
      });

      if (!primaryBrand || !selectedCountry) {
        console.log("[PriceTrendAnalysis] Missing primaryBrand or selectedCountry, returning early.");
        return;
      }

      setInternalIsLoading(true);
      try {
        console.log("[PriceTrendAnalysis] Fetching fallback products for country:", selectedCountry, "category:", selectedCategory);

        // Server-side filtering via RPC: one round trip, uses the
        // flyer_products indexes, newest offers first when capped.
        const MAX_ROWS = 10000;
        const weightFilter = selectedQuantity || selectedBasePack;
        // Bound to the longest analysis window (52 weeks) so the row cap
        // never cuts into the analyzed range.
        const fromDate = format(new Date(Date.now() - 364 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        const { data, error } = await supabase.rpc('get_flyer_products_detail', {
          p_country: getCountryKey(selectedCountry),
          p_region: selectedRegion && selectedRegion !== 'All Regions' ? selectedRegion : null,
          p_retailer: selectedRetailer && selectedRetailer !== 'All Retailers' ? selectedRetailer : null,
          p_category: selectedCategory && selectedCategory !== 'All Categories' ? selectedCategory : null,
          p_subcategory: selectedSubCategory && selectedSubCategory !== 'All Sub Categories' ? selectedSubCategory : null,
          p_quantity: weightFilter || null,
          p_from_date: fromDate,
          p_max_rows: MAX_ROWS,
        });
        if (error) {
          console.error("[PriceTrendAnalysis] Fallback RPC error:", error);
          throw error;
        }

        // RPC returns one jsonb array (avoids PostgREST's 1000-row cap).
        // Tolerate the legacy row shape ([{ product: {...} }]) in case the
        // DB function hasn't been migrated yet.
        const raw: any[] = Array.isArray(data) ? data : [];
        const allData: any[] = raw.length && raw[0]?.product ? raw.map((r: any) => r.product) : raw;
        if (allData.length >= MAX_ROWS) {
          console.warn(`[PriceTrendAnalysis] Result truncated at ${MAX_ROWS} rows (newest first); narrow the filters for complete data.`);
        }

        console.log("[PriceTrendAnalysis] Fallback query succeeded:", {
          count: allData.length
        });

        setFetchedData((allData as any as FlyerProduct[]) || []);

      } catch (error) {
        console.error('[PriceTrendAnalysis] Error fetching data inside catch:', error);
      }
      finally {
        console.log("[PriceTrendAnalysis] Setting internalIsLoading to false in finally.");
        setInternalIsLoading(false);
      }
    };

    fetchData();

  }, [products, primaryBrand, competitorBrand, competitorBrandsStr, selectedCategory, selectedCountry, selectedRegion, selectedRetailer, selectedSubCategory, offerType, selectedBasePack, selectedQuantity]);

  const allProducts = useMemo(() => processedData, [processedData]);

  // --- Logic Helpers ---
  const calculateMetricValue = (p: FlyerProduct): number | null => {
    const reg = getPrice(p.regular_price);
    const disc = getPrice(p.discounted_price);
    switch (metric) {
      case 'Regular Price': return reg;
      case 'Offer Price': return disc;
      case 'Discount': return reg === 0 ? 0 : ((reg - disc) / reg) * 100;
      case 'Price Per Kg/Ltr':
        const weight = getWeightInUnits(p.weight_quantity);
        return weight <= 0 ? null : disc / weight;
      default: return 0;
    }
  };

  // Shared brand → color mapping: same selection-order colors as the
  // promo overall view and the competitor pricing tab.
  const lineBrandColorMap = useMemo(
    () => buildBrandColorMap(primaryBrand, [...competitorBrands, competitorBrand]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primaryBrand, competitorBrandsStr, competitorBrand],
  );

  const getLineColor = (key: string, idx: number) => {
    if (key === 'Competitor Average') return '#f43f5e';
    return getBrandColor(lineBrandColorMap, key, idx).main;
  };

  // --- Data Processors ---
  const createFilteredData = (startDate: string, endDate: string) => {
    try {
      const parsedStart = parseISO(startDate);
      const parsedEnd = parseISO(endDate);

      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        console.warn("[PriceTrendAnalysis] Invalid date range provided:", { startDate, endDate });
        return { filteredList: [], chartData: [] };
      }

      const start = startOfDay(parsedStart);
      const end = endOfDay(parsedEnd);

      // CHANGED: Use getProductEffectiveDate and filter out nulls
      const filtered = allProducts.filter(p => {
        const pDate = getProductEffectiveDate(p);
        if (!pDate) return false; // Skip if "No date"

        // new
        const isCat = !selectedCategory
          || selectedCategory === 'All Categories'
          || p.category?.trim().toLowerCase().includes(selectedCategory.trim().toLowerCase());
        return isWithinInterval(pDate, { start, end }) && isCat;
      }).sort((a, b) => {
        // Sort safely
        const dateA = getProductEffectiveDate(a)?.getTime() || 0;
        const dateB = getProductEffectiveDate(b)?.getTime() || 0;
        return dateA - dateB;
      });

      const dateMap = new Map<string, any>();
      filtered.forEach(p => {
        // const pDate = getProductDate(p.offer_timeline, p.created_at);
        const pDate = getProductEffectiveDate(p)!; // We know it's not null here due to filter above
        const year = getYear(pDate);
        const week = getISOWeek(pDate);
        const weekStr = week < 10 ? `0${week}` : `${week}`;
        const dateKey = `${year}${weekStr}`;

        if (!dateMap.has(dateKey)) dateMap.set(dateKey, { name: dateKey, _count: {} });

        const entry = dateMap.get(dateKey);
        const val = calculateMetricValue(p);

        if (val !== null && p.brand && brandsToDisplay.includes(p.brand)) {
          const label = lineViewMode === 'average'
            ? (p.brand === primaryBrand ? primaryBrand : 'Competitor Average')
            : p.brand;
          if (!entry[label]) { entry[label] = 0; entry._count[label] = 0; }
          entry[label] += val;
          entry._count[label] += 1;
        }
      });

      const chartData = Array.from(dateMap.values()).map(point => {
        Object.keys(point._count).forEach(key => {
          point[key] = parseFloat((point[key] / point._count[key]).toFixed(2));
        });
        delete point._count;
        return point;
      }).sort((a, b) => parseInt(a.name) - parseInt(b.name));

      return { filteredList: filtered, chartData };
    } catch (err) {
      console.error("[PriceTrendAnalysis] Error in createFilteredData:", err);
      return { filteredList: [], chartData: [] };
    }
  };

  // 1. Default Data (Latest 52 weeks)
  const defaultData = useMemo(() => {
    const end = format(new Date(), 'yyyy-MM-dd');
    const start = format(subWeeks(new Date(), 52), 'yyyy-MM-dd');
    return createFilteredData(start, end);
  }, [allProducts, selectedCategory, metric, lineViewMode, primaryBrand, competitorBrand]);

  // 2. Custom Periods Data
  const period1Data = useMemo(() => createFilteredData(p1Start, p1End), [allProducts, selectedCategory, metric, lineViewMode, p1Start, p1End, primaryBrand, competitorBrand]);
  const period2Data = useMemo(() => createFilteredData(p2Start, p2End), [allProducts, selectedCategory, metric, lineViewMode, p2Start, p2End, primaryBrand, competitorBrand]);

  // Table Retailer options (all unique retailers in fetched dataset)
  const tableRetailerOptions = useMemo(() => {
    const baseList = isCustomPeriod ? [...period1Data.filteredList, ...period2Data.filteredList] : defaultData.filteredList;
    const retailers = new Set<string>();
    baseList.forEach(p => {
      if (p.mart_name) retailers.add(p.mart_name);
    });
    return Array.from(retailers).sort();
  }, [defaultData, period1Data, period2Data, isCustomPeriod]);

  // Table Data
  const currentTableData = useMemo(() => {
    let baseList = isCustomPeriod ? [...period1Data.filteredList, ...period2Data.filteredList] : defaultData.filteredList;

    // 1. Filter by selected chart week
    if (selectedWeeks.length > 0) {
      baseList = baseList.filter(p => {
        const pDate = getProductEffectiveDate(p);
        if (!pDate) return false;
        const year = getYear(pDate);
        const week = getISOWeek(pDate);
        const weekStr = week < 10 ? `0${week}` : `${week}`;
        return selectedWeeks.includes(`${year}${weekStr}`);
      });
    }

    // 2. Filter by search query (case-insensitive description/retailer/product search)
    if (tableSearchQuery) {
      const q = tableSearchQuery.trim().toLowerCase();
      baseList = baseList.filter(p => {
        return (
          p.offer_name?.toLowerCase().includes(q) ||
          p.mart_name?.toLowerCase().includes(q) ||
          p.product_name?.toLowerCase().includes(q)
        );
      });
    }

    // 3. Filter by retailer selection
    if (tableSelectedRetailer) {
      baseList = baseList.filter(p => p.mart_name === tableSelectedRetailer);
    }

    // 3.5. Filter by table start date / end date range
    if (tableStartDate || tableEndDate) {
      const start = tableStartDate ? startOfDay(parseISO(tableStartDate)) : null;
      const end = tableEndDate ? endOfDay(parseISO(tableEndDate)) : null;

      baseList = baseList.filter(p => {
        const pDate = getProductEffectiveDate(p);
        if (!pDate) return false;

        if (start && pDate < start) return false;
        if (end && pDate > end) return false;
        return true;
      });
    }

    // 4. Sort safely descending by date
    return baseList.sort((a, b) => {
      const dateA = getProductEffectiveDate(a)?.getTime() || 0;
      const dateB = getProductEffectiveDate(b)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [defaultData, period1Data, period2Data, isCustomPeriod, selectedWeeks, tableSearchQuery, tableSelectedRetailer, tableStartDate, tableEndDate]);

  // Chart Keys
  const getKeys = (data: any[]) => {
    if (!data.length) return [];
    const keys = new Set<string>();
    data.forEach(d => Object.keys(d).forEach(k => { if (k !== 'name' && k !== '_count') keys.add(k); }));
    return Array.from(keys);
  };
  const activeLineKeys = useMemo(() => {
    if (lineViewMode === 'average') {
      return [primaryBrand, 'Competitor Average'].filter(Boolean);
    }
    return brandsToDisplay;
  }, [lineViewMode, primaryBrand, brandsToDisplay]);

  // Bar Chart Data (Only needed if !isCustomPeriod)
  const barChartData = useMemo(() => {
    if (isCustomPeriod) return [];

    const today = startOfDay(new Date());
    const periods = [
      { key: 'latest4', label: 'Latest 4 weeks', start: subDays(today, 27) },
      { key: 'latest12', label: 'Latest 12 weeks', start: subDays(today, 84) },
      { key: 'ytd', label: 'YTD', start: startOfYear(today) },
      { key: 'latest52', label: 'Latest 52 weeks', start: subDays(today, 364) },
    ];

    return brandsToDisplay.map(brandName => {
      const dataPoint: any = { name: brandName };

      periods.forEach(period => {
        const matches = allProducts.filter(p => {
          const pDate = getProductEffectiveDate(p);
          if (!pDate) return false;
          // new
          const isCat = !selectedCategory
            || selectedCategory === 'All Categories'
            || p.category?.trim().toLowerCase().includes(selectedCategory.trim().toLowerCase());
          const isBrandMatch = p.brand === brandName;

          return isBrandMatch &&
            isWithinInterval(pDate, { start: period.start, end: today }) &&
            isCat;
        });

        if (matches.length === 0) {
          dataPoint[period.key] = 0;
        } else {
          let sum = 0, count = 0;
          matches.forEach(p => {
            const val = calculateMetricValue(p);
            if (val !== null) { sum += val; count++; }
          });
          dataPoint[period.key] = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;
        }
      });
      return dataPoint;
    });
  }, [allProducts, metric, primaryBrand, brandsToDisplay, selectedCategory, isCustomPeriod]);

  return (
    <div className="space-y-6 pb-10 font-sans text-zinc-300 animate-in fade-in duration-500">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* .thin-scrollbar now lives in global.css — other pages use it too. */

        /* Hide default calendar icon but keep it clickable to open native date picker */
        input[type="date"]::-webkit-calendar-picker-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: auto;
          height: auto;
          background: transparent;
          color: transparent;
          cursor: pointer;
          opacity: 0;
          z-index: 20;
        }
      `}</style>
      {/* --- HEADER / CONTROLS CARD --- */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 shadow-lg">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">

          {/* Left Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-semibold uppercase">Pricing Trend On:</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricType)}
              className="bg-zinc-800 border border-zinc-700 text-gray-200 text-xs rounded px-2.5 py-1.5 focus:ring-1 focus:ring-purple-500 outline-none cursor-pointer"
            >
              <option value="Regular Price">Regular Price</option>
              <option value="Offer Price">Offer Price</option>
              <option value="Price Per Kg/Ltr">Price Per Kg/Ltr</option>
              <option value="Discount">Discount</option>
            </select>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-semibold uppercase">Custom Time Period:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isCustomPeriod}
                onChange={() => setIsCustomPeriod(!isCustomPeriod)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        {/* Date Pickers (Custom Period ON) */}
        {isCustomPeriod && (
          <div className="pt-3 flex flex-wrap justify-between items-center gap-4 animate-in slide-in-from-top-2 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 font-semibold uppercase">Time Period 1:</span>
              <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 w-[145px]">
                <input type="date" value={p1Start} onChange={(e) => setP1Start(e.target.value)} className="bg-transparent text-xs text-gray-200 font-mono focus:outline-none w-full cursor-pointer relative z-10" />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
              </div>
              <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 w-[145px]">
                <input type="date" value={p1End} onChange={(e) => setP1End(e.target.value)} className="bg-transparent text-xs text-gray-200 font-mono focus:outline-none w-full cursor-pointer relative z-10" />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 font-semibold uppercase">Time Period 2:</span>
              <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 w-[145px]">
                <input type="date" value={p2Start} onChange={(e) => setP2Start(e.target.value)} className="bg-transparent text-xs text-gray-200 font-mono focus:outline-none w-full cursor-pointer relative z-10" />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
              </div>
              <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 w-[145px]">
                <input type="date" value={p2End} onChange={(e) => setP2End(e.target.value)} className="bg-transparent text-xs text-gray-200 font-mono focus:outline-none w-full cursor-pointer relative z-10" />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* SECTION 1: BAR CHART (Only when Custom Period is OFF) */}
        {!isCustomPeriod && (
          <section className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg p-6">
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-semibold text-white">
                Average {metric === 'Discount' ? 'Discount (%)' : metric}
              </h3>
              <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-400">
                {PERIOD_BARS.map(({ key, label, from }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: from }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[250px] w-full">
              {isLoading ? (
                <LoadingState height="h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                    <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis
                      stroke="#71717a"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => metric === 'Discount' ? `${v}%` : `${v} ${currentCurrency}`}
                    />
                    <Tooltip
                      cursor={{ fill: '#3f3f46', opacity: 0.3 }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const formatVal = (v: any) => typeof v === 'number' ? (metric === 'Discount' ? `${v.toFixed(1)}%` : `${v.toFixed(1)} ${currentCurrency}`) : 'N/A';
                        return (
                          <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="chart-tooltip text-white text-xs z-50">
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</div>
                            {payload.map((entry: any, index: number) => (
                              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: 2, background: entry.color || entry.fill }} />
                                  <span style={{ color: '#a1a1aa', fontSize: 12 }}>{entry.name}</span>
                                </div>
                                <span style={{ color: '#fff', fontWeight: 700 }}>{formatVal(entry.value)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <defs>
                      {PERIOD_BARS.map(({ key, from, to }) => (
                        <linearGradient key={key} id={`barGrad-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={from} />
                          <stop offset="100%" stopColor={to} />
                        </linearGradient>
                      ))}
                    </defs>
                    {PERIOD_BARS.map(({ key, label, from }) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={label}
                        fill={`url(#barGrad-${key})`}
                        radius={[6, 6, 0, 0]}
                        barSize={28}
                        animationDuration={800}
                        label={{ position: 'top', fill: from, fontSize: 10, fontWeight: 600, formatter: (v: number) => v > 0 ? (metric === 'Discount' ? `${Math.round(v)}%` : v.toFixed(1)) : '' }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        )}

        {/* SECTION 2: LINE CHARTS */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg overflow-visible relative p-6 space-y-8">

          {/* Header for Line Chart Section */}
          <div className="flex flex-wrap justify-between items-center border-b border-zinc-800 pb-4 gap-4">

            {/* LEFT SIDE: Controls Container */}
            <div className="flex flex-wrap items-center gap-4 relative">
              {/* 2. NEW: Brands Dropdown Button */}
              <div className="relative">
                <button
                  onClick={() => setShowBrandList(!showBrandList)}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider text-zinc-300 px-4 py-1.5 rounded-lg border border-zinc-700 transition-all"
                >
                  <span>View Brands ({activeLineKeys.length})</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showBrandList ? 'rotate-180' : ''}`} />
                </button>

                {/* The Scroller Popup */}
                {showBrandList && (
                  <div className="absolute top-full left-0 mt-2 z-50 w-64 max-h-[250px] overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl p-2 no-scrollbar animate-in slide-in-from-top-2 fade-in">
                    {activeLineKeys.map((key: string, idx: number) => (
                      <div key={key} className="flex items-center justify-between py-2 px-3 hover:bg-zinc-900 rounded group transition-colors border-b border-zinc-900 last:border-0">
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate flex-1 pr-2" title={key}>
                          {key}
                        </span>
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 border border-white/10 shadow-sm"
                          style={{ backgroundColor: getLineColor(key, idx) }}
                        ></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Average vs Individual Line Toggle */}
              <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setLineViewMode('average')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${lineViewMode === 'average'
                    ? 'bg-purple-600 text-white shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-250'
                    }`}
                >
                  Average Lines
                </button>
                <button
                  onClick={() => setLineViewMode('individual')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${lineViewMode === 'individual'
                    ? 'bg-purple-600 text-white shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-250'
                    }`}
                >
                  Individual Lines
                </button>
              </div>
            </div>

            {/* RIGHT SIDE: Clear Filter */}
            {selectedWeeks.length > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <span className="text-xs text-emerald-400 font-medium">
                  Filtered by {selectedWeeks.length === 1 ? `Week: ${formatWeekLabel(selectedWeeks[0])}` : `${selectedWeeks.length} weeks`}
                </span>
                <button onClick={() => setSelectedWeeks([])} className="text-xs bg-red-900/50 text-red-200 px-2 py-1 rounded hover:bg-red-900 border border-red-800">Clear</button>
              </div>
            )}
          </div>

          {!isCustomPeriod ? (
            // SINGLE VIEW
            <TrendLineChart
              isLoading={isLoading} // <--- Add this
              data={defaultData.chartData}
              lineKeys={activeLineKeys}
              metric={metric}
              onChartClick={(data: any) => data && data.activeLabel && toggleWeek(data.activeLabel)}
              lineViewMode={lineViewMode}
              getLineColor={getLineColor}
              height={400}
              currency={currentCurrency}
            />
          ) : (
            // DUAL VIEW
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center border-b border-zinc-800 pb-2">Timeperiod 1 Trendline</h4>
                <TrendLineChart
                  isLoading={isLoading} // <--- Add this
                  data={period1Data.chartData}
                  lineKeys={activeLineKeys}
                  metric={metric}
                  onChartClick={(data: any) => data && data.activeLabel && toggleWeek(data.activeLabel)}
                  lineViewMode={lineViewMode}
                  getLineColor={getLineColor}
                  height={300}
                  currency={currentCurrency}
                />
              </div>

              <div className="w-full h-[1px] bg-zinc-800"></div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center border-b border-zinc-800 pb-2">Timeperiod 2 Trendline</h4>
                <TrendLineChart
                  isLoading={isLoading} // <--- Add this
                  data={period2Data.chartData}
                  lineKeys={activeLineKeys}
                  metric={metric}
                  onChartClick={(data: any) => data && data.activeLabel && toggleWeek(data.activeLabel)}
                  lineViewMode={lineViewMode}
                  getLineColor={getLineColor}
                  height={300}
                  currency={currentCurrency}
                />
              </div>
            </>
          )}
        </section>

        {/* SECTION 3: TABLE */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg overflow-hidden relative">
          {hoveredImage && (
            <div
              className="fixed z-50 pointer-events-none rounded-lg border-2 border-white shadow-2xl bg-black overflow-hidden flex flex-col items-center"
              style={{
                left: hoveredImage.x + 20,
                top: hoveredImage.y - 120,
                width: '200px',
              }}
            >
              <img src={hoveredImage.url} alt="Flyer" className="w-full h-auto object-cover" />
              <div className="bg-zinc-900 w-full text-center py-1 text-[10px] text-zinc-300 font-mono">Flyer Preview</div>
            </div>
          )}
          {/* LOCAL TABLE FILTER BAR */}
          <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">

              {/* Search input */}
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search table..."
                  value={tableSearchQuery}
                  onChange={(e) => setTableSearchQuery(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors placeholder-zinc-500"
                />
                {tableSearchQuery && (
                  <button
                    onClick={() => setTableSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Retailer select */}
              <div className="relative">
                <select
                  value={tableSelectedRetailer}
                  onChange={(e) => setTableSelectedRetailer(e.target.value)}
                  className="appearance-none bg-zinc-800 border border-zinc-700 text-zinc-350 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors cursor-pointer"
                >
                  <option value="">All Retailers</option>
                  {tableRetailerOptions.map(r => (
                    <option key={r} value={r}>{formatTitleCase(r)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>

              {/* Offer Date range picker */}
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 w-[145px]">
                  <input
                    type="date"
                    value={tableStartDate}
                    onChange={(e) => setTableStartDate(e.target.value)}
                    className="bg-transparent text-xs text-gray-250 font-mono focus:outline-none w-full cursor-pointer relative z-10"
                  />
                  <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
                </div>
                <span className="text-zinc-600 text-xs">-</span>
                <div className="relative flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 w-[145px]">
                  <input
                    type="date"
                    value={tableEndDate}
                    onChange={(e) => setTableEndDate(e.target.value)}
                    className="bg-transparent text-xs text-gray-250 font-mono focus:outline-none w-full cursor-pointer relative z-10"
                  />
                  <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none z-0" />
                </div>
              </div>

              {/* Selected Chart Week Info */}
              {selectedWeeks.map((week) => (
                <div key={week} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-950/30 border border-purple-900/50 text-[11px] text-purple-400 font-medium animate-in fade-in">
                  <span>Week: {formatWeekLabel(week)}</span>
                  <button
                    onClick={() => toggleWeek(week)}
                    aria-label={`Remove week ${formatWeekLabel(week)}`}
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Clear All button */}
            {(tableSearchQuery || tableSelectedRetailer || selectedWeeks.length > 0 || tableStartDate || tableEndDate) && (
              <button
                onClick={() => {
                  setTableSearchQuery('');
                  setTableSelectedRetailer('');
                  setSelectedWeeks([]);
                  setTableStartDate('');
                  setTableEndDate('');
                }}
                className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 self-start md:self-auto"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto thin-scrollbar rounded-lg border border-zinc-800">
            <table className="w-full text-left border-collapse min-w-[1400px] text-xs">
              <thead className="bg-zinc-900/80 backdrop-blur text-zinc-300 font-semibold sticky top-0 z-10 shadow-sm border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Offer Description</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Retailer Name</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Brand</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Offer ID <Info className="inline w-3.5 h-3.5 ml-1 text-zinc-500 align-text-bottom" /></th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Product</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Weight</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-right whitespace-nowrap">Promo Price</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-right whitespace-nowrap">Regular Price</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-right whitespace-nowrap">Offer Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-12">
                      <LoadingState height="h-32" />
                    </td>
                  </tr>
                ) : currentTableData.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-zinc-500">No records found. Click a graph point or adjust filters.</td></tr>
                ) : (
                  currentTableData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/40 transition-colors border-b border-zinc-900/60 last:border-b-0">
                      <td className="px-4 py-3.5 font-semibold text-zinc-100 truncate max-w-[220px]" title={item.offer_name || ''}>
                        {formatTitleCase(item.offer_name)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                          {formatTitleCase(item.mart_name)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-purple-950/40 text-purple-300 border border-purple-900/30">
                          {formatTitleCase(item.brand) || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className="font-mono text-[11px] font-semibold text-purple-400 bg-purple-950/40 border border-purple-900/30 px-2 py-0.5 rounded cursor-help hover:text-purple-300 transition-colors"
                          onMouseEnter={(e) => item.image_path && setHoveredImage({ url: item.image_path, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHoveredImage(null)}
                        >
                          {item.id}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-300 truncate max-w-[180px]" title={item.product_name || ''}>
                        {formatTitleCase(item.product_name)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900/50 text-zinc-400 border border-zinc-800">
                          {item.weight_quantity || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-400 font-mono text-[13px] whitespace-nowrap">
                        {getPrice(item.discounted_price).toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal ml-0.5">{currentCurrency}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-zinc-400 text-[13px] whitespace-nowrap">
                        {getPrice(item.regular_price) > 0 ? (
                          <>{getPrice(item.regular_price).toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal ml-0.5">{currentCurrency}</span></>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-zinc-400 text-[11px] tracking-tight whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-zinc-550" />
                          <span>{formatTimelineDisplay(item.start_date, item.end_date)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PriceTrendAnalysis;