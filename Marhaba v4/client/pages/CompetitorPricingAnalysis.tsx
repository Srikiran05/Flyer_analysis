import { FC, useMemo, useState, useRef, useEffect, Fragment } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Line,
  ScatterChart,
  Scatter
} from 'recharts';

import { supabase } from '@/lib/supabaseClient';
import { buildBrandColorMap, getBrandColor } from '@/utils/brandColors';

// --- Custom Tooltip for Competitor Pricing ---
const CustomTooltip = ({ active, payload, label, priceOption, currency, myBrand }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formatVal = (v: number) => {
      if (priceOption === 'discount') return `${v.toFixed(1)}%`;
      return `${currency} ${v.toFixed(1)}`;
    };
    const title = priceOption === 'regular' ? 'Regular Price' : 
                  priceOption === 'discount' ? 'Discount' : 
                  priceOption === 'perkg' ? 'Price Per Kg/Ltr' : 'Offer Price';
    const isMyBrand = label === myBrand;
    const dotColor = isMyBrand ? '#8b5cf6' : '#ea580c';
    return (
      <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="text-white text-xs z-50">
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: dotColor }} />
          {label}
        </p>
        <div className="space-y-1.5">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#a1a1aa' }}>{title}</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{formatVal(data.price)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#a1a1aa' }}>Offer Count</span>
            <span style={{ color: '#d4d4d8', fontWeight: 500 }}>{data.offerCount}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// --- Custom Tooltip for Scatter Plot ---
const CustomScatterTooltip = ({ active, payload, priceOption, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formatVal = (v: number) => {
      if (priceOption === 'discount') return `${v.toFixed(1)}%`;
      return `${currency} ${v.toFixed(1)}`;
    };
    const title = priceOption === 'regular' ? 'Regular Price' : 
                  priceOption === 'discount' ? 'Discount' : 
                  priceOption === 'perkg' ? 'Price Per Kg/Ltr' : 'Offer Price';
    return (
      <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="text-white text-xs z-50">
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>
          {data.brand}
        </p>
        <div className="space-y-1.5">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: '#a1a1aa' }}>{title}</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{formatVal(data.price)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: '#a1a1aa' }}>Offer Count</span>
            <span style={{ color: '#fb923c', fontWeight: 700 }}>{data.offerCount}</span>
          </div>
          {data.offerCount === 1 && data.offers && data.offers.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
                <span style={{ color: '#a1a1aa' }}>Product</span>
                <span style={{ color: '#fff', fontWeight: 600, textAlign: 'right' }} className="truncate max-w-[120px]">{data.offers[0].productName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ color: '#a1a1aa' }}>Retailer</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{data.offers[0].retailer}</span>
              </div>
            </>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: '10px', fontStyle: 'italic', marginTop: '6px', borderTop: '1px dashed #27272a', paddingTop: '6px' }}>
              Click bubble to view all {data.offerCount} promotions below
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// --- Custom Bar Label for Average Pricing ---
const CustomBarLabel = (props: any) => {
  const { x, y, width, value, index, competitorChartData, myBrand, selectedPriceOption } = props;
  if (value === undefined || value === null || !competitorChartData) return null;
  const entry = competitorChartData[index];
  if (!entry) return null;
  const isMyBrand = entry.brand === myBrand;
  const labelColor = isMyBrand ? '#a78bfa' : '#fb923c';
  const formattedValue = selectedPriceOption === 'discount' ? `${Math.round(value)}%` : value.toFixed(1);
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={labelColor}
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
    >
      {formattedValue}
    </text>
  );
};


// --- Custom Tooltip for Retailer Activities composed chart ---
const RetailerTooltip = ({ active, payload, label, currency, priceOption, barColor = '#a78bfa' }: any) => {
  if (active && payload && payload.length) {
    const offerD = payload.find((p: any) => p.dataKey === 'offer_count');
    
    const key = priceOption === 'regular' ? 'avg_regular_price' :
                priceOption === 'discount' ? 'avg_discount' :
                'avg_offer_price';
    const avgD = payload.find((p: any) => p.dataKey === key);
    
    const isDiscount = priceOption === 'discount';
    const labelTitle = isDiscount ? 'Average Discount' : 'Average Price';
    
    return (
      <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="text-white text-xs z-50">
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</p>
        <div className="space-y-2">
          {offerD && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: barColor }} />
                <span style={{ color: '#a1a1aa' }}>Offer Count</span>
              </div>
              <span style={{ color: '#fff', fontWeight: 700 }}>{offerD.value}</span>
            </div>
          )}
          {avgD && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: '#f97316' }} />
                <span style={{ color: '#a1a1aa' }}>{labelTitle}</span>
              </div>
              <span style={{ color: '#f97316', fontWeight: 700 }}>
                {isDiscount ? `${Number(avgD.value).toFixed(1)}%` : `${currency} ${Number(avgD.value).toFixed(1)}`}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};



// --- NEW: Reusable Loading Spinner ---
const LoadingSpinner = () => (
  <div className="flex flex-col justify-center items-center h-full w-full min-h-[300px] animate-fade-in">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mb-4"></div>
    <span className="text-gray-400 text-sm animate-pulse">Analyzing market data...</span>
  </div>
);


interface CompetitorPricingAnalysisProps {
  myBrand: string;
  selectedCompetitor?: string;
  selectedCompetitors?: string[];
  selectedCountry: string;
  selectedRegion: string;
  selectedRetailer?: string;
  selectedCategory: string;

  selectedSubCategories?: string[];
  selectedPackSizes?: string[];
//   selectedQuantities?: string[];
  isDistinctView?: boolean;

  selectedPeriod?: string; 
  onPeriodChange?: (period: 'latest4Weeks' | 'latest12Weeks' | 'ytd' | 'latest52Weeks') => void;
  hasAppliedFilters?: boolean; // <--- ADD THIS LINE
  isLoading?: boolean; // <--- ADD THIS LINE
  products?: any[];
  isLoadingProducts?: boolean;
}

// --- Options ---
const priceOptions = [
    { label: 'Offer Price', value: 'offer' },
    { label: 'Regular Price', value: 'regular' },
    { label: 'Price per Kg/Ltr', value: 'perkg' },
    { label: 'Discount (%)', value: 'discount' },
];

const currencyMap: Record<string, string> = {
  "Qatar": "QAR",
  "Kuwait": "KWD",
  "Oman": "OMR",
  "Saudi Arabia": "SAR",
  "United Arab Emirates": "AED"
};
const ALL_COMPETITORS = 'ALL_COMPETITORS';

const CompetitorPricingAnalysis: FC<CompetitorPricingAnalysisProps> = ({ 
  myBrand, 
  selectedCompetitor = '',
  selectedCompetitors = [],
  selectedCountry, 
  selectedRegion,
  selectedRetailer = '',
  selectedCategory,
  selectedSubCategories = [],
  selectedPackSizes = [],
//   selectedQuantities = [],
  isDistinctView = false,
  selectedPeriod = 'latest52Weeks',
  onPeriodChange,
  hasAppliedFilters = false,
  isLoading = false, // <--- ADD THIS DEFAULT VALUE
  products = [],
  isLoadingProducts = false,
}) => {
    const normalizedCompetitors = selectedCompetitors.length > 0
      ? selectedCompetitors
      : (selectedCompetitor ? [selectedCompetitor] : [ALL_COMPETITORS]);
    const isAllCompetitorsMode = normalizedCompetitors.includes(ALL_COMPETITORS);

    // Shared brand → color mapping: same selection-order colors as the
    // promo overall view, so a brand keeps its color across tabs.
    const brandColorMap = useMemo(
      () => buildBrandColorMap(myBrand, normalizedCompetitors.filter(c => c !== ALL_COMPETITORS)),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [myBrand, JSON.stringify(normalizedCompetitors)],
    );
    // SVG gradient id for a competitor brand; unknown brands fall back
    // to the generic orange gradient.
    const compGradId = (brand: string) => {
      const i = normalizedCompetitors.findIndex(
        b => b !== ALL_COMPETITORS && b.trim().toLowerCase() === (brand ?? '').trim().toLowerCase(),
      );
      return i >= 0 ? `compGrad${i}` : 'barGradOrange';
    };
    // --- State Management ---
    const [selectedPriceOption, setSelectedPriceOption] = useState('offer');
    const [brandSearch, setBrandSearch] = useState('');
    const [isAverageToggled, setIsAverageToggled] = useState(false);
    const [isDistributionView, setIsDistributionView] = useState(false);
    const [selectedPromotionDetails, setSelectedPromotionDetails] = useState<any[]>([]);
    const [expandedBrandSummary, setExpandedBrandSummary] = useState<Record<string, boolean>>({});
    const [selectedChartBrand, setSelectedChartBrand] = useState<string | null>(null);

    useEffect(() => {
        setSelectedPromotionDetails([]);
    }, [products]);

    // --- RPC Data State (Retailer Activity) ---
    const [retailerActivity, setRetailerActivity] = useState<any[]>([]);
    const [isLoadingRetailer, setIsLoadingRetailer] = useState(false);

    const retailerActivityRef = useRef<HTMLDivElement>(null);
    const pricingRpcRequestRef = useRef(0);
    const retailerRpcRequestRef = useRef(0);
    const retailerCacheRef = useRef<Map<string, any[]>>(new Map());
    const currentCurrency = currencyMap[selectedCountry] || 'AED';
    const getValueLabel = (val: number) => {
        if (selectedPriceOption === 'discount') return `${val.toFixed(1)}%`;
        // dynamically use the currency symbol
        return `${currentCurrency} ${val.toFixed(1)}`;
    };
    const parseNum = (val: string | number | null | undefined) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const clean = val.toString().replace(/[^\d.]/g, '');
        return parseFloat(clean) || 0;
    };

    const getCountryKey = (c: string): string => {
        if (!c) return '';
        const normalized = c.trim().toLowerCase();
        if (normalized === 'united arab emirates' || normalized === 'uae') return 'uae';
        return normalized;
    };

    // --- NEW: RPC DATA STATES ---
    const [rpcAggregations, setRpcAggregations] = useState<any[]>([]);
    const [rpcPackAggregations, setRpcPackAggregations] = useState<any[]>([]);
    // Whole-category aggregations (all brands) — used for the Average Line
    // when metric = Price per Kg, per requirement: category average.
    const [categoryAggregations, setCategoryAggregations] = useState<any[]>([]);
    const [isRpcLoading, setIsRpcLoading] = useState(false);
    const [rpcError, setRpcError] = useState<string | null>(null);

    // FETCH RPC DATA when filters or period changes
    useEffect(() => {
        if (!selectedCountry || !hasAppliedFilters || !myBrand) {
            setRpcAggregations([]);
            setRpcPackAggregations([]);
            setRpcError(null);
            setIsRpcLoading(false);
            return;
        }
        
        const controller = new AbortController();

        const fetchRpcData = async () => {
            setIsRpcLoading(true);
            setRpcError(null);
            try {
                let weeks = 52;
                if (selectedPeriod === 'latest4Weeks') weeks = 4;
                else if (selectedPeriod === 'latest12Weeks') weeks = 12;
                else if (selectedPeriod === 'latest52Weeks') weeks = 52;
                else if (selectedPeriod === 'ytd') {
                    const now = new Date();
                    const startOfYear = new Date(now.getFullYear(), 0, 1);
                    weeks = Math.max(1, Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 7)));
                }

                const brands = isAllCompetitorsMode
                    ? null
                    : Array.from(
                        new Set(
                            [myBrand, ...normalizedCompetitors]
                                .map((brand) => (brand || '').trim())
                                .filter(Boolean)
                        )
                    );

                const args = {
                    p_country: getCountryKey(selectedCountry),
                    p_region: selectedRegion || null,
                    p_category: selectedCategory || null,
                    p_subcategory: selectedSubCategories?.[0] || null,
                    p_retailer: selectedRetailer || null,
                    p_brands: brands,
                    p_quantity: selectedPackSizes?.[0] || null,
                    p_distinct_offers: isDistinctView,
                    p_period_weeks: weeks
                };

                const [chartRes, packRes, catRes] = await Promise.all([
                    supabase.rpc('get_competitor_pricing_aggregations', args).abortSignal(controller.signal),
                    supabase.rpc('get_competitor_pack_aggregations', args).abortSignal(controller.signal),
                    brands
                        ? supabase.rpc('get_competitor_pricing_aggregations', { ...args, p_brands: null }).abortSignal(controller.signal)
                        : Promise.resolve(null as any)
                ]);

                if (chartRes.error) {
                    throw chartRes.error;
                }
                setCategoryAggregations((catRes && !catRes.error ? catRes.data : chartRes.data) || []);
                if (packRes.error) {
                    throw packRes.error;
                }

                if (chartRes.data) {
                    setRpcAggregations(chartRes.data);
                } else {
                    setRpcAggregations([]);
                }
                if (packRes.data) {
                    setRpcPackAggregations(packRes.data);
                } else {
                    setRpcPackAggregations([]);
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                    return;
                }
                setRpcAggregations([]);
                setRpcPackAggregations([]);
                const message = err instanceof Error ? err.message : 'Unknown RPC error';
                setRpcError(`Unable to load pricing analysis from Supabase RPC: ${message}`);
            } finally {
                if (!controller.signal.aborted) {
                    setIsRpcLoading(false);
                }
            }
        };
        
        fetchRpcData();

        return () => {
            controller.abort();
        };
    }, [
        myBrand,
        selectedCompetitor,
        JSON.stringify(normalizedCompetitors),
        isAllCompetitorsMode,
        selectedCountry,
        selectedRegion,
        selectedRetailer,
        selectedCategory,
        selectedPeriod,
        isDistinctView,
        hasAppliedFilters,
        JSON.stringify(selectedSubCategories),
        JSON.stringify(selectedPackSizes)
    ]);

    const targetBrands = useMemo(() => {
        if (isAllCompetitorsMode) return new Set<string>();
        const brands = [myBrand, ...normalizedCompetitors]
            .map((brand) => (brand || '').trim())
            .filter(Boolean);
        return new Set(brands);
    }, [myBrand, selectedCompetitor, JSON.stringify(normalizedCompetitors), isAllCompetitorsMode]);

    const filteredRpcAggregations = useMemo(() => {
        if (targetBrands.size === 0) return rpcAggregations;
        return rpcAggregations.filter((row) => targetBrands.has((row.brand_name || '').trim()));
    }, [rpcAggregations, targetBrands]);

    const filteredRpcPackAggregations = useMemo(() => {
        if (targetBrands.size === 0) return rpcPackAggregations;
        return rpcPackAggregations.filter((row) => targetBrands.has((row.brand_name || '').trim()));
    }, [rpcPackAggregations, targetBrands]);

    const competitorChartData = useMemo(() => {
        const search = brandSearch.trim().toLowerCase();
        return filteredRpcAggregations.map(d => {
            if (!d) return null;
            let val = 0;
            switch (selectedPriceOption) {
                case 'regular': val = Number(d.reg_avg) || 0; break;
                case 'discount': val = Number(d.discount_avg) || 0; break;
                case 'perkg': val = Number(d.perkg_avg) || 0; break;
                case 'offer': default: val = Number(d.offer_avg) || 0; break;
            }
            return {
                brand: d.brand_name || 'Unknown',
                price: Number(val) || 0,
                offerCount: Number(d.offer_count) || 0
            };
        })
        .filter((item): item is { brand: string; price: number; offerCount: number } => Boolean(item) && (!search || (item.brand || '').toLowerCase().includes(search)))
        .sort((a, b) => b.price - a.price);
    }, [selectedPriceOption, filteredRpcAggregations, brandSearch]);

    const scatterData = useMemo(() => {
        if (!products || products.length === 0) return [];
        const activeBrandNames = new Set(competitorChartData.map(c => c.brand.trim().toLowerCase()));

        // Map brand name to its 1-based index in competitorChartData
        const brandIndexMap = new Map<string, number>();
        competitorChartData.forEach((c, idx) => {
            brandIndexMap.set(c.brand.trim().toLowerCase(), idx + 1);
        });

        const rawItems = products.map(p => {
            const brandName = (p.brand || 'Unknown').trim();
            const brandKey = brandName.toLowerCase();
            if (!activeBrandNames.has(brandKey)) return null;

            let priceVal = 0;
            switch (selectedPriceOption) {
                case 'regular': priceVal = parseNum(p.regular_price); break;
                case 'discount': {
                    const reg = parseNum(p.regular_price);
                    const disc = parseNum(p.discounted_price);
                    priceVal = reg > 0 ? ((reg - disc) / reg) * 100 : 0;
                    break;
                }
                case 'perkg': {
                    priceVal = parseNum(p.discounted_price); 
                    break;
                }
                case 'offer': 
                default: 
                    priceVal = parseNum(p.discounted_price); 
                    break;
            }

            if (priceVal <= 0) return null;

            return {
                id: p.id,
                brand: brandName,
                price: priceVal,
                retailer: p.mart_name || 'Unknown',
                startDate: p.start_date,
                endDate: p.end_date,
                imagePath: p.image_path,
                productName: p.product_name || 'Product'
            };
        }).filter((item): item is any => item !== null);

        // Group offers by brand and price for a clean single vertical line layout
        const groups: Record<string, { brand: string; price: number; offers: any[]; offerCount: number }> = {};
        for (const item of rawItems) {
            const roundedPrice = Number(item.price.toFixed(2));
            const key = `${item.brand.toLowerCase()}_${roundedPrice.toFixed(2)}`;
            if (!groups[key]) {
                groups[key] = {
                    brand: item.brand,
                    price: roundedPrice,
                    offers: [],
                    offerCount: 0
                };
            }
            groups[key].offers.push(item);
            groups[key].offerCount++;
        }

        return Object.values(groups).map(g => ({
            ...g,
            xCoord: brandIndexMap.get(g.brand.toLowerCase()) || 1
        }));
    }, [products, competitorChartData, selectedPriceOption, brandSearch]);

    const myBrandScatterData = useMemo(() => scatterData.filter(d => d.brand.toLowerCase() === myBrand.toLowerCase()), [scatterData, myBrand]);
    const competitorScatterData = useMemo(() => scatterData.filter(d => d.brand.toLowerCase() !== myBrand.toLowerCase()), [scatterData, myBrand]);

    const brandSummaryData = useMemo(() => {
        const brands: Record<string, Record<string, number[]>> = {};
        
        filteredRpcPackAggregations.forEach(row => {
            if (!row) return;
            const brand = (row.brand_name || 'Unknown').trim();
            const weight = row.weight_qty || 'N/A';

            if (!brands[brand]) {
                brands[brand] = {};
            }
            if (!brands[brand][weight]) {
                brands[brand][weight] = [];
            }

            brands[brand][weight].push({
                count: Number(row.offer_count) || 0,
                min: Number(row.min_price) || 0,
                max: Number(row.max_price) || 0
            } as any);
        });

        const search = brandSearch.trim().toLowerCase();
        return Object.keys(brands).map((brandName) => {
            const weightsObj = brands[brandName];
            const weightRows = Object.keys(weightsObj).map((weight) => {
                const vals = (weightsObj[weight] as any[]) || [];
                const totalCount = vals.reduce((sum, item) => sum + (item.count || 0), 0);
                const mins = vals.map((item) => item.min).filter(v => v > 0);
                const maxs = vals.map((item) => item.max).filter(v => v > 0);
                const minVal = mins.length > 0 ? Math.min(...mins) : 0;
                const maxVal = maxs.length > 0 ? Math.max(...maxs) : 0;
                return {
                    weight,
                    count: totalCount,
                    min: isFinite(minVal) ? minVal : 0,
                    max: isFinite(maxVal) ? maxVal : 0
                };
            });

            const validMins = weightRows.map((row) => row.min).filter(v => v > 0);
            const validMaxs = weightRows.map((row) => row.max).filter(v => v > 0);
            const overallMin = validMins.length > 0 ? Math.min(...validMins) : 0;
            const overallMax = validMaxs.length > 0 ? Math.max(...validMaxs) : 0;

            return {
                brand: brandName,
                count: weightRows.reduce((sum, row) => sum + (row.count || 0), 0),
                min: isFinite(overallMin) ? overallMin : 0,
                max: isFinite(overallMax) ? overallMax : 0,
                weights: weightRows
            };
        })
        .filter((row) => !search || (row.brand || '').toLowerCase().includes(search))
        .sort((a, b) => b.count - a.count);
    }, [filteredRpcPackAggregations, brandSearch]);
    
    // --- UI Calculations ---
    // Whole-category average for the current metric (all brands in the
    // category), weighted by each brand's offer count — not just the
    // brands selected on screen.
    const categoryAvg = useMemo(() => {
        const field = selectedPriceOption === 'regular' ? 'reg_avg' :
                      selectedPriceOption === 'discount' ? 'discount_avg' :
                      selectedPriceOption === 'perkg' ? 'perkg_avg' :
                      'offer_avg';
        let weighted = 0, count = 0;
        categoryAggregations.forEach((r: any) => {
            const v = Number(r[field]) || 0;
            const c = Number(r.offer_count) || 0;
            if (v > 0 && c > 0) { weighted += v * c; count += c; }
        });
        return count > 0 ? weighted / count : 0;
    }, [categoryAggregations, selectedPriceOption]);

    const averagePrice = useMemo(() => {
        if (isDistributionView) return 0;
        // Average line = whole-category average for the selected metric.
        // Fall back to the on-screen brands' mean if category data is empty.
        if (categoryAvg > 0) return categoryAvg;
        if (competitorChartData.length === 0) return 0;
        const total = competitorChartData.reduce((sum, item) => sum + item.price, 0);
        return total / competitorChartData.length;
    }, [competitorChartData, isDistributionView, categoryAvg]);

    const maxPrice = useMemo(() => {
        const data = competitorChartData;
        if (data.length === 0) return 100;
        const maxVal = Math.max(...data.map(d => d.price));
        return Math.ceil(maxVal * 1.1) || 100; 
    }, [competitorChartData]);
    
    const badgeTop = useMemo(() => {
        const maxValForCalc = maxPrice || 1;
        return 330 - 310 * (averagePrice / maxValForCalc) - 12;
    }, [averagePrice, maxPrice]);
    
    // Dynamic colors
    const brandColors: { [key: string]: string } = {
        [myBrand]: 'bg-purple-500 border-purple-400', 
    };
    const defaultColors = ['bg-blue-500 border-blue-400', 'bg-green-500 border-green-400', 'bg-orange-500 border-orange-400', 'bg-pink-500 border-pink-400'];

    // Bottom Chart Max Values — coerce to number to prevent NaN propagation
    const maxRetailerOfferCount = useMemo(() => Math.max(...retailerActivity.map(d => Number(d.offer_count) || 0), 0) + 1, [retailerActivity]);
    const maxRetailerAvgValue = useMemo(() => {
        const key = selectedPriceOption === 'regular' ? 'avg_regular_price' :
                    selectedPriceOption === 'discount' ? 'avg_discount' :
                    'avg_offer_price';
        return Math.max(...retailerActivity.map(d => Number(d[key]) || 0), 0) + 5;
    }, [retailerActivity, selectedPriceOption]);

    // --- EFFECT: Fetch Retailer Activity (RPC) ---
    // useEffect(() => {
    //     const fetchRetailerActivity = async () => {
    //         const target = selectedChartBrand;
    //         if (!target) return;

    //         setIsLoadingRetailer(true);
    //         const { data, error } = await supabase.rpc('get_retailer_activity', {
    //             target_brand: target,
    //             selected_country: selectedCountry,
    //         });

    //         if (data) setRetailerActivity(data);
    //         else if (error) console.error("Error fetching retailer activity:", error);
    //         setIsLoadingRetailer(false);
    //     };

    //     if (selectedCountry) fetchRetailerActivity();
    // // }, [selectedCountry, selectedRegion,selectedChartBrand, myBrand]);
    // // }, [selectedCountry, selectedChartBrand, myBrand]);
    //    }, [selectedCountry, selectedChartBrand]);

    // --- EFFECT: Fetch Retailer Activity (RPC) ---
// --- EFFECT: Fetch Retailer Activity (RPC) ---

    useEffect(() => {
        const controller = new AbortController();

        const fetchRetailerActivity = async () => {
            const target = selectedChartBrand;
            if (!target) return;

            const cacheKey = JSON.stringify({
                target,
                selectedCountry,
                selectedRegion,
                selectedCategory,
                selectedSubCategories,
                selectedPackSizes,
                isDistinctView
            });

            const cached = retailerCacheRef.current.get(cacheKey);
            if (cached) {
                setRetailerActivity(cached);
                setIsLoadingRetailer(false);
                return;
            }

            setIsLoadingRetailer(true);

            try {
                // RPC Call matching the SQL Signature
                const { data, error } = await supabase.rpc('get_retailer_activity', {
                    target_brand: target,
                    selected_country: getCountryKey(selectedCountry),
                    
                    // Wrap single strings into arrays for SQL
                    p_regions: selectedRegion ? [selectedRegion] : [],
                    p_categories: selectedCategory ? [selectedCategory] : [],
                    
                    // Pass arrays directly
                    p_subcategories: selectedSubCategories,
                    p_pack_sizes: selectedPackSizes,
                    
                    // Boolean toggle
                    p_distinct_only: isDistinctView
                }).abortSignal(controller.signal);

                if (error) throw error;
                
                // Only update state if data exists
                if (data) {
                    const parsedData = data.map((item: any) => ({
                        ...item,
                        avg_offer_price: item.avg_offer_price ? parseFloat(item.avg_offer_price) : 0,
                        avg_regular_price: item.avg_regular_price ? parseFloat(item.avg_regular_price) : 0,
                        avg_discount: item.avg_discount ? parseFloat(item.avg_discount) : 0,
                        offer_count: item.offer_count ? parseInt(item.offer_count, 10) : 0
                    }));
                    setRetailerActivity(parsedData);
                    retailerCacheRef.current.set(cacheKey, parsedData);
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                    return;
                }
                setRetailerActivity([]);
            } finally {
                // Ensure loading always turns off
                if (!controller.signal.aborted) {
                    setIsLoadingRetailer(false);
                }
            }
        };

        if (selectedCountry) fetchRetailerActivity();

        return () => {
            controller.abort();
        };
    }, [
        selectedCountry, 
        selectedChartBrand, 
        selectedRegion, 
        selectedCategory, 
        isDistinctView,
        // 🛑 CRITICAL FIX: Convert arrays to strings to prevent infinite loops
        JSON.stringify(selectedSubCategories),
        JSON.stringify(selectedPackSizes)
    ]);

    const handleChartBarClick = (brand: string, shouldScroll = true) => {
        // Toggle behavior: clicking the same brand deselects it
        if (selectedChartBrand === brand) {
            setSelectedChartBrand(null);
            setRetailerActivity([]);
            setIsLoadingRetailer(false);
            return;
        }
        setIsLoadingRetailer(true);
        setRetailerActivity([]);
        setSelectedChartBrand(brand);
        if (shouldScroll) {
            setTimeout(() => {
                retailerActivityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    const toggleBrandSummary = (brand: string) => {
        setExpandedBrandSummary(prev => ({ ...prev, [brand]: !prev[brand] }));
    };
    
    return (
        <>
            <div className="space-y-6">
                {/* --- Chart Section (Average Offer Price) --- */}
                <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8">
                    <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                        <div className="flex flex-wrap items-center gap-6">
                            <h2 className="text-lg font-semibold text-white">{isDistributionView ? 'Distribution Price Points' : 'Average Offer Price'}</h2>
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-zinc-400">Average Line</span>
                                    <button 
                                        type="button" 
                                        role="switch" 
                                        aria-checked={isAverageToggled} 
                                        onClick={() => setIsAverageToggled(!isAverageToggled)} 
                                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${isAverageToggled ? 'bg-purple-600' : 'bg-zinc-800'}`}
                                    >
                                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isAverageToggled ? 'transform translate-x-5' : ''}`}></div>
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-zinc-400">Distribution View</span>
                                    <button 
                                        type="button" 
                                        role="switch" 
                                        aria-checked={isDistributionView} 
                                        onClick={() => {
                                            setIsDistributionView(!isDistributionView);
                                        }} 
                                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${isDistributionView ? 'bg-orange-500' : 'bg-zinc-800'}`}
                                    >
                                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isDistributionView ? 'transform translate-x-5' : ''}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-3">
                            <input
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                                placeholder="Search brand (e.g. 1946)"
                                className="bg-zinc-800 px-3 py-2 border border-zinc-700 rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[220px]"
                            />
                            <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-md p-1">
                                <button 
                                    onClick={() => onPeriodChange?.('latest4Weeks')}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${selectedPeriod === 'latest4Weeks' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Latest 4 Weeks
                                </button>
                                <button 
                                    onClick={() => onPeriodChange?.('latest12Weeks')}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${selectedPeriod === 'latest12Weeks' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Latest 12 Weeks
                                </button>
                                <button 
                                    onClick={() => onPeriodChange?.('ytd')}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${selectedPeriod === 'ytd' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    YTD
                                </button>
                                <button 
                                    onClick={() => onPeriodChange?.('latest52Weeks')}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${selectedPeriod === 'latest52Weeks' ? 'bg-zinc-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    52 Weeks
                                </button>
                            </div>

                            <select 
                                value={selectedPriceOption}
                                onChange={(e) => setSelectedPriceOption(e.target.value)}
                                className="bg-zinc-800 px-3 py-2 border border-zinc-700 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                {priceOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>


                        </div>
                    </div>
                                     {/* --- REDESIGNED GRAPH SECTION --- */}
                    <div className="w-full relative">
                      {isAverageToggled && !isDistributionView && competitorChartData.length > 0 && (
                        <div className="absolute right-16 top-2 bg-zinc-800/90 border border-zinc-700 px-3 py-1.5 rounded-md text-xs text-white font-semibold z-10 shadow-md flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          <span>Average: {getValueLabel(averagePrice)}</span>
                        </div>
                      )}
                      <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 pb-4">
                        <div 
                          className="h-[360px] relative"
                          style={
                            (!isLoading && !isRpcLoading && competitorChartData.length > 0)
                              ? { minWidth: `${Math.max(100, competitorChartData.length * 60)}px` }
                              : {}
                          }
                        >
                          {isLoading || isRpcLoading || (isDistributionView && isLoadingProducts) ? (
                            <LoadingSpinner />
                          ) : competitorChartData.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-900/50 rounded-lg border border-zinc-800">
                              No data available for the selected filters.
                            </div>
                          ) : isDistributionView ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart 
                                margin={{ top: 30, right: 30, left: 10, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="barGradPurple" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a78bfa" />
                                    <stop offset="100%" stopColor="#7c3aed" />
                                  </linearGradient>
                                  <linearGradient id="barGradOrange" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fb923c" />
                                    <stop offset="100%" stopColor="#ea580c" />
                                  </linearGradient>
                                  {normalizedCompetitors.filter(c => c !== ALL_COMPETITORS).map((b, i) => {
                                    const c = getBrandColor(brandColorMap, b, i);
                                    return (
                                      <linearGradient key={b} id={`compGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={c.main} />
                                        <stop offset="100%" stopColor={c.dark} />
                                      </linearGradient>
                                    );
                                  })}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis 
                                  type="number"
                                  dataKey="xCoord"
                                  domain={[0.5, competitorChartData.length + 0.5]}
                                  ticks={competitorChartData.map((_, idx) => idx + 1)}
                                  tickFormatter={(tick) => {
                                    const entry = competitorChartData[tick - 1];
                                    return entry ? entry.brand : '';
                                  }}
                                  stroke="#71717a" 
                                  tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  dy={10} 
                                />
                                <YAxis 
                                  type="number"
                                  dataKey="price" 
                                  stroke="#71717a" 
                                  tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  domain={[0, maxPrice]}
                                  tickFormatter={(v) => selectedPriceOption === 'discount' ? `${v}%` : `${v} ${currentCurrency}`}
                                />
                                <RechartsTooltip 
                                  cursor={{ strokeDasharray: '3 3', stroke: '#3f3f46' }}
                                  content={<CustomScatterTooltip priceOption={selectedPriceOption} currency={currentCurrency} />}
                                />
                                
                                {isAverageToggled && (
                                  <ReferenceLine 
                                    y={averagePrice} 
                                    stroke="hsl(var(--foreground))" 
                                    strokeDasharray="4 4" 
                                    strokeWidth={2}
                                  />
                                )}

                                <Scatter 
                                  name={myBrand} 
                                  data={myBrandScatterData} 
                                  onClick={(node) => {
                                    if (node && node.payload) {
                                      const group = node.payload;
                                      setSelectedPromotionDetails(prev => {
                                        const groupIds = new Set((group.offers || []).map((o: any) => o.id));
                                        const hasAny = prev.some(p => groupIds.has(p.id));
                                        if (hasAny) {
                                          return prev.filter(p => !groupIds.has(p.id));
                                        } else {
                                          return [...prev, ...(group.offers || [])];
                                        }
                                      });
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {myBrandScatterData.map((entry, idx) => {
                                    const isAnySelected = selectedPromotionDetails.length > 0;
                                    const isSelected = entry.offers && entry.offers.length > 0 && entry.offers.every((o: any) => selectedPromotionDetails.some(p => p.id === o.id));
                                    const isPartiallySelected = !isSelected && entry.offers && entry.offers.some((o: any) => selectedPromotionDetails.some(p => p.id === o.id));
                                    const opacity = isSelected || isPartiallySelected ? 1 : (isAnySelected ? 0.35 : 1);
                                    const radius = isSelected ? 10 : (5 + Math.min(5, (entry.offerCount - 1) * 0.5));
                                    return (
                                      <Cell 
                                        key={`cell-my-${idx}`}
                                        fill={isSelected ? '#c084fc' : (isPartiallySelected ? '#d8b4fe' : 'url(#barGradPurple)')}
                                        r={radius}
                                        stroke={isSelected || isPartiallySelected ? '#ffffff' : 'none'}
                                        strokeWidth={isSelected || isPartiallySelected ? 1.5 : 0}
                                        opacity={opacity}
                                      />
                                    );
                                  })}
                                </Scatter>
                                <Scatter 
                                  name="Competitors" 
                                  data={competitorScatterData} 
                                  onClick={(node) => {
                                    if (node && node.payload) {
                                      const group = node.payload;
                                      setSelectedPromotionDetails(prev => {
                                        const groupIds = new Set((group.offers || []).map((o: any) => o.id));
                                        const hasAny = prev.some(p => groupIds.has(p.id));
                                        if (hasAny) {
                                          return prev.filter(p => !groupIds.has(p.id));
                                        } else {
                                          return [...prev, ...(group.offers || [])];
                                        }
                                      });
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {competitorScatterData.map((entry, idx) => {
                                    const isAnySelected = selectedPromotionDetails.length > 0;
                                    const isSelected = entry.offers && entry.offers.length > 0 && entry.offers.every((o: any) => selectedPromotionDetails.some(p => p.id === o.id));
                                    const isPartiallySelected = !isSelected && entry.offers && entry.offers.some((o: any) => selectedPromotionDetails.some(p => p.id === o.id));
                                    const opacity = isSelected || isPartiallySelected ? 1 : (isAnySelected ? 0.35 : 1);
                                    const radius = isSelected ? 10 : (5 + Math.min(5, (entry.offerCount - 1) * 0.5));
                                    return (
                                      <Cell 
                                        key={`cell-comp-${idx}`}
                                        fill={isSelected ? '#ffedd5' : (isPartiallySelected ? '#fed7aa' : `url(#${compGradId(entry.brand)})`)}
                                        r={radius}
                                        stroke={isSelected || isPartiallySelected ? '#ffffff' : 'none'}
                                        strokeWidth={isSelected || isPartiallySelected ? 1.5 : 0}
                                        opacity={opacity}
                                      />
                                    );
                                  })}
                                </Scatter>
                              </ScatterChart>
                            </ResponsiveContainer>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart 
                                data={competitorChartData} 
                                margin={{ top: 30, right: 30, left: 10, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="barGradPurple" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a78bfa" />
                                    <stop offset="100%" stopColor="#7c3aed" />
                                  </linearGradient>
                                  <linearGradient id="barGradOrange" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fb923c" />
                                    <stop offset="100%" stopColor="#ea580c" />
                                  </linearGradient>
                                  {normalizedCompetitors.filter(c => c !== ALL_COMPETITORS).map((b, i) => {
                                    const c = getBrandColor(brandColorMap, b, i);
                                    return (
                                      <linearGradient key={b} id={`compGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={c.main} />
                                        <stop offset="100%" stopColor={c.dark} />
                                      </linearGradient>
                                    );
                                  })}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis 
                                  dataKey="brand" 
                                  stroke="#71717a" 
                                  tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  dy={10} 
                                />
                                <YAxis 
                                  stroke="#71717a" 
                                  tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  tickFormatter={(v) => selectedPriceOption === 'discount' ? `${v}%` : `${v} ${currentCurrency}`}
                                />
                                <RechartsTooltip 
                                  cursor={{ fill: '#3f3f46', opacity: 0.3 }}
                                  content={<CustomTooltip priceOption={selectedPriceOption} currency={currentCurrency} myBrand={myBrand} />}
                                />
                                
                                {isAverageToggled && !isDistributionView && (
                                  <ReferenceLine 
                                    y={averagePrice} 
                                    stroke="hsl(var(--foreground))" 
                                    strokeDasharray="4 4" 
                                    strokeWidth={2}
                                  />
                                )}

                                <Bar 
                                  dataKey="price" 
                                  radius={[6,6,0,0]} 
                                  barSize={32} 
                                  animationDuration={800}
                                  label={<CustomBarLabel competitorChartData={competitorChartData} myBrand={myBrand} selectedPriceOption={selectedPriceOption} />}
                                >
                                  {competitorChartData.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.brand === myBrand ? 'url(#barGradPurple)' : `url(#${compGradId(entry.brand)})`}
                                      onClick={() => handleChartBarClick(entry.brand)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                      
                      {/* --- PROMOTION DETAILS CARDS FOR SCATTER CLICK --- */}
                      {selectedPromotionDetails.length > 0 && (
                        <div className="mt-6 space-y-4">
                          <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/80">
                            <span className="text-sm text-zinc-400 font-semibold">
                              Tracked Promotions ({selectedPromotionDetails.length})
                            </span>
                            <button
                              onClick={() => setSelectedPromotionDetails([])}
                              className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider"
                            >
                              Clear All
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {selectedPromotionDetails.map((detail) => (
                              <div key={detail.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 animate-fade-in relative shadow-lg">
                                <button 
                                  onClick={() => setSelectedPromotionDetails(prev => prev.filter(p => p.id !== detail.id))}
                                  className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-800/80">
                                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_6px_rgba(148,163,184,0.5)]" style={{ backgroundColor: getBrandColor(brandColorMap, detail.brand, 0).main }} />
                                    Promotion Details: {detail.brand}
                                  </h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
                                  <div className="space-y-3">
                                    <div>
                                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Product Name</span>
                                      <span className="text-xs font-semibold text-zinc-100 block line-clamp-2">{detail.productName}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Retailer</span>
                                        <span className="text-xs font-semibold text-zinc-100">{detail.retailer}</span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Price</span>
                                        <span className="text-xs font-bold text-purple-400">{getValueLabel(detail.price)}</span>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Start Date</span>
                                        <span className="text-xs text-zinc-300">
                                          {detail.startDate ? new Date(detail.startDate).toLocaleDateString('en-GB') : 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">End Date</span>
                                        <span className="text-xs text-zinc-300">
                                          {detail.endDate ? new Date(detail.endDate).toLocaleDateString('en-GB') : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex justify-center items-center">
                                    {detail.imagePath ? (
                                      <div className="relative group rounded border border-zinc-800 overflow-hidden bg-zinc-950 p-1 flex-shrink-0">
                                        <img 
                                          src={detail.imagePath} 
                                          alt={detail.productName} 
                                          className="max-h-24 w-auto object-contain hover:scale-105 transition-transform duration-200"
                                        />
                                      </div>
                                    ) : (
                                      <div className="h-24 w-24 flex flex-col justify-center items-center rounded border border-dashed border-zinc-800 bg-zinc-950 text-zinc-600 text-[10px] text-center flex-shrink-0">
                                        <span>No flyer image</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {rpcError && (
                        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {rpcError}
                        </div>
                    )}
                </div>

                <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Brand Summary</h2>
                    <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-zinc-700">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-zinc-800/40 border-b border-zinc-800/80">
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Brand Name</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Offer Count</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Min Values</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Max Values</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={4}>
                                            <div className="py-12 flex justify-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                brandSummaryData.map((row) => (
                                    <Fragment key={row.brand}>
                                        <tr 
                                            className={`border-b border-zinc-800/80 hover:bg-zinc-800/60 cursor-pointer transition-all duration-200 ${
                                                expandedBrandSummary[row.brand] ? 'bg-zinc-800/20' : ''
                                            } ${selectedChartBrand === row.brand ? 'bg-zinc-800/40 border-l-2 border-l-purple-500' : ''}`}
                                            onClick={() => {
                                                toggleBrandSummary(row.brand);
                                            }}
                                        >
                                            <td className="py-3.5 px-4 text-white font-semibold flex items-center gap-3">
                                                <div className="flex items-center justify-center w-5 h-5 rounded-md bg-zinc-800 border border-zinc-700 shadow-sm transition-colors duration-250">
                                                    <svg 
                                                      className={`w-3 h-3 text-zinc-400 transition-transform duration-250 ${expandedBrandSummary[row.brand] ? 'rotate-90 text-purple-400' : ''}`} 
                                                      fill="none" 
                                                      viewBox="0 0 24 24" 
                                                      stroke="currentColor" 
                                                      strokeWidth={3}
                                                    >
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                    </svg>
                                                </div>
                                                <span className={row.brand === myBrand ? 'text-purple-300 font-bold' : 'text-zinc-100'}>{row.brand}</span>
                                            </td>
                                            <td className="text-center py-3.5 px-4 text-zinc-300 font-medium">{row.count}</td>
                                            <td className="text-center py-3.5 px-4 text-zinc-300">{getValueLabel(row.min)}</td>
                                            <td className="text-center py-3.5 px-4 text-zinc-300">{getValueLabel(row.max)}</td>
                                        </tr>
                                        {expandedBrandSummary[row.brand] && row.weights.map((w, idx) => (
                                            <tr key={`${row.brand}-${w.weight}-${idx}`} className="bg-zinc-950/30 border-b border-zinc-800/40 hover:bg-zinc-800/10 transition-colors">
                                                <td className="py-2.5 px-4 pl-12 text-zinc-400 text-xs font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full shadow-[0_0_6px_rgba(148,163,184,0.5)]" style={{ backgroundColor: getBrandColor(brandColorMap, row.brand, 0).main }} />
                                                    {w.weight}
                                                </td>
                                                <td className="text-center py-2.5 px-4 text-zinc-400 text-xs font-medium">{w.count}</td>
                                                <td className="text-center py-2.5 px-4 text-emerald-500/80 text-xs font-semibold">{getValueLabel(w.min)}</td>
                                                <td className="text-center py-2.5 px-4 text-orange-400/85 text-xs font-semibold">{getValueLabel(w.max)}</td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))
                            )}
                                {brandSummaryData.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-8 text-gray-500">No data available for selected filters.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* --- Brandwise Retailer Activities (RPC Powered + Connected to Chart Click) --- */}
                <div
                    ref={retailerActivityRef}
                    className="bg-zinc-900 rounded-lg border border-zinc-800 p-8 shadow-2xl animate-fade-in w-full"
                >
    {/* --- Header Section --- */}
    <div className="flex flex-col items-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">Brandwise Retailer Activities</h2>
        <div className="mt-2 px-4 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <span className="text-zinc-400 text-sm font-medium">
                {selectedChartBrand
                    ? <span style={{ color: getBrandColor(brandColorMap, selectedChartBrand, 0).main }}>Selected: {selectedChartBrand}</span>
                    : 'Select a brand to view details'}
            </span>
        </div>
    </div>

    {/* --- Chart Content --- */}
    {isLoadingRetailer ? (
        <div className="flex justify-center items-center py-10 min-h-[350px]">
            <LoadingSpinner />
        </div>
    ) : retailerActivity.length > 0 ? (
        <div className="w-full h-[400px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={retailerActivity} 
              margin={{ top: 30, right: 60, left: 30, bottom: 20 }}
            >
              <defs>
                {/* Bar color follows the clicked brand so it matches that
                    brand's bar in the Average Price chart above. */}
                <linearGradient id="barGradCyan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={getBrandColor(brandColorMap, selectedChartBrand, 0).main} />
                  <stop offset="100%" stopColor={getBrandColor(brandColorMap, selectedChartBrand, 0).dark} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis 
                dataKey="retailer" 
                stroke="#71717a" 
                tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                tickLine={false} 
                axisLine={false} 
                dy={10} 
              />
              <YAxis
                yAxisId="left"
                stroke={getBrandColor(brandColorMap, selectedChartBrand, 0).main}
                width={60}
                tick={{ fill: getBrandColor(brandColorMap, selectedChartBrand, 0).main, fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Offer Count',
                  angle: -90,
                  position: 'insideLeft',
                  fill: getBrandColor(brandColorMap, selectedChartBrand, 0).main,
                  fontSize: 12,
                  fontWeight: 600,
                  style: { textAnchor: 'middle' },
                  dx: -15
                }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#f97316" 
                width={60}
                tick={{ fill: '#f97316', fontSize: 12, fontWeight: 500 }} 
                tickLine={false} 
                axisLine={false} 
                label={{ 
                  value: selectedPriceOption === 'discount' ? 'Average Discount (%)' : `Average Price (${currentCurrency})`, 
                  angle: 90, 
                  position: 'insideRight', 
                  fill: '#f97316', 
                  fontSize: 12, 
                  fontWeight: 600,
                  style: { textAnchor: 'middle' },
                  dx: 15
                }}
                tickFormatter={(v) => selectedPriceOption === 'discount' ? `${v}%` : `${v}`}
              />
              <RechartsTooltip 
                cursor={{ fill: '#3f3f46', opacity: 0.3 }}
                content={<RetailerTooltip currency={currentCurrency} priceOption={selectedPriceOption} barColor={getBrandColor(brandColorMap, selectedChartBrand, 0).main} />}
              />
              
              <Bar 
                yAxisId="left"
                dataKey="offer_count" 
                name="Offer Count" 
                fill="url(#barGradCyan)" 
                radius={[6,6,0,0]} 
                barSize={24} 
                animationDuration={800}
                label={{ position: 'top', fill: getBrandColor(brandColorMap, selectedChartBrand, 0).main, fontSize: 11, fontWeight: 600 }}
              />
              <Line 
                yAxisId="right"
                type="monotone"
                dataKey={
                  selectedPriceOption === 'regular' ? 'avg_regular_price' :
                  selectedPriceOption === 'discount' ? 'avg_discount' :
                  'avg_offer_price'
                }
                name={selectedPriceOption === 'discount' ? 'Average Discount' : 'Average Price'}
                stroke="#f97316" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#f97316', stroke: '#18181b', strokeWidth: 2 }} 
                activeDot={{ r: 6, fill: '#fff', stroke: '#f97316', strokeWidth: 2 }}
                animationDuration={800}
              />
            </ComposedChart>
          </ResponsiveContainer>
          
          <div className="flex justify-center gap-10 mt-6 border-t border-zinc-800/50 pt-4">
              <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-sm shadow-sm"></div>
                  <span className="text-zinc-300 text-sm font-medium">Offer Count</span>
              </div>
              <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] border border-zinc-900"></div>
                  <span className="text-zinc-300 text-sm font-medium">
                    {selectedPriceOption === 'discount' ? 'Average Discount' : 'Average Price'}
                  </span>
              </div>
          </div>
        </div>
    ) : (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <p>No activity data available</p>
        </div>
    )}
</div>
            </div>
        </>
    );
};

export default CompetitorPricingAnalysis;
