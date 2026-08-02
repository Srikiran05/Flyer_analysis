import { useState, useEffect, useMemo, useCallback, FC, useRef, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  startOfWeek,
  subDays,
  startOfYear,
  subWeeks,
  startOfDay,
  format as formatDate,
  parseISO,
  getYear,
  getISOWeek
} from 'date-fns';
import { downloadPivotWorkbook } from '../utils/dataExportWorkbook';
import { Download, Info, Loader2, ChevronDown, Check, Search, X, MoreHorizontal, Sparkles, Lightbulb, ArrowUpDown, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import CompetitorPricingAnalysis from './CompetitorPricingAnalysis';
import { buildBrandColorMap, getBrandColor } from '@/utils/brandColors';
import AllBrandActivities from './AllBrandActivities';
import PriceTrendAnalysis from './PriceTrendAnalysis';
import {
  getRawValue,
  formatValue,
  getPriceData,
  formatPriceSummary
} from '../utils/promotionAnalysisUtils';

import { supabase } from '@/lib/supabaseClient';
import { getCurrency } from '../utils/offerBankUtils';

// --- TYPES ---
type DateRangeKey = 'latest4Weeks' | 'latest12Weeks' | 'ytd' | 'latest52Weeks';
type DateRange = { from: Date; to: Date; label: string };
type DateRanges = Record<DateRangeKey, DateRange>;

interface FlyerProduct {
  id: number;
  brand: string | null;
  category: string | null;
  type: string | null;
  product_name: string | null;
  regular_price: string | null;
  discounted_price: string | null;
  offer_timeline: string | null;
  offer_name?: string | null;
  weight_quantity: string | null;
  country: string | null;
  coverage_regions: string | null;
  mart_name: string | null;
  created_at: string;
  image_path?: string | null;
  start_date: string | null;
  end_date: string | null;
}

// Inside interface PeriodAnalysis
interface PeriodAnalysis {
  myBrandCount: number;
  competitorCount: number;
  totalCount: number;
  myBrandShare: number;
  competitorShare: number;
  // --- ADD THESE LINES ---
  brandACount?: number;
  brandBCount?: number;
  brandAShare?: number;
  brandBShare?: number;
  // -----------------------
  avgOfferPrice: { myBrand: number; competitor: number };
  avgRegularPrice: { myBrand: number; competitor: number };
  avgDiscount: { myBrand: number; competitor: number };
  avgPricePerKg: { myBrand: number; competitor: number };
}

interface AnalyticsData {
  latest4Weeks: PeriodAnalysis;
  latest12Weeks: PeriodAnalysis;
  ytd: PeriodAnalysis;
  latest52Weeks: PeriodAnalysis;
}

const ALL_COMPETITORS = 'ALL_COMPETITORS';
const MULTI_COMPETITORS = 'MULTI_COMPETITORS';
const MAX_COMPETITOR_SELECTION = 3;
const FILTER_PREFS_KEY = 'promotion_analysis_country_filters_v1';
/** Max brands shown as separate mini charts in Overall when a category is applied (not Brand-on-Brand). */
const OVERALL_CATEGORY_BRAND_CAP = 5;

const ALLOWED_CATEGORIES = new Set([
  'Cereals & Bars', 'Cheese', 'Dental Care', 'Dishwash',
  'Facial Tissues & Wipes', 'Fresh Chicken', 'Frozen Chicken',
  'Frozen Fries', 'Frozen Meat', 'Hair care', 'Household cleaners',
  'Juices', 'Laptop & Accessories', 'Laundry', 'Malt Beverages',
  'Milk & Yogurt', 'Mobile & Accessories', 'Other',
  'Pasta & Noodles', 'Soft Drinks', 'Toilet Tissues & Papers', 'Water'
]);

type AnalyticsFilterSnapshot = {
  region: string;
  retailer: string;
  category: string;
  subcategory: string;
  basePack: string;
  quantity: string;
  offerType: string;
};

type CategoryBrandPeriodStats = {
  offerCount: number;
  categoryTotal: number;
  sharePct: number;
  avgOffer: number;
};

type CategoryBrandOverallRow = {
  brand: string;
  periods: Record<DateRangeKey, CategoryBrandPeriodStats>;
};

type MultiCompetitorActivityPoint = {
  name: string;
  myBrandShare: number;
  competitorShare: number;
  myBrandCount: number;
  competitorCount: number;
  totalCount: number;
};

type MultiCompetitorChart = {
  competitor: string;
  data: MultiCompetitorActivityPoint[];
};

const parsePriceNumber = (value: string | null | undefined): number => {
  if (!value) return 0;
  const matched = value.match(/[0-9]+(?:\.[0-9]+)?/);
  return matched ? Number(matched[0]) : 0;
};

const getCountryKey = (c: string): string => {
  if (!c) return '';
  const normalized = c.trim().toLowerCase();
  if (normalized === 'united arab emirates' || normalized === 'uae') return 'uae';
  return normalized;
};

interface CustomDropdownProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  loading?: boolean;
  highlightClass?: string;
  labelClass?: string;
}

const CustomFilterDropdown: FC<CustomDropdownProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  loading = false,
  highlightClass = "py-3 border-zinc-700 hover:border-zinc-500 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500",
  labelClass = "text-zinc-400 group-hover:text-purple-400"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !search) return options;
    const s = search.toLowerCase();
    return options.filter(opt => (opt || '').toLowerCase().includes(s));
  }, [options, search, searchable]);

  const sortedOptions = useMemo(() => {
    if (!value) return filteredOptions;
    const selected = filteredOptions.filter(opt => opt === value);
    const unselected = filteredOptions.filter(opt => opt !== value);
    return [...selected, ...unselected];
  }, [filteredOptions, value]);

  return (
    <div className="relative group" ref={containerRef}>
      <label className={`absolute -top-2.5 left-3 px-1 text-[10px] font-bold uppercase tracking-wider bg-zinc-900 z-10 transition-colors flex items-center gap-1 ${labelClass}`}>
        {label}
        {loading && <Loader2 className="h-3 w-3 animate-spin text-purple-400" />}
      </label>
      
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-transparent text-left text-sm rounded-lg px-3 text-white transition-all appearance-none cursor-pointer flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border ${highlightClass}`}
      >
        <span className="truncate pr-4">
          {value || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl z-50 p-1.5 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent animate-in fade-in slide-in-from-top-1 duration-200">
          {searchable && (
            <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-md pb-1.5 pt-0.5 px-1 border-b border-zinc-800/60 z-10 relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs rounded-lg pl-8 pr-7 py-1.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 placeholder-zinc-500 transition-all"
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => setSearch('')} 
                  className="absolute right-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className={`w-full px-3 py-2 text-left text-sm transition-all rounded-lg flex items-center justify-between ${
              !value
                ? 'bg-purple-500/15 text-purple-400 font-semibold border-l-2 border-l-purple-500'
                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
            }`}
          >
            <span>{placeholder}</span>
            {!value && <Check className="h-3.5 w-3.5 text-purple-400" />}
          </button>

          <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {sortedOptions.map((opt) => {
              const isSelected = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-all rounded-lg flex items-center justify-between ${
                    isSelected
                      ? 'bg-purple-500/15 text-purple-400 font-semibold border-l-2 border-l-purple-500'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                  }`}
                >
                  <span>{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-purple-400" />}
                </button>
              );
            })}
            {searchable && filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500 text-center">No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function pickShowcaseBrands(
  brandCounts: Map<string, number>,
  primaryBrand: string,
  competitorSelection: string[],
  cap: number,
  eligible: Set<string> | null
): string[] {
  const allowed = (b: string) => !eligible || eligible.size === 0 || eligible.has(b);
  const out: string[] = [];
  const pb = primaryBrand.trim();
  if (pb && brandCounts.has(pb) && allowed(pb)) out.push(pb);
  const specifics = competitorSelection.filter((c) => c && c !== ALL_COMPETITORS);
  for (const b of specifics) {
    const t = b.trim();
    if (!brandCounts.has(t) || !allowed(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= cap) return out;
  }
  const rest = [...brandCounts.entries()]
    .filter(([b]) => allowed(b) && !out.includes(b))
    .sort((a, b) => b[1] - a[1]);
  for (const [b] of rest) {
    out.push(b);
    if (out.length >= cap) break;
  }
  return out;
}

const CATEGORY_BRAND_CHART_COLORS = ['#8b5cf6', '#ea580c', '#22c55e', '#38bdf8', '#eab308'];
const getPrimaryCompetitor = (competitors: string[]) =>
  competitors.find((c) => c && c !== ALL_COMPETITORS) || '';

type CountryFilterPrefs = {
  myBrand: string;
  selectedCompetitors: string[];
  selectedRegion: string;
  selectedRetailer: string;
  selectedCategory: string;
  selectedSubCategory: string;
  selectedBasePack: string;
  selectedQuantity: string;
  offerType: string;
};
type CountryFilterDimensions = {
  regions: string[];
  retailers: string[];
  categories: string[];
  subcategories: string[];
  packSizes: string[];
};

const splitDimensionValues = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  return value
    .split(/[;,|]/g)
    .map((v) => v.trim())
    .filter(Boolean);
};

// UPDATE this function (usually near the top of the file)
const getDateRanges = (anchorDate: Date = new Date()): DateRanges => {
  const today = startOfDay(anchorDate);

  return {
    latest4Weeks: { from: subDays(today, 27), to: today, label: 'Latest 4 weeks' },
    latest12Weeks: { from: subDays(today, 84), to: today, label: 'Latest 12 weeks' },
    ytd: { from: startOfYear(today), to: today, label: 'YTD' },
    latest52Weeks: { from: subDays(today, 364), to: today, label: 'Latest 52 weeks' },
  };
};

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

const getAnalysisWeek = (p: FlyerProduct): string => {
  const date = getProductEffectiveDate(p);
  if (!date) return 'N/A';
  const year = getYear(date);
  const week = getISOWeek(date);
  const weekStr = week < 10 ? `0${week}` : `${week}`;
  return `${year}${weekStr}`;
};

const formatTimelineDisplay = (start: string | null, end: string | null): string => {
  if (!start && !end) return 'No date';
  
  const formatDateStr = (d: string) => {
    try {
      const parsed = parseISO(d);
      if (!parsed || isNaN(parsed.getTime())) return '';
      return formatDate(parsed, 'dd-MM-yyyy');
    } catch {
      return '';
    }
  };
  
  const startFmt = start ? formatDateStr(start) : '';
  const endFmt = end ? formatDateStr(end) : '';
  
  if (startFmt && endFmt) return `${startFmt} to ${endFmt}`;
  if (endFmt) return `Ends ${endFmt}`;
  if (startFmt) return `Starts ${startFmt}`;
  
  return 'No date';
};

const PromotionAnalysis: FC = () => {
  const { toast } = useToast();
  const applyAbortControllerRef = useRef<AbortController | null>(null);
  const isInitialCountryLoad = useRef(true);
  const isInitialCategoryLoad = useRef(true);

  // --- STATE ---
  const [isDropdownLoading, setIsDropdownLoading] = useState(false);
  const [exportAnalysisWeek, setExportAnalysisWeek] = useState<string>('latest12Weeks');
  const [exportOfferType, setExportOfferType] = useState<string>('Distinct Offers');
  const [exportAllData, setExportAllData] = useState<boolean>(false);
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSpotlightActive, setIsSpotlightActive] = useState<boolean>(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState<boolean>(false);
  const [isAnalyzingInsights, setIsAnalyzingInsights] = useState<boolean>(false);
  const threeDotsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (threeDotsMenuRef.current && !threeDotsMenuRef.current.contains(e.target as Node)) {
        setShowThreeDotsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isBrandOnBrandToggled, setIsBrandOnBrandToggled] = useState(false);
  const [priceTrendType, setPriceTrendType] = useState('offer');
  const [activeTab, setActiveTab] = useState('overall');
  // const [myBrand, setMyBrand] = useState('');
  const [myBrand, setMyBrand] = useState<string>(() => {
    return sessionStorage.getItem("promoanalysis_myBrand") || "";
  });

  // Country State
  // ... existing states ...
  const [competitorPeriod, setCompetitorPeriod] = useState<DateRangeKey>(() => {
    return (sessionStorage.getItem("promoanalysis_competitorPeriod") as DateRangeKey) || 'latest52Weeks';
  });
  const [country, setCountry] = useState(() => {
    return sessionStorage.getItem("promoanalysis_country") || "";
  });
  const [availableCountries, setAvailableCountries] = useState<string[]>(['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Oman']);

  const [offerType, setOfferType] = useState(() => {
    return sessionStorage.getItem("promoanalysis_offerType") || "All Offers";
  });
  const [brandA, setBrandA] = useState(() => sessionStorage.getItem("promoanalysis_brandA") || "");
  const [brandB, setBrandB] = useState(() => sessionStorage.getItem("promoanalysis_brandB") || "");
  const [selectedRegion, setSelectedRegion] = useState(() => {
    return sessionStorage.getItem("promoanalysis_selectedRegion") || "";
  });
  const [selectedRetailer, setSelectedRetailer] = useState(() => {
    return sessionStorage.getItem("promoanalysis_selectedRetailer") || "";
  });
  const [selectedCategory, setSelectedCategory] = useState(() => {
    return sessionStorage.getItem("promoanalysis_selectedCategory") || "";
  });
  const [selectedSubCategory, setSelectedSubCategory] = useState(() => {
    return sessionStorage.getItem("promoanalysis_selectedSubCategory") || "";
  });

  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("promoanalysis_selectedCompetitors");
    return stored ? JSON.parse(stored) : [ALL_COMPETITORS];
  });
  const [isCompetitorDropdownOpen, setIsCompetitorDropdownOpen] = useState(false);
  const [competitorSearchText, setCompetitorSearchText] = useState('');
  const [brandsInSelectedCategory, setBrandsInSelectedCategory] = useState<string[]>([]);
  const [isLoadingBrandsInCategory, setIsLoadingBrandsInCategory] = useState(false);
  const competitorDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close the competitor dropdown when clicking anywhere outside it. Without
  // this it stayed open over the other filters and charts.
  useEffect(() => {
    if (!isCompetitorDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (competitorDropdownRef.current && !competitorDropdownRef.current.contains(e.target as Node)) {
        setIsCompetitorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCompetitorDropdownOpen]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [dateRanges, setDateRanges] = useState<DateRanges>(getDateRanges());
  const [error, setError] = useState<string | null>(null);

  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [allRegions, setAllRegions] = useState<string[]>([]);
  const [allRetailers, setAllRetailers] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allSubCategories, setAllSubCategories] = useState<string[]>([]);
  const [masterSubCategories, setMasterSubCategories] = useState<string[]>([]);

  const [selectedBasePack, setSelectedBasePack] = useState(() => {
    return sessionStorage.getItem("promoanalysis_selectedBasePack") || "";
  });
  const [selectedQuantity, setSelectedQuantity] = useState(() => sessionStorage.getItem("promoanalysis_selectedQuantity") || "");

  const [allBasePacks, setAllBasePacks] = useState<string[]>([]);
  const [allQuantities, setAllQuantities] = useState<string[]>([]);
  const [masterPackSizes, setMasterPackSizes] = useState<string[]>([]);

  const [processedData, setProcessedData] = useState<FlyerProduct[]>([]);
  const [appliedMyBrand, setAppliedMyBrand] = useState(() => {
    return sessionStorage.getItem("promoanalysis_appliedMyBrand") || "";
  });
  const [appliedCompetitors, setAppliedCompetitors] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("promoanalysis_appliedCompetitors");
    return stored ? JSON.parse(stored) : [ALL_COMPETITORS];
  });
  const [appliedCompetitor, setAppliedCompetitor] = useState(() => sessionStorage.getItem("promoanalysis_appliedCompetitor") || ALL_COMPETITORS);
  const [permittedCategories, setPermittedCategories] = useState<string[]>([]);

  // Load per-user category permissions — the same source the Offer Bank
  // RPC enforces server-side. Empty array = unrestricted (admin).
  useEffect(() => {
    let isMounted = true;
    supabase.rpc('get_current_user_permissions').then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.error('Failed to load user permissions', error);
        setPermittedCategories([]);
        return;
      }
      const cats = (data?.[0]?.allowed_categories ?? []) as string[];
      setPermittedCategories(cats.map((c) => c.trim().toLowerCase()).filter(Boolean));
    });
    return () => { isMounted = false; };
  }, []);

  const isCategoryPermitted = useCallback(
    (cat: string) => permittedCategories.length === 0 || permittedCategories.includes(cat.trim().toLowerCase()),
    [permittedCategories],
  );
  // Change type to Partial<FlyerProduct> or any[] to allow product details

  const [appliedOfferType, setAppliedOfferType] = useState(() => sessionStorage.getItem("promoanalysis_appliedOfferType") || "All Offers");
  const [appliedRegion, setAppliedRegion] = useState(() => {
    return sessionStorage.getItem("promoanalysis_appliedRegion") || "";
  });
  const [appliedCategory, setAppliedCategory] = useState(() => {
    return sessionStorage.getItem("promoanalysis_appliedCategory") || "";
  });
  const [showSelectedCompetitorBreakdown, setShowSelectedCompetitorBreakdown] = useState(false);

  // --- ADD THESE NEW APPLIED STATES ---
  const [appliedRetailer, setAppliedRetailer] = useState(() => sessionStorage.getItem("promoanalysis_appliedRetailer") || "");
  const [appliedSubCategory, setAppliedSubCategory] = useState(() => sessionStorage.getItem("promoanalysis_appliedSubCategory") || "");
  const [appliedBasePack, setAppliedBasePack] = useState(() => sessionStorage.getItem("promoanalysis_appliedBasePack") || "");
  const [appliedQuantity, setAppliedQuantity] = useState(() => sessionStorage.getItem("promoanalysis_appliedQuantity") || "");

  const [appliedCountry, setAppliedCountry] = useState(() => {
    return sessionStorage.getItem("promoanalysis_appliedCountry") || "";
  });
  
  const [appliedBrandOnBrand, setAppliedBrandOnBrand] = useState(() => sessionStorage.getItem("promoanalysis_appliedBrandOnBrand") === "true");
  const [appliedBrandA, setAppliedBrandA] = useState(() => sessionStorage.getItem("promoanalysis_appliedBrandA") || "");
  const [appliedBrandB, setAppliedBrandB] = useState(() => sessionStorage.getItem("promoanalysis_appliedBrandB") || "");

  // Flags the Apply button the moment a selection no longer matches the
  // filters the current analysis was actually run with.
  const hasUnappliedChanges = Boolean(appliedMyBrand) && (
    country !== appliedCountry ||
    selectedCategory !== appliedCategory ||
    myBrand !== appliedMyBrand ||
    selectedRegion !== appliedRegion ||
    selectedRetailer !== appliedRetailer ||
    selectedSubCategory !== appliedSubCategory ||
    selectedBasePack !== appliedBasePack ||
    selectedQuantity !== appliedQuantity ||
    offerType !== appliedOfferType ||
    isBrandOnBrandToggled !== appliedBrandOnBrand ||
    (isBrandOnBrandToggled
      ? (brandA || myBrand) !== appliedBrandA || brandB !== appliedBrandB
      : JSON.stringify(selectedCompetitors) !== JSON.stringify(appliedCompetitors))
  );

  // Nudge once per change-cycle, not on every filter tweak: only one toast
  // shows at a time, so re-firing would re-animate constantly and evict
  // other messages. Resets when the filters are applied again.
  const warnedUnappliedRef = useRef(false);
  useEffect(() => {
    if (!hasUnappliedChanges) {
      warnedUnappliedRef.current = false;
      return;
    }
    if (warnedUnappliedRef.current) return;
    warnedUnappliedRef.current = true;
    toast({
      title: "Filters changed",
      description: "Click Apply Filters to update the analysis.",
    });
  }, [hasUnappliedChanges, toast]);

  // --- SAVE STATES TO SESSION STORAGE ---
  useEffect(() => {
    sessionStorage.setItem("promoanalysis_myBrand", myBrand);
  }, [myBrand]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_competitorPeriod", competitorPeriod);
  }, [competitorPeriod]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_country", country);
  }, [country]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_offerType", offerType);
  }, [offerType]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_brandA", brandA);
  }, [brandA]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_brandB", brandB);
  }, [brandB]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedRegion", selectedRegion);
  }, [selectedRegion]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedRetailer", selectedRetailer);
  }, [selectedRetailer]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedCategory", selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedSubCategory", selectedSubCategory);
  }, [selectedSubCategory]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedCompetitors", JSON.stringify(selectedCompetitors));
  }, [selectedCompetitors]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedBasePack", selectedBasePack);
  }, [selectedBasePack]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_selectedQuantity", selectedQuantity);
  }, [selectedQuantity]);

  // Applied States
  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedMyBrand", appliedMyBrand);
  }, [appliedMyBrand]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedCompetitors", JSON.stringify(appliedCompetitors));
  }, [appliedCompetitors]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedCompetitor", appliedCompetitor);
  }, [appliedCompetitor]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedOfferType", appliedOfferType);
  }, [appliedOfferType]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedRegion", appliedRegion);
  }, [appliedRegion]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedCategory", appliedCategory);
  }, [appliedCategory]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedRetailer", appliedRetailer);
  }, [appliedRetailer]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedSubCategory", appliedSubCategory);
  }, [appliedSubCategory]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedBasePack", appliedBasePack);
  }, [appliedBasePack]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedQuantity", appliedQuantity);
  }, [appliedQuantity]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedCountry", appliedCountry);
  }, [appliedCountry]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedBrandOnBrand", String(appliedBrandOnBrand));
  }, [appliedBrandOnBrand]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedBrandA", appliedBrandA);
  }, [appliedBrandA]);

  useEffect(() => {
    sessionStorage.setItem("promoanalysis_appliedBrandB", appliedBrandB);
  }, [appliedBrandB]);

  const [marketTotals, setMarketTotals] = useState<{
    total_4w: number;
    total_12w: number;
    total_ytd: number;
    total_52w: number;
  } | null>(null);

  const priceOptions = [
    { label: 'Offer Price', value: 'offer' },
    { label: 'Regular Price', value: 'regular' },
    { label: 'Discount', value: 'discount' },
    { label: 'Price per Kg/Ltr', value: 'perkg' },
  ];


  // --- CONSTANTS ---

  // --- 1. GET CURRENT USER EMAIL ON MOUNT ---
  useEffect(() => {
    setDateRanges(getDateRanges());

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setCurrentUserEmail(user.email);
      } else {
        console.log('No user logged in');
      }
    };
    getUser();

    return () => {
      if (applyAbortControllerRef.current) {
        applyAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Reset loading state and abort stale query when filters change
  useEffect(() => {
    if (applyAbortControllerRef.current) {
      applyAbortControllerRef.current.abort();
      applyAbortControllerRef.current = null;
    }
    setIsLoading(false);
  }, [
    country,
    selectedRegion,
    selectedRetailer,
    selectedCategory,
    selectedSubCategory,
    selectedBasePack,
    selectedQuantity,
    offerType,
    myBrand
  ]);

  // Initialize Brand-on-Brand defaults once per toggle ON.
  // This prevents overwriting manual Brand A/B choices.
  useEffect(() => {
    if (!isBrandOnBrandToggled) return;
    if (brandA && brandB) return;

    if (!brandA && myBrand) {
      setBrandA(myBrand);
    }

    if (!brandB) {
      const primaryHeaderCompetitor = getPrimaryCompetitor(selectedCompetitors);
      if (primaryHeaderCompetitor) {
        setBrandB(primaryHeaderCompetitor);
      } else {
        const pool =
          selectedCategory && brandsInSelectedCategory.length > 0
            ? brandsInSelectedCategory
            : allBrands;
        const defaultCompetitor = pool.find((b) => b !== myBrand);
        if (defaultCompetitor) {
          setBrandB(defaultCompetitor);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrandOnBrandToggled, selectedCompetitors, myBrand, allBrands, selectedCategory, brandsInSelectedCategory]);

  // --- HELPER: Parse Dates Correctly ---
  const getDates = (start: string | null, end: string | null) => {
    // If both are null, return Epoch 0 (effectively excludes it from analysis)
    if (!start && !end) {
      return { start: new Date(0), end: new Date(0) };
    }

    // Parse Start
    const s = start ? new Date(start) : new Date(0);

    // Parse End: If NULL, fallback to Start (1-day offer), otherwise parse End
    // This prevents "No Date" items from looking like "Running Offers"
    const e = end ? new Date(end) : s;

    return { start: s, end: e };
  };

  // --- DYNAMIC OVERRIDES FOR SUB-TABS ---
  // When Brand on Brand is toggled, we immediately use the selected Brand A/B for the sub-tabs
  // When toggled off, it reverts to the applied global filter brands.
  const effectiveMyBrandForTabs = isBrandOnBrandToggled ? (brandA || appliedMyBrand) : appliedMyBrand;
  const effectiveCompetitorForTabs = isBrandOnBrandToggled ? (brandB || appliedCompetitor) : appliedCompetitor;
  const effectiveCompetitorsForTabs = isBrandOnBrandToggled 
    ? (brandB && brandB !== 'ALL_COMPETITORS' && brandB !== 'MULTI_COMPETITORS' ? [brandB] : [])
    : appliedCompetitors;

  useEffect(() => {
    const fetchMarketTotals = async () => {
      // Only fetch if a country is selected (primary filter)
      if (!country) return;

      try {
        const { data, error } = await supabase.rpc('get_market_totals', {
          p_country: getCountryKey(country),
          p_region: appliedRegion || null,
          p_retailer: appliedRetailer || null,
          p_category: appliedCategory || null,
          p_subcategory: appliedSubCategory || null,
          // Use appliedQuantity or appliedBasePack for p_quantity mapping
          p_quantity: appliedQuantity || appliedBasePack || null,
          p_distinct_offers: appliedOfferType === 'Distinct Offers'
        });

        if (error) {
          console.error('Error fetching market totals:', error);
        } else if (data && data.length > 0) {
          setMarketTotals(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch market totals:', err);
      }
    };

    fetchMarketTotals();

  }, [
    appliedCountry,
    appliedRegion,
    appliedRetailer,
    appliedCategory,
    appliedSubCategory,
    appliedQuantity,
    appliedBasePack,
    appliedOfferType
  ]);

  // --- LOAD COUNTRY-LEVEL DIMENSIONS (categories, regions, retailers) ---
  useEffect(() => {
    if (!country) return;
    setIsLoadingFilters(true);
    let isMounted = true;

    const loadCountryDimensions = async () => {
      try {
        // Paginate through the MV (Supabase hard-caps at 1000 rows per request)
        const PAGE_SIZE = 1000;
        let allRows: any[] = [];
        let from = 0;
        let keepFetching = true;

        while (keepFetching) {
          const { data: page, error: pageError } = await supabase
            .from('mv_promo_dimensions')
            .select('dimension_type, dimension_value')
            .eq('country_key', getCountryKey(country))
            .in('dimension_type', ['category', 'region', 'retailer'])
            .range(from, from + PAGE_SIZE - 1);

          if (pageError) throw pageError;
          if (!page || page.length === 0) break;

          allRows = allRows.concat(page);
          from += PAGE_SIZE;
          if (page.length < PAGE_SIZE) keepFetching = false;
        }

        if (allRows.length > 0 && isMounted) {
          const categories = new Set<string>();
          const regions = new Set<string>();
          const retailers = new Set<string>();

          allRows.forEach((row: any) => {
            const type = row.dimension_type?.toLowerCase();
            const val = row.dimension_value;
            if (!val) return;
            switch (type) {
              case 'category': categories.add(val); break;
              case 'region': regions.add(val); break;
              case 'retailer': retailers.add(val); break;
            }
          });

          setAllCategories(Array.from(categories).filter(c => ALLOWED_CATEGORIES.has(c)).sort());
          setAllRegions(Array.from(regions).sort());
          setAllRetailers(Array.from(retailers).sort());

          // Skip clearing filters on initial mount so persisted session values load
          if (isInitialCountryLoad.current) {
            isInitialCountryLoad.current = false;
          } else {
            // Clear all selections on country change
            setSelectedCategory('');
            setSelectedRegion('');
            setSelectedRetailer('');
            setMyBrand('');
            setSelectedCompetitors([ALL_COMPETITORS]);
            setSelectedSubCategory('');
            setSelectedBasePack('');
            setSelectedQuantity('');

            // Clear category-scoped lists (will repopulate when category is selected)
            setAllBrands([]);
            setAllSubCategories([]);
            setMasterSubCategories([]);
            setAllBasePacks([]);
            setAllQuantities([]);
          }
        }
      } catch (err) {
        console.error("Failed to load country dimensions:", err);
      } finally {
        if (isMounted) setIsLoadingFilters(false);
      }
    };

    loadCountryDimensions();

    return () => { isMounted = false; };
  }, [country]);

  // --- LOAD CATEGORY-SCOPED DIMENSIONS (brands, subcategories, pack sizes) ---
  useEffect(() => {
    if (!country || !selectedCategory) {
      // Category cleared: reset category-scoped data. Brands are NOT
      // cleared here — the country-wide brand loader fills them so users
      // can pick "My Brand" before choosing a category.
      setAllSubCategories([]);
      setMasterSubCategories([]);
      setAllBasePacks([]);
      setAllQuantities([]);
      setSelectedSubCategory('');
      setSelectedBasePack('');
      setSelectedQuantity('');
      setIsDropdownLoading(false);
      if (!country) {
        setAllBrands([]);
        setMyBrand('');
        setSelectedCompetitors([ALL_COMPETITORS]);
      }
      return;
    }

    let isMounted = true;
    setIsDropdownLoading(true);

    const loadCategoryDimensions = async () => {
      try {
        // Fetch brands, subcategories, and pack sizes scoped to the selected category
        const [brandsRes, subsRes, packsRes] = await Promise.all([
          supabase.rpc('get_promo_brands_by_category', {
            p_country: getCountryKey(country),
            p_category: selectedCategory,
          }),
          supabase.rpc('get_promo_subcategories_by_category', {
            p_country: getCountryKey(country),
            p_category: selectedCategory,
          }),
          supabase.rpc('get_promo_pack_sizes_by_category', {
            p_country: getCountryKey(country),
            p_category: selectedCategory,
          }),
        ]);

        if (!isMounted) return;

        if (brandsRes.error) throw brandsRes.error;
        if (subsRes.error) throw subsRes.error;
        if (packsRes.error) throw packsRes.error;

        const brands = (brandsRes.data || []).map((r: any) => r.brand_name).filter(Boolean).sort();
        const subs = (subsRes.data || []).map((r: any) => r.subcategory_name).filter(Boolean).sort();
        const packs = (packsRes.data || []).map((r: any) => r.pack_size).filter(Boolean).sort();

        setAllBrands(brands);
        setAllSubCategories(subs);
        setMasterSubCategories(subs);
        setAllBasePacks(packs);
        setAllQuantities(packs);

        // Skip resetting category-scoped selections on initial mount to load persisted values
        if (isInitialCategoryLoad.current) {
          isInitialCategoryLoad.current = false;
        } else {
          // Category changed: keep brand selections that still exist in
          // the new category's brand list, reset the rest.
          setMyBrand(prev => (prev && brands.includes(prev) ? prev : ''));
          setSelectedCompetitors(prev => {
            const kept = prev.filter(c => c === ALL_COMPETITORS || brands.includes(c));
            return kept.length > 0 ? kept : [ALL_COMPETITORS];
          });
          setSelectedSubCategory('');
          setSelectedBasePack('');
          setSelectedQuantity('');
        }

      } catch (err) {
        console.error("Failed to load category dimensions:", err);
      } finally {
        if (isMounted) setIsDropdownLoading(false);
      }
    };

    loadCategoryDimensions();

    return () => { isMounted = false; };
  }, [country, selectedCategory]);

  // --- LOAD COUNTRY-WIDE BRANDS (no category selected yet) ---
  // Lets users see and pick "My Brand" up front, limited to brands in
  // categories they have permission for. Apply still requires a category.
  useEffect(() => {
    if (!country || selectedCategory) return;
    let isMounted = true;
    setIsDropdownLoading(true);

    const loadCountryWideBrands = async () => {
      try {
        const PAGE_SIZE = 1000;
        let rows: any[] = [];
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('mv_promo_dimensions')
            .select('dimension_value, parent_category')
            .eq('country_key', getCountryKey(country))
            .eq('dimension_type', 'brand')
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          rows = rows.concat(page);
          from += PAGE_SIZE;
          if (page.length < PAGE_SIZE) break;
        }
        if (!isMounted) return;

        const brands = Array.from(new Set(
          rows
            .filter((r: any) => r.parent_category && ALLOWED_CATEGORIES.has(r.parent_category) && isCategoryPermitted(r.parent_category))
            .map((r: any) => r.dimension_value)
            .filter(Boolean),
        )).sort() as string[];

        setAllBrands(brands);
        setMyBrand(prev => (prev && !brands.includes(prev) ? '' : prev));
      } catch (err) {
        console.error('Failed to load country-wide brands:', err);
      } finally {
        if (isMounted) setIsDropdownLoading(false);
      }
    };

    loadCountryWideBrands();
    return () => { isMounted = false; };
  }, [country, selectedCategory, isCategoryPermitted]);



  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [perCompetitorData, setPerCompetitorData] = useState<any[]>([]);


  const getCountryPrefsMap = useCallback((): Record<string, CountryFilterPrefs> => {
    try {
      const raw = sessionStorage.getItem(FILTER_PREFS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const setCountryPrefsMap = useCallback((next: Record<string, CountryFilterPrefs>) => {
    try {
      sessionStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(next));
    } catch {
      // no-op
    }
  }, []);

  // Helper function to hit the blazing fast RPC

  const handleApplyFilters = async () => {
    // Enforce selection order: Country first, then Category first, then Brand
    if (!country) {
      toast({ title: "Please select a Country first", description: "Country must be selected before applying filters.", variant: "destructive" });
      return;
    }
    if (!selectedCategory) {
      toast({ title: "Please select a Category first", description: "Category must be selected before applying filters.", variant: "destructive" });
      return;
    }
    if (!myBrand) {
      toast({ title: "Please select 'My Brand'", description: "Select your brand from the dropdown (brands are loaded based on the selected category).", variant: "destructive" });
      return;
    }

    // --- Brand on Brand validation: both brands must be selected ---
    if (isBrandOnBrandToggled) {
      const bobA = brandA || myBrand;
      const bobB = brandB;
      if (!bobA || !bobB) {
        toast({
          title: "Select both brands",
          description: "Both Brand A and Brand B must be selected for Brand on Brand analysis.",
          variant: "destructive",
        });
        return;
      }
      if (bobA === bobB) {
        toast({
          title: "Select different brands",
          description: "Brand A and Brand B cannot be the same.",
          variant: "destructive",
        });
        return;
      }
    }

    // Abort previous apply request if it exists and is running
    if (applyAbortControllerRef.current) {
      applyAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    applyAbortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setShowSelectedCompetitorBreakdown(false);

    // Clear raw data on new apply so lazy load triggers next time tabs are checked
    setDetailedDataFetched(false);
    setProcessedData([]);

    setAppliedMyBrand(myBrand);
    const normalizedSelectedCompetitors = selectedCompetitors.length > 0 ? selectedCompetitors : [ALL_COMPETITORS];
    const specificSelectedCompetitors = normalizedSelectedCompetitors.filter((c) => c !== ALL_COMPETITORS);
    const primarySelectedCompetitor = specificSelectedCompetitors.length === 1
      ? specificSelectedCompetitors[0]
      : (specificSelectedCompetitors.length > 1 ? MULTI_COMPETITORS : ALL_COMPETITORS);

    setAppliedCompetitors(normalizedSelectedCompetitors);
    setAppliedCompetitor(primarySelectedCompetitor);
    setAppliedRegion(selectedRegion);
    setAppliedRetailer(selectedRetailer);
    setAppliedCategory(selectedCategory);
    setAppliedSubCategory(selectedSubCategory);
    setAppliedBasePack(selectedBasePack);
    setAppliedQuantity(selectedQuantity);
    setAppliedOfferType(offerType);
    setAppliedCountry(country);

    // --- Capture Brand on Brand values BEFORE any setState ---
    // Use the dropdown values directly; do NOT overwrite brandA/brandB from header competitor
    const effectiveBobA = brandA || myBrand;
    const effectiveBobB = brandB;

    if (isBrandOnBrandToggled) {
      // Do NOT overwrite brandA/brandB — they are controlled by the Brand on Brand dropdowns
      setAppliedBrandOnBrand(true);
      setAppliedBrandA(effectiveBobA);
      setAppliedBrandB(effectiveBobB);
    } else {
      setAppliedBrandOnBrand(false);
      setAppliedBrandA('');
      setAppliedBrandB('');
    }

    try {
      // In Brand on Brand mode, use the two selected brands directly from the dropdowns
      const effectiveMyBrand = isBrandOnBrandToggled ? effectiveBobA : myBrand;
      const effectiveCompetitors = isBrandOnBrandToggled
        ? [effectiveBobB].filter(Boolean)  // Single competitor = Brand B
        : (specificSelectedCompetitors.length > 0 ? specificSelectedCompetitors : null);

      const rpcPayload = {
        p_country: getCountryKey(country),
        p_my_brand: effectiveMyBrand,
        p_competitors: effectiveCompetitors,
        p_region: selectedRegion || null,
        p_retailer: selectedRetailer || null,
        p_category: selectedCategory || null,
        p_subcategory: selectedSubCategory || null,
        p_quantity: selectedQuantity || selectedBasePack || null,
        p_distinct_offers: offerType === 'Distinct Offers'
      };

      const { data, error } = await supabase
        .rpc('get_promotion_analysis_stats_multi', rpcPayload)
        .abortSignal(controller.signal);
      if (error) throw error;

      if (data) {
        setAnalyticsData(data as AnalyticsData);
      }

      // Fetch per-competitor breakdown:
      // In Brand on Brand mode, fetch stats for both Brand A and Brand B
      // In normal mode, fetch if specific competitors are selected
      const brandsForBreakdown = isBrandOnBrandToggled
        ? [effectiveBobA, effectiveBobB].filter(Boolean)
        : (specificSelectedCompetitors.length > 0 ? [myBrand, ...specificSelectedCompetitors] : []);

      if (brandsForBreakdown.length > 0) {
        const { data: perCompData, error: perCompErr } = await supabase
          .rpc('get_per_competitor_stats', {
            p_country: getCountryKey(country),
            p_brands: brandsForBreakdown,
            p_region: selectedRegion || null,
            p_retailer: selectedRetailer || null,
            p_category: selectedCategory || null,
            p_subcategory: selectedSubCategory || null,
            p_quantity: selectedQuantity || selectedBasePack || null,
            p_distinct_offers: offerType === 'Distinct Offers',
          })
          .abortSignal(controller.signal);
        if (perCompErr) console.error('Per-competitor stats error:', perCompErr);
        setPerCompetitorData(perCompData || []);
      } else {
        setPerCompetitorData([]);
      }

      setDateRanges(getDateRanges(new Date()));
      toast({ title: "Success", description: "Analysis updated." });

    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('aborted')) {
        return;
      }
      console.error(e);
      setError(e.message || "An error occurred");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  // Auto-apply filters on mount if they were previously applied
  useEffect(() => {
    if (appliedCountry && appliedCategory && appliedMyBrand) {
      handleApplyFilters();
    }
  }, []);

  // INSTANT BRAND ON BRAND AUTO-APPLY
  // Automatically apply filters when Brand on Brand is toggled or when Brand A/B changes,
  // so the user doesn't have to manually click the "Apply Filters" button.
  useEffect(() => {
    if (!appliedMyBrand) return;

    if (isBrandOnBrandToggled) {
      // Only auto-apply if both brands are selected and they are different
      const bobA = brandA || myBrand;
      const bobB = brandB;
      if (bobA && bobB && bobA !== bobB) {
        handleApplyFilters();
      }
    } else {
      // If toggled off, immediately auto-apply to revert to the global filters
      handleApplyFilters();
    }
  }, [isBrandOnBrandToggled, brandA, brandB]);

  // --- UI HELPERS ---

  // Find this block in your code (UI Helpers)
  const { brand1Label, brand2Label, activityTitle, activityChartTitle } = useMemo(() => {
    // CHANGE: Use appliedMyBrand / appliedCompetitor for the labels
    const b1 = appliedBrandOnBrand ? (appliedBrandA || 'Brand A') : (appliedMyBrand || 'My Brand');

    const b2 = appliedBrandOnBrand
      ? (appliedBrandB || 'Brand B')
      : (
        appliedCompetitor === ALL_COMPETITORS
          ? 'All Competitors'
          : appliedCompetitor === MULTI_COMPETITORS
            ? `${appliedCompetitors.filter((c) => c !== ALL_COMPETITORS).length} Selected Competitors`
            : (appliedCompetitor || 'Competitor')
      );

    return {
      brand1Label: b1,
      brand2Label: b2,
      activityTitle: appliedBrandOnBrand ? 'Brand on Brand Share of Activity' : 'My Brand Share of Activity',
      activityChartTitle: `${b1} vs ${b2} Share of Activity (%)`,
    };
  }, [appliedBrandOnBrand, appliedBrandA, appliedBrandB, appliedMyBrand, appliedCompetitor, appliedCompetitors]);

  const priceTrendChartTitle = useMemo(() => priceOptions.find(opt => opt.value === priceTrendType)?.label.replace('Price', 'Avg Price') || 'Avg Offer Price', [priceTrendType, priceOptions]);
  const competitorBrands = useMemo(
    () => allBrands.filter((b) => b !== myBrand),
    [allBrands, myBrand]
  );

  // Build per-brand period map from RPC data
  const perBrandPeriodMap = useMemo(() => {
    const map = new Map<string, Record<DateRangeKey, { offerCount: number; categoryTotal: number; sharePct: number; avgOffer: number; avgRegular: number; avgDiscount: number; avgPricePerKg: number }>>();
    if (!perCompetitorData?.length) return map;

    for (const row of perCompetitorData) {
      const brand = row.brand_name;
      const pk = row.period_key as DateRangeKey;
      if (!map.has(brand)) {
        map.set(brand, {
          latest4Weeks: { offerCount: 0, categoryTotal: 0, sharePct: 0, avgOffer: 0, avgRegular: 0, avgDiscount: 0, avgPricePerKg: 0 },
          latest12Weeks: { offerCount: 0, categoryTotal: 0, sharePct: 0, avgOffer: 0, avgRegular: 0, avgDiscount: 0, avgPricePerKg: 0 },
          ytd: { offerCount: 0, categoryTotal: 0, sharePct: 0, avgOffer: 0, avgRegular: 0, avgDiscount: 0, avgPricePerKg: 0 },
          latest52Weeks: { offerCount: 0, categoryTotal: 0, sharePct: 0, avgOffer: 0, avgRegular: 0, avgDiscount: 0, avgPricePerKg: 0 },
        });
      }
      const entry = map.get(brand)!;
      entry[pk] = {
        offerCount: Number(row.offer_count || 0),
        categoryTotal: Number(row.category_total || 0),
        sharePct: Number(row.share_pct || 0),
        avgOffer: Number(row.avg_offer || 0),
        avgRegular: Number(row.avg_regular || 0),
        avgDiscount: Number(row.avg_discount || 0),
        avgPricePerKg: Number(row.avg_price_per_kg || 0)
      };
    }

    return map;
  }, [perCompetitorData]);

  // List of competitor brand names for rendering bars
  const combinedChartCompetitors = useMemo(() => {
    const selected = appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS);
    return selected.slice(0, MAX_COMPETITOR_SELECTION).filter(b => perBrandPeriodMap.has(b));
  }, [appliedCompetitors, perBrandPeriodMap]);

  // Shared brand → color mapping, keyed by the applied selection order so
  // every chart (here and in the sub-tabs) shows the same color per brand.
  const brandColorMap = useMemo(
    () => buildBrandColorMap(
      appliedMyBrand,
      appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS).slice(0, MAX_COMPETITOR_SELECTION),
    ),
    [appliedMyBrand, appliedCompetitors],
  );

  // Build combined multi-competitor chart data: one chart with all brands as bars
  const combinedCompetitorChartData = useMemo(() => {
    if (appliedBrandOnBrand) return [];
    const selected = appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS);
    if (selected.length <= 1) return [];
    if (perBrandPeriodMap.size === 0) return [];

    const myRow = perBrandPeriodMap.get(appliedMyBrand);
    if (!myRow) return [];

    const keys: DateRangeKey[] = ['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'];
    const validCompetitors = selected.slice(0, MAX_COMPETITOR_SELECTION).filter(b => perBrandPeriodMap.has(b));

    return keys.map((k) => {
      const point: Record<string, any> = {
        name: dateRanges[k].label,
        [appliedMyBrand]: myRow?.[k]?.sharePct ?? 0,
        [`${appliedMyBrand}_count`]: myRow?.[k]?.offerCount ?? 0,
        totalCount: myRow?.[k]?.categoryTotal ?? 0,
      };
      for (const brand of validCompetitors) {
        const compRow = perBrandPeriodMap.get(brand)!;
        point[brand] = compRow?.[k]?.sharePct ?? 0;
        point[`${brand}_count`] = compRow?.[k]?.offerCount ?? 0;
      }
      return point;
    });
  }, [appliedBrandOnBrand, appliedCompetitors, perBrandPeriodMap, appliedMyBrand, dateRanges]);

  // Build combined multi-competitor price trend chart data
  const combinedCompetitorPriceTrendChartData = useMemo(() => {
    if (appliedBrandOnBrand) return [];
    const selected = appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS);
    if (selected.length <= 1) return [];
    if (perBrandPeriodMap.size === 0) return [];

    const myRow = perBrandPeriodMap.get(appliedMyBrand);
    if (!myRow) return [];

    const keys: DateRangeKey[] = ['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'];
    const validCompetitors = selected.slice(0, MAX_COMPETITOR_SELECTION).filter(b => perBrandPeriodMap.has(b));

    return keys.map((k) => {
      const myVal = getRawValue(analyticsData?.[k], priceTrendType, 'myBrand');
      const point: Record<string, any> = {
        name: dateRanges[k].label,
        [appliedMyBrand]: myVal,
      };
      for (const brand of validCompetitors) {
        const compRow = perBrandPeriodMap.get(brand)!;
        const rowData = compRow?.[k];
        const brandVal = rowData
          ? (priceTrendType === 'offer'
              ? rowData.avgOffer
              : (priceTrendType === 'regular'
                  ? rowData.avgRegular
                  : (priceTrendType === 'discount'
                      ? rowData.avgDiscount
                      : rowData.avgOffer)))
          : 0;
        point[brand] = brandVal;
      }
      return point;
    });
  }, [appliedBrandOnBrand, appliedCompetitors, perBrandPeriodMap, appliedMyBrand, dateRanges, priceTrendType, analyticsData]);

  // --- DISPLAY DATA PREPARATION ---
  const displayData = useMemo(() => {
    if (!analyticsData) return null;


    // const currentCurrency = currencyMap[country] || '';
    // CHANGE: Use appliedCountry so currency matches the data shown
    const currentCurrency = getCurrency(appliedCountry);

    const chartKeys: DateRangeKey[] = ['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'];
    const activityChart = chartKeys
      .filter((k) => analyticsData[k] != null)
      .map(k => {
        return {
          name: dateRanges[k].label,
          myBrandShare: analyticsData[k]?.myBrandShare ?? 0,
          competitorShare: analyticsData[k]?.competitorShare ?? 0,
          myBrandCount: analyticsData[k]?.myBrandCount ?? 0,
          competitorCount: analyticsData[k]?.competitorCount ?? 0,
          // Brand on Brand uses the same share values (RPC already filters by the selected brands)
          brandA: analyticsData[k]?.brandAShare ?? analyticsData[k]?.myBrandShare ?? 0,
          brandB: analyticsData[k]?.brandBShare ?? analyticsData[k]?.competitorShare ?? 0,
        };
      });

    const selected = appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS);
    const hasMultipleCompetitors = !appliedBrandOnBrand && selected.length > 1 && perBrandPeriodMap.size > 0;

    let activityTable = [];
    if (hasMultipleCompetitors) {
      // 1. My Brand
      activityTable.push({
        brand: appliedMyBrand || 'My Brand',
        latest4Weeks: (analyticsData.latest4Weeks?.myBrandCount ?? 0).toLocaleString(),
        latest12Weeks: (analyticsData.latest12Weeks?.myBrandCount ?? 0).toLocaleString(),
        ytd: (analyticsData.ytd?.myBrandCount ?? 0).toLocaleString(),
        latest52Weeks: (analyticsData.latest52Weeks?.myBrandCount ?? 0).toLocaleString()
      });

      // 2. Each Competitor brand as normal rows (no dropdowns)
      const validCompetitors = selected.filter(b => perBrandPeriodMap.has(b));
      validCompetitors.forEach((brand) => {
        const compRow = perBrandPeriodMap.get(brand)!;
        activityTable.push({
          brand: brand,
          latest4Weeks: (compRow?.latest4Weeks?.offerCount ?? 0).toLocaleString(),
          latest12Weeks: (compRow?.latest12Weeks?.offerCount ?? 0).toLocaleString(),
          ytd: (compRow?.ytd?.offerCount ?? 0).toLocaleString(),
          latest52Weeks: (compRow?.latest52Weeks?.offerCount ?? 0).toLocaleString()
        });
      });

      // 3. Total row
      activityTable.push({
        brand: 'Total',
        latest4Weeks: (analyticsData.latest4Weeks?.totalCount ?? 0).toLocaleString(),
        latest12Weeks: (analyticsData.latest12Weeks?.totalCount ?? 0).toLocaleString(),
        ytd: (analyticsData.ytd?.totalCount ?? 0).toLocaleString(),
        latest52Weeks: (analyticsData.latest52Weeks?.totalCount ?? 0).toLocaleString()
      });
    } else {
      activityTable = [
        {
          brand: appliedBrandOnBrand ? brand1Label : (appliedMyBrand || 'My Brand'),
          latest4Weeks: (analyticsData.latest4Weeks?.myBrandCount ?? 0).toLocaleString(),
          latest12Weeks: (analyticsData.latest12Weeks?.myBrandCount ?? 0).toLocaleString(),
          ytd: (analyticsData.ytd?.myBrandCount ?? 0).toLocaleString(),
          latest52Weeks: (analyticsData.latest52Weeks?.myBrandCount ?? 0).toLocaleString()
        },
        {
          brand: brand2Label,
          latest4Weeks: (analyticsData.latest4Weeks?.competitorCount ?? 0).toLocaleString(),
          latest12Weeks: (analyticsData.latest12Weeks?.competitorCount ?? 0).toLocaleString(),
          ytd: (analyticsData.ytd?.competitorCount ?? 0).toLocaleString(),
          latest52Weeks: (analyticsData.latest52Weeks?.competitorCount ?? 0).toLocaleString()
        },
        { brand: 'Total', latest4Weeks: (analyticsData.latest4Weeks?.totalCount ?? 0).toLocaleString(), latest12Weeks: (analyticsData.latest12Weeks?.totalCount ?? 0).toLocaleString(), ytd: (analyticsData.ytd?.totalCount ?? 0).toLocaleString(), latest52Weeks: (analyticsData.latest52Weeks?.totalCount ?? 0).toLocaleString() }
      ];
    }

    // Bind pure utility helpers to local scope variables
    const getLocalRawValue = (period: PeriodAnalysis | undefined, brand: 'myBrand' | 'competitor') =>
      getRawValue(period, priceTrendType, brand);

    const getLocalFormatValue = (value: number) =>
      formatValue(value, priceTrendType, currentCurrency);

    const getLocalPriceData = (period: PeriodAnalysis | undefined, brand: 'myBrand' | 'competitor') =>
      getPriceData(period, priceTrendType, brand, currentCurrency);

    const getLocalFormatPriceSummary = (period: PeriodAnalysis | undefined) =>
      formatPriceSummary(period, currentCurrency);

    let priceTrendTable = [];
    if (hasMultipleCompetitors) {
      // 1. My Brand
      priceTrendTable.push({
        brand: appliedMyBrand || 'My Brand',
        latest4Weeks: getLocalPriceData(analyticsData.latest4Weeks, 'myBrand'),
        latest12Weeks: getLocalPriceData(analyticsData.latest12Weeks, 'myBrand'),
        ytd: getLocalPriceData(analyticsData.ytd, 'myBrand'),
        latest52Weeks: getLocalPriceData(analyticsData.latest52Weeks, 'myBrand')
      });

      // 2. Each Competitor brand as normal rows (no dropdowns)
      const validCompetitors = selected.filter(b => perBrandPeriodMap.has(b));
      validCompetitors.forEach((brand) => {
        const compRow = perBrandPeriodMap.get(brand)!;
        const getBrandVal = (k: DateRangeKey) => {
          const rowData = compRow?.[k];
          if (!rowData) return 0;
          return priceTrendType === 'offer'
            ? rowData.avgOffer
            : (priceTrendType === 'regular'
                ? rowData.avgRegular
                : (priceTrendType === 'discount'
                    ? rowData.avgDiscount
                    : (priceTrendType === 'perkg'
                        ? rowData.avgPricePerKg
                        : rowData.avgOffer)));
        };
        priceTrendTable.push({
          brand: brand,
          latest4Weeks: getLocalFormatValue(getBrandVal('latest4Weeks')),
          latest12Weeks: getLocalFormatValue(getBrandVal('latest12Weeks')),
          ytd: getLocalFormatValue(getBrandVal('ytd')),
          latest52Weeks: getLocalFormatValue(getBrandVal('latest52Weeks'))
        });
      });

      // 3. Average row
      const getPeriodAverage = (k: DateRangeKey) => {
        const myVal = getLocalRawValue(analyticsData[k], 'myBrand');
        const vals = [myVal];
        validCompetitors.forEach((brand) => {
          const compRow = perBrandPeriodMap.get(brand)!;
          const rowData = compRow?.[k];
          if (rowData) {
            const brandVal = priceTrendType === 'offer'
              ? rowData.avgOffer
              : (priceTrendType === 'regular'
                  ? rowData.avgRegular
                  : (priceTrendType === 'discount'
                      ? rowData.avgDiscount
                      : (priceTrendType === 'perkg'
                          ? rowData.avgPricePerKg
                          : rowData.avgOffer)));
            vals.push(brandVal);
          }
        });
        const activeVals = vals.filter(v => v > 0);
        return activeVals.length > 0 ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length : 0;
      };

      priceTrendTable.push({
        brand: 'Average',
        latest4Weeks: getLocalFormatValue(getPeriodAverage('latest4Weeks')),
        latest12Weeks: getLocalFormatValue(getPeriodAverage('latest12Weeks')),
        ytd: getLocalFormatValue(getPeriodAverage('ytd')),
        latest52Weeks: getLocalFormatValue(getPeriodAverage('latest52Weeks'))
      });
    } else {
      priceTrendTable = [
        { brand: appliedBrandOnBrand ? brand1Label : (appliedMyBrand || 'My Brand'), latest4Weeks: getLocalPriceData(analyticsData.latest4Weeks, 'myBrand'), latest12Weeks: getLocalPriceData(analyticsData.latest12Weeks, 'myBrand'), ytd: getLocalPriceData(analyticsData.ytd, 'myBrand'), latest52Weeks: getLocalPriceData(analyticsData.latest52Weeks, 'myBrand') },
        { brand: brand2Label, latest4Weeks: getLocalPriceData(analyticsData.latest4Weeks, 'competitor'), latest12Weeks: getLocalPriceData(analyticsData.latest12Weeks, 'competitor'), ytd: getLocalPriceData(analyticsData.ytd, 'competitor'), latest52Weeks: getLocalPriceData(analyticsData.latest52Weeks, 'competitor') },
        {
          brand: 'Average',
          latest4Weeks: getLocalFormatValue((getLocalRawValue(analyticsData.latest4Weeks, 'myBrand') + getLocalRawValue(analyticsData.latest4Weeks, 'competitor')) / 2),
          latest12Weeks: getLocalFormatValue((getLocalRawValue(analyticsData.latest12Weeks, 'myBrand') + getLocalRawValue(analyticsData.latest12Weeks, 'competitor')) / 2),
          ytd: getLocalFormatValue((getLocalRawValue(analyticsData.ytd, 'myBrand') + getLocalRawValue(analyticsData.ytd, 'competitor')) / 2),
          latest52Weeks: getLocalFormatValue((getLocalRawValue(analyticsData.latest52Weeks, 'myBrand') + getLocalRawValue(analyticsData.latest52Weeks, 'competitor')) / 2),
        },
      ];
    }

    const priceTrendChart = chartKeys
      .filter((k) => analyticsData[k] != null)
      .map(k => {
        const p = analyticsData[k];
        return {
          name: dateRanges[k].label,
          myBrand: getLocalRawValue(p, 'myBrand'),
          competitor: getLocalRawValue(p, 'competitor')
        };
      });

    const priceSummary: Record<string, { title: string; data: any[] }> = {
      offerPrice: { title: 'Offer Price', data: [] },
      regularPrice: { title: 'Regular Price', data: [] },
      discount: { title: 'Discount %', data: [] },
      pricePerKg: { title: 'Price per Kg/Ltr', data: [] },
    };

    for (const k of chartKeys) {
      if (analyticsData[k] == null) continue;
      const periodLabel = dateRanges[k].label;
      const periodData = getLocalFormatPriceSummary(analyticsData[k]);
      priceSummary.offerPrice.data.push({ period: periodLabel, myBrand: periodData.offerPrice.myBrand, competitor: periodData.offerPrice.competitor });
      priceSummary.regularPrice.data.push({ period: periodLabel, myBrand: periodData.regularPrice.myBrand, competitor: periodData.regularPrice.competitor });
      priceSummary.discount.data.push({ period: periodLabel, myBrand: periodData.discount.myBrand, competitor: periodData.discount.competitor });
      priceSummary.pricePerKg.data.push({ period: periodLabel, myBrand: periodData.pricePerKg.myBrand, competitor: periodData.pricePerKg.competitor });
    }

    return { activityChart, activityTable, priceTrendTable, priceTrendChart, priceSummary };
  }, [analyticsData, myBrand, appliedBrandOnBrand, appliedBrandA, appliedBrandB, dateRanges, priceTrendType, selectedCompetitors, brand1Label, brand2Label, appliedCountry, appliedMyBrand, appliedCompetitors, perBrandPeriodMap]);

  const categoryOverallMiniCharts = useMemo(() => {
    if (![]?.length) return [];
    const keys: DateRangeKey[] = ['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'];
    return ([] as any[]).map((row, idx) => ({
      brand: row.brand,
      color: CATEGORY_BRAND_CHART_COLORS[idx % CATEGORY_BRAND_CHART_COLORS.length],
      activityData: keys.map((k) => ({
        name: dateRanges[k].label,
        share: Number(row.periods[k].sharePct.toFixed(1)),
      })),
      priceData: keys.map((k) => ({
        name: dateRanges[k].label,
        avgOffer: row.periods[k].avgOffer,
      })),
      tableRow: keys.map((k) => ({
        key: k,
        label: dateRanges[k].label,
        count: row.periods[k].offerCount,
        total: row.periods[k].categoryTotal,
        share: row.periods[k].sharePct,
      })),
    }));
  }, [[], dateRanges]);

  // Keep the classic overall layout/visual design.
  const useCategoryOverallLayout = false;

  const selectedCompetitorBreakdownRows = useMemo(() => {
    if (appliedCompetitor !== MULTI_COMPETITORS) return [];
    const selected = appliedCompetitors.filter((c) => c && c !== ALL_COMPETITORS);
    if (selected.length <= 1) return [];
    if (perBrandPeriodMap.size === 0) return [];

    return selected
      .map((brand) => {
        const row = perBrandPeriodMap.get(brand);
        if (!row) return null;
        return {
          brand,
          latest4Weeks: row.latest4Weeks?.offerCount ?? 0,
          latest12Weeks: row.latest12Weeks?.offerCount ?? 0,
          ytd: row.ytd?.offerCount ?? 0,
          latest52Weeks: row.latest52Weeks?.offerCount ?? 0,
        };
      })
      .filter(
        (
          item
        ): item is {
          brand: string;
          latest4Weeks: number;
          latest12Weeks: number;
          ytd: number;
          latest52Weeks: number;
        } => Boolean(item)
      );
  }, [perBrandPeriodMap, appliedCompetitor, appliedCompetitors]);


  const [isLoadingDetailedData, setIsLoadingDetailedData] = useState(false);
  const [detailedDataFetched, setDetailedDataFetched] = useState(false);

  const visibleCompetitorOptions = useMemo(() => {
    const q = competitorSearchText.trim().toLowerCase();
    return allBrands
      .filter((b) => b !== myBrand)
      .filter((b) => !q || b.toLowerCase().includes(q));
  }, [allBrands, myBrand, competitorSearchText]);

  const sortedCompetitorOptions = useMemo(() => {
    const selected = visibleCompetitorOptions.filter(brand => selectedCompetitors.includes(brand));
    const unselected = visibleCompetitorOptions.filter(brand => !selectedCompetitors.includes(brand));
    return [...selected, ...unselected];
  }, [visibleCompetitorOptions, selectedCompetitors]);

  const fetchRawDataForSubTabs = useCallback(async () => {
    if (!appliedCountry || !appliedMyBrand) {
      console.log('[fetchRawDataForSubTabs] Skipping: no appliedCountry or appliedMyBrand', { appliedCountry, appliedMyBrand });
      return;
    }
    console.log('[fetchRawDataForSubTabs] Starting fetch with:', { appliedCountry, appliedCategory, appliedRetailer, appliedSubCategory });
    setIsLoadingDetailedData(true);
    try {
      const MAX_ROWS = 10000;
      // Bound the fetch to the longest analysis window (52 weeks) so the
      // row cap never cuts into the analyzed range — keeps sub-tab counts
      // identical to the Overall Summary RPC.
      const fromDate = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase.rpc('get_flyer_products_detail', {
        p_country: getCountryKey(appliedCountry),
        p_region: appliedRegion || null,
        p_retailer: appliedRetailer || null,
        p_category: appliedCategory || null,
        p_subcategory: appliedSubCategory || null,
        p_quantity: appliedQuantity || appliedBasePack || null,
        p_from_date: formatDate(fromDate, 'yyyy-MM-dd'),
        p_max_rows: MAX_ROWS,
      });
      if (error) throw error;

      // RPC returns one jsonb array (avoids PostgREST's 1000-row cap).
      // Tolerate the legacy row shape ([{ product: {...} }]) in case the
      // DB function hasn't been migrated yet.
      const raw: any[] = Array.isArray(data) ? data : [];
      const allData: any[] = raw.length && raw[0]?.product ? raw.map((r: any) => r.product) : raw;
      if (allData.length >= MAX_ROWS) {
        console.warn(`[fetchRawDataForSubTabs] Result truncated at ${MAX_ROWS} rows (newest first); narrow the filters for complete data.`);
      }
      console.log('[fetchRawDataForSubTabs] Fetched total rows:', allData.length);
      setProcessedData(allData as any as FlyerProduct[]);
    } catch (err) {
      console.error('Failed to fetch raw data:', err);
    } finally {
      setIsLoadingDetailedData(false);
      setDetailedDataFetched(true);
    }
  }, [appliedCountry, appliedMyBrand, appliedRegion, appliedRetailer, appliedCategory, appliedSubCategory, appliedQuantity, appliedBasePack]);

  // Lazy-load raw data when switching to subtabs — fetch once per apply
  useEffect(() => {
    if ((activeTab === 'competitor' || activeTab === 'allBrand' || activeTab === 'export' || activeTab === 'priceTrend') && !detailedDataFetched && !isLoadingDetailedData && appliedMyBrand) {
      fetchRawDataForSubTabs();
    }
  }, [activeTab, detailedDataFetched, isLoadingDetailedData, fetchRawDataForSubTabs, appliedMyBrand]);

  const filteredByExportFilters = useMemo(() => {
    let list = processedData;

    // 1. Filter by Analysis Week (if exportAllData is not checked)
    if (!exportAllData && exportAnalysisWeek) {
      const range = dateRanges[exportAnalysisWeek as DateRangeKey];
      if (range) {
        list = list.filter(p => {
          const pDate = getProductEffectiveDate(p);
          if (!pDate) return false;
          return pDate >= range.from && pDate <= range.to;
        });
      }
    }

    // 2. Filter by Distinct Offers vs All Offers local toggle
    if (!exportAllData && exportOfferType === 'Distinct Offers') {
      const uniqueMap = new Map();
      list.forEach((item) => {
        const key = `${item.brand}_${item.product_name}_${item.weight_quantity}_${item.discounted_price}`.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      list = Array.from(uniqueMap.values());
    }

    // 3. Sort by date order
    return [...list].sort((a, b) => {
      const dateA = getProductEffectiveDate(a)?.getTime() || 0;
      const dateB = getProductEffectiveDate(b)?.getTime() || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [processedData, exportAnalysisWeek, exportOfferType, exportAllData, dateRanges, sortOrder]);

  const handleDownload = async () => {
    const dataToExport = exportAllData ? processedData : filteredByExportFilters;
    if (dataToExport.length === 0) {
      toast({ title: "No data to export or data still loading", variant: "destructive" });
      return;
    }
    // Multi-sheet workbook built from the data_pivot template: fulldata plus the
    // five live PivotTables (Leaflet Share / DOP / Price Per KG / SKU / Pack).
    try {
      await downloadPivotWorkbook(
        dataToExport as any,
        `promo_analysis_${new Date().toISOString().split('T')[0]}.xlsx`,
      );
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const insights = useMemo(() => {
    if (filteredByExportFilters.length === 0) return null;

    const total = filteredByExportFilters.length;
    const retailerCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    let totalPrice = 0;
    let validPriceCount = 0;
    const uniqueProducts = new Set<string>();
    const regions = new Set<string>();

    filteredByExportFilters.forEach(item => {
      if (item.mart_name) retailerCounts[item.mart_name] = (retailerCounts[item.mart_name] || 0) + 1;
      if (item.brand) brandCounts[item.brand] = (brandCounts[item.brand] || 0) + 1;
      
      if (item.discounted_price) {
        const num = parseFloat(item.discounted_price.toString().replace(/[^\d.]/g, ''));
        if (!isNaN(num) && num > 0) {
          totalPrice += num;
          validPriceCount++;
        }
      }

      if (item.product_name) uniqueProducts.add(item.product_name.toLowerCase());
      if (item.coverage_regions) {
        item.coverage_regions.split(/[;,|]/g).forEach(r => regions.add(r.trim()));
      }
    });

    const avgPrice = validPriceCount > 0 ? (totalPrice / validPriceCount).toFixed(1) : '0.0';
    
    let topRetailer = 'N/A';
    let maxRetailerCount = 0;
    Object.entries(retailerCounts).forEach(([ret, count]) => {
      if (count > maxRetailerCount) {
        maxRetailerCount = count;
        topRetailer = ret;
      }
    });

    let topBrand = 'N/A';
    let maxBrandCount = 0;
    Object.entries(brandCounts).forEach(([br, count]) => {
      if (count > maxBrandCount) {
        maxBrandCount = count;
        topBrand = br;
      }
    });

    return {
      total,
      avgPrice,
      topRetailer,
      topBrand,
      uniqueProductCount: uniqueProducts.size,
      regionsCount: regions.size,
    };
  }, [filteredByExportFilters]);

  const triggerGetInsights = () => {
    setIsInsightsOpen(true);
    setIsAnalyzingInsights(true);
    setShowThreeDotsMenu(false);
    setTimeout(() => {
      setIsAnalyzingInsights(false);
    }, 1200);
  };

  return (
    <section className="bg-black text-gray-200 min-h-screen p-4 md:p-6 font-sans">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <svg style={{ height: 0 }}><defs><linearGradient id="colorG1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.9} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0.6} /></linearGradient><linearGradient id="colorG2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.9} /><stop offset="95%" stopColor="#ea580c" stopOpacity={0.6} /></linearGradient></defs></svg>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 mb-6 overflow-visible">
        {/* TOP BAR */}
        <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 px-4 py-3 bg-zinc-950/50 border-b border-zinc-800 rounded-t-lg">
          <div className="w-full sm:w-72 sm:min-w-[18rem]">
            <CustomFilterDropdown
              label="My Brand"
              value={myBrand}
              onChange={(val) => {
                if (!selectedCategory && val) {
                  toast({ title: "Select a Category first", description: "Please choose a category before selecting your brand.", variant: "destructive" });
                  return;
                }
                setMyBrand(val);
              }}
              options={allBrands.filter((b) => !selectedCompetitors.includes(b))}
              placeholder={isDropdownLoading ? 'Loading brands...' : 'Choose your brand here'}
              disabled={isLoadingFilters || isDropdownLoading}
              searchable={true}
              highlightClass="py-1.5 border-zinc-700 hover:border-zinc-500 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 bg-zinc-800 rounded-md"
              labelClass="text-zinc-400 group-hover:text-purple-400 text-[9px] -top-2.5 px-0.5"
            />
          </div>

          {/* UPDATED COUNTRY SELECTOR */}
          <div className="w-full sm:w-56 sm:min-w-[14rem]">
            <CustomFilterDropdown
              label="Country"
              value={country}
              onChange={setCountry}
              options={availableCountries}
              placeholder="Select Country"
              disabled={isLoadingFilters}
              highlightClass="py-1.5 border-zinc-700 hover:border-zinc-500 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 bg-zinc-800 rounded-md"
              labelClass="text-zinc-400 group-hover:text-purple-400 text-[9px] -top-2.5 px-0.5"
            />
          </div>
          {/* --- START: Timeline Info Button (Left Side Hover & Dynamic Dates) --- */}
          <div className="relative group flex items-center justify-end sm:justify-start ml-1">
            <Info className="h-3.5 w-3.5 text-zinc-500 hover:text-purple-400 cursor-pointer transition-colors duration-200" />

            {/* Tooltip */}
            <div className="absolute bottom-full left-0 -translate-x-[80%] mb-4
                w-fit max-w-xs p-2.5 bg-zinc-900 border border-zinc-700
                rounded-md shadow-xl hidden group-hover:block
                z-[100] pointer-events-none">

              {/* Arrow */}
              <div className="absolute left-[80%] bottom-0 -mb-1.5
                w-3 h-3 bg-zinc-900 border-b border-r
                border-zinc-700 rotate-45"></div>

              {/* Content */}
              <div className="text-[11px] leading-tight text-zinc-400 whitespace-nowrap">

                {/* Heading */}
                <div className="text-white font-semibold text-[11px] mb-1">
                  Timeline
                </div>
                <div className="w-full h-px bg-white/30 mb-2" />

                <div className="flex gap-1.5">
                  <span className="text-purple-400 font-medium">4 weeks:</span>
                  <span>
                    {formatDate(dateRanges.latest4Weeks.from, 'dd MMM yyyy')}
                    <span className="mx-1">-</span>
                    {formatDate(dateRanges.latest4Weeks.to, 'dd MMM yyyy')}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <span className="text-purple-400 font-medium">12 weeks:</span>
                  <span>
                    {formatDate(dateRanges.latest12Weeks.from, 'dd MMM yyyy')}
                    <span className="mx-1">-</span>
                    {formatDate(dateRanges.latest12Weeks.to, 'dd MMM yyyy')}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <span className="text-purple-400 font-medium">YTD (Year To Date):</span>
                  <span>
                    {formatDate(dateRanges.ytd.from, 'dd MMM yyyy')}
                    <span className="mx-1">-</span>
                    {formatDate(dateRanges.ytd.to, 'dd MMM yyyy')}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <span className="text-purple-400 font-medium">52 weeks:</span>
                  <span>
                    {formatDate(dateRanges.latest52Weeks.from, 'dd MMM yyyy')}
                    <span className="mx-1">-</span>
                    {formatDate(dateRanges.latest52Weeks.to, 'dd MMM yyyy')}
                  </span>
                </div>
              </div>
            </div>
          </div>


          {/* --- END: Timeline Info Button --- */}
        </div>

        {/* FILTERS */}
        <div className="p-4 md:p-6 bg-zinc-900/40 border-b border-zinc-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-6">

            {/* Row 1 */}
            <CustomFilterDropdown
              label="Region"
              value={selectedRegion}
              onChange={setSelectedRegion}
              options={allRegions}
              placeholder="All Regions"
              disabled={isLoadingFilters}
            />

            {/* Retailer */}
            <CustomFilterDropdown
              label="Retailer"
              value={selectedRetailer}
              onChange={setSelectedRetailer}
              options={allRetailers}
              placeholder="All Retailers"
              disabled={isLoadingFilters}
            />

            {/* Category */}
            <CustomFilterDropdown
              label="Category"
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={allCategories.filter(isCategoryPermitted)}
              placeholder="All Categories"
              disabled={isLoadingFilters}
              searchable={true}
            />

            {/* Subcategory */}
            <CustomFilterDropdown
              label="Subcategory"
              value={selectedSubCategory}
              onChange={setSelectedSubCategory}
              options={allSubCategories}
              placeholder={isDropdownLoading ? "Loading..." : "All Subcategories"}
              disabled={isLoadingFilters || isDropdownLoading}
              searchable={true}
              loading={isDropdownLoading}
            />

            {/* Row 2 */}
            {/* My Brand (Disabled) */}
            <div className="relative group">
              <label className="absolute -top-2.5 left-3 px-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-zinc-900 z-10 shadow-sm border border-purple-900/50 rounded-full">Primary Brand</label>
              <div className="w-full bg-zinc-950/50 border border-purple-900/30 text-zinc-400 font-bold text-sm rounded-lg px-4 py-3 cursor-not-allowed">
                {myBrand || (!selectedCategory ? "← Select a category first" : "Select from top bar")}
              </div>
            </div>

             {/* Competitor */}
            <div className="relative group" ref={competitorDropdownRef}>
              <label className="absolute -top-2.5 left-3 px-2 text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-zinc-900 z-10 shadow-sm border border-orange-900/50 rounded-full">Vs. Competitor</label>
              <button
                type="button"
                disabled={isLoadingFilters || isDropdownLoading}
                onClick={() => {
                  if (!selectedCategory) {
                    toast({ title: "Select a Category first", description: "Competitor brands are loaded based on the selected category.", variant: "destructive" });
                    return;
                  }
                  setIsCompetitorDropdownOpen((prev) => !prev);
                  setCompetitorSearchText('');
                }}
                title={selectedCompetitors.includes(ALL_COMPETITORS) ? 'All Competitors' : selectedCompetitors.join(', ')}
                className="w-full bg-transparent border border-orange-900/30 text-white font-bold text-sm rounded-lg px-3 py-3 text-left hover:border-orange-500/50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:opacity-50 transition-all appearance-none cursor-pointer shadow-[inset_0_2px_10px_rgba(234,88,12,0.02)] truncate pr-8"
              >
                {!selectedCategory
                  ? '← Select a category first'
                  : selectedCompetitors.includes(ALL_COMPETITORS)
                    ? 'All Competitors'
                    : selectedCompetitors.join(', ')}
              </button>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500/50 pointer-events-none" />
              {isCompetitorDropdownOpen && !isLoadingFilters && (
                <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl z-50 p-1.5 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-md pb-2 pt-0.5 px-1 border-b border-zinc-800/60 z-10 space-y-1.5">
                    <div className="relative flex items-center">
                      <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      <input
                        value={competitorSearchText}
                        onChange={(e) => setCompetitorSearchText(e.target.value)}
                        placeholder="Search competitor brand..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 placeholder-zinc-500 transition-all"
                      />
                      {competitorSearchText && (
                        <button 
                          type="button"
                          onClick={() => setCompetitorSearchText('')} 
                          className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {!false && allBrands.length > 0 && (
                      <div className="text-[10px] text-zinc-500 font-medium pl-1">
                        {allBrands.length.toLocaleString()} brands available
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCompetitors([ALL_COMPETITORS]);
                      setIsCompetitorDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-all rounded-lg flex items-center justify-between ${
                      selectedCompetitors.includes(ALL_COMPETITORS)
                        ? 'bg-orange-500/10 text-orange-400 font-semibold border-l-2 border-l-orange-500'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                  >
                    <span>All Competitors</span>
                    {selectedCompetitors.includes(ALL_COMPETITORS) && (
                      <Check className="h-3.5 w-3.5 text-orange-400" />
                    )}
                  </button>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {sortedCompetitorOptions.map((brand) => {
                      const isSelected = selectedCompetitors.includes(brand);
                      return (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => {
                            const withoutAll = selectedCompetitors.filter((c) => c !== ALL_COMPETITORS);
                            const exists = withoutAll.includes(brand);
                            if (!exists && withoutAll.length >= MAX_COMPETITOR_SELECTION) {
                              toast({
                                title: `Select up to ${MAX_COMPETITOR_SELECTION} competitors`,
                                description: 'Remove one brand before adding another.',
                                variant: 'destructive',
                              });
                              return;
                            }
                            const next = exists
                              ? withoutAll.filter((c) => c !== brand)
                              : [...withoutAll, brand];
                            setSelectedCompetitors(next.length > 0 ? next : [ALL_COMPETITORS]);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm transition-all rounded-lg flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 text-orange-400 font-semibold border-l-2 border-l-orange-500'
                              : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                          }`}
                        >
                          <span>{brand}</span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-orange-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Base Pack */}
            <CustomFilterDropdown
              label="Base Pack Size"
              value={selectedBasePack}
              onChange={setSelectedBasePack}
              options={allBasePacks}
              placeholder={isDropdownLoading ? "Loading..." : "All Packs"}
              disabled={isLoadingFilters || isDropdownLoading}
              loading={isDropdownLoading}
            />

            {/* Quantity */}
            <CustomFilterDropdown
              label="Quantity"
              value={selectedQuantity}
              onChange={setSelectedQuantity}
              options={allQuantities}
              placeholder={isDropdownLoading ? "Loading..." : "All Quantities"}
              disabled={isLoadingFilters || isDropdownLoading}
              loading={isDropdownLoading}
            />

            {/* Row 3 */}
            {/* Add On Pack */}
            <CustomFilterDropdown
              label="Add-on Pack"
              value=""
              onChange={() => {}}
              options={[]}
              placeholder="All Add on Packs"
              disabled={isLoadingFilters}
            />

            {/* Offer Type */}
            <CustomFilterDropdown
              label="Filter Distinct"
              value={offerType}
              onChange={setOfferType}
              options={["All Offers", "Distinct Offers"]}
              placeholder="All Offers"
              disabled={isLoadingFilters}
            />

            {/* Empty space for design balance */}
            <div className="hidden lg:block"></div>

            {/* Apply Button */}
            <div className="flex justify-end items-end h-full">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading || isLoadingFilters || !selectedCategory || !myBrand}
                className="w-full h-full min-h-[46px] flex items-center justify-center rounded-lg font-bold text-white tracking-widest uppercase text-xs bg-gradient-to-r from-purple-600 to-orange-500 shadow-[0_0_15px_rgba(147,51,234,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(147,51,234,0.5)] disabled:opacity-50 disabled:grayscale disabled:hover:scale-100 disabled:cursor-not-allowed border border-white/20"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Apply Filters"}
              </button>
            </div>

          </div>
        </div>

        {/* TABS */}
        <div className="border-t border-zinc-800 px-4 md:px-6">
          <div className="flex flex-wrap gap-6">
            <button onClick={() => setActiveTab('overall')} className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overall' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Overall Summary</button>
            <button onClick={() => setActiveTab('competitor')} className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'competitor' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Competitor Pricing Analysis</button>
            <button onClick={() => setActiveTab('allBrand')} className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'allBrand' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>All Brand Activities</button>
            <button onClick={() => setActiveTab('priceTrend')} className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'priceTrend' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Price Trend Analysis</button>
            <button onClick={() => setActiveTab('export')} className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'export' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Data Export</button>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-center p-10 text-lg font-semibold">Loading data...</div>}
      {error && <div className="text-center p-10 text-red-400">{error}</div>}
      {!isLoading && !error && !analyticsData && <div className="text-center p-10 text-gray-400">Select a <span className="text-purple-400 font-semibold">Category</span> → pick <span className="text-purple-400 font-semibold">My Brand</span> → click <span className="text-orange-400 font-semibold">Apply Filters</span> to see your analysis.</div>}

      {activeTab === 'overall' && analyticsData && displayData && (
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <h2 className="text-lg font-semibold text-white">{activityTitle}</h2>
              {/* Toggle Button */}
              <div className="flex items-center gap-2 mt-3 sm:mt-0"><span className="text-sm text-gray-300">Brand on Brand</span><button type="button" role="switch" aria-checked={isBrandOnBrandToggled} onClick={() => setIsBrandOnBrandToggled(!isBrandOnBrandToggled)} className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isBrandOnBrandToggled ? 'bg-purple-600' : 'bg-zinc-800'}`}><span className="sr-only">Toggle</span><div aria-hidden="true" className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isBrandOnBrandToggled ? 'transform translate-x-6' : ''}`}></div></button></div>
            </div>

            {isBrandOnBrandToggled && (
              <div className="flex gap-3 mb-6 pb-4 border-b border-zinc-800">
                <select
                  value={brandA}
                  onChange={(e) => setBrandA(e.target.value)}
                  className="bg-zinc-800 px-3 py-2 border border-zinc-700 rounded-md text-sm text-white"
                >
                  <option value="">Select Brand A</option>
                  {allBrands
                    .filter((b) => b !== brandB)
                    .map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
                <select
                  value={brandB}
                  onChange={(e) => setBrandB(e.target.value)}
                  className="bg-zinc-800 px-3 py-2 border border-zinc-700 rounded-md text-sm text-white"
                >
                  <option value="">Select Brand B</option>
                  {allBrands
                    .filter((b) => b !== brandA)
                    .map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="text-center mb-4">
              <h3 className="text-base font-medium text-gray-300">
                {useCategoryOverallLayout
                  ? `"${appliedCategory}" — up to ${OVERALL_CATEGORY_BRAND_CAP} brands (share is % of all offers in this category for the selected filters)`
                  : activityChartTitle}
              </h3>
            </div>

            {useCategoryOverallLayout && (
              <div className="mb-8 space-y-8">
                {false && (
                  <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Building category view…</span>
                  </div>
                )}
                {!false &&
                  false && (
                    <>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-300 mb-3">
                          Share of category activity (by brand)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {([] as any[]).map((c) => (
                            <div
                              key={c.brand}
                              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                            >
                              <p className="text-xs font-semibold text-white mb-2 truncate" title={c.brand}>
                                {c.brand}
                              </p>
                              <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={c.activityData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                      dataKey="name"
                                      stroke="#71717a"
                                      tick={{ fill: '#a1a1aa', fontSize: 10 }}
                                      tickLine={false}
                                      axisLine={false}
                                    />
                                    <YAxis
                                      stroke="#71717a"
                                      tick={{ fill: '#a1a1aa', fontSize: 10 }}
                                      tickLine={false}
                                      axisLine={false}
                                      unit="%"
                                    />
                                    <Tooltip
                                      cursor={{ fill: '#27272a', opacity: 0.35 }}
                                      contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #404040',
                                      }}
                                      itemStyle={{ color: '#e4e4e7' }}
                                    />
                                    <Bar dataKey="share" name="Share %" fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-300 mb-3">
                          Avg offer price by period ({getCurrency(appliedCountry)})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {([] as any[]).map((c) => (
                            <div
                              key={`${c.brand}-price`}
                              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                            >
                              <p className="text-xs font-semibold text-white mb-2 truncate" title={c.brand}>
                                {c.brand}
                              </p>
                              <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={c.priceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                      dataKey="name"
                                      stroke="#71717a"
                                      tick={{ fill: '#a1a1aa', fontSize: 10 }}
                                      tickLine={false}
                                      axisLine={false}
                                    />
                                    <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <Tooltip
                                      cursor={{ fill: '#27272a', opacity: 0.35 }}
                                      contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #404040',
                                      }}
                                      formatter={(v: number) => [`${(getCurrency(appliedCountry)).trim()} ${v.toFixed(1)}`, 'Avg offer']}
                                    />
                                    <Bar dataKey="avgOffer" name="Avg offer" fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-zinc-800">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-950/50">
                              <th className="text-left py-3 px-3 font-medium text-gray-300">Brand</th>
                              <th className="text-center py-3 font-medium text-gray-300">Latest 4 wks</th>
                              <th className="text-center py-3 font-medium text-gray-300">Latest 12 wks</th>
                              <th className="text-center py-3 font-medium text-gray-300">YTD</th>
                              <th className="text-center py-3 font-medium text-gray-300">Latest 52 wks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {([] as any[]).map((row) => (
                              <tr key={row.brand} className="border-b border-zinc-800 last:border-b-0">
                                <td className="py-3 px-3 font-medium text-gray-300">{row.brand}</td>
                                {(['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'] as const).map((k) => (
                                  <td key={k} className="text-center py-3 text-white text-xs">
                                    {row.periods[k].offerCount.toLocaleString()} (
                                    {row.periods[k].sharePct.toFixed(1)}%)
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr className="bg-zinc-950/70 font-semibold">
                              <td className="py-3 px-3 text-zinc-200">Total offers in category</td>
                              {(['latest4Weeks', 'latest12Weeks', 'ytd', 'latest52Weeks'] as const).map((k) => (
                                <td key={k} className="text-center py-3 text-white">
                                  {'—'}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                {!false &&
                  true && (
                    <p className="text-center text-sm text-zinc-500 py-8">
                      No rows in this category for the current filters (try Apply after adjusting region or
                      retailer).
                    </p>
                  )}
              </div>
            )}

            {!useCategoryOverallLayout && (
              <>
                {/* When multiple competitors (not Brand on Brand): show combined per-brand chart */}
                {!appliedBrandOnBrand && combinedCompetitorChartData.length > 0 && combinedChartCompetitors.length > 0 ? (
                  <div className="h-96 w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={combinedCompetitorChartData} margin={{ top: 30, right: 20, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="cg0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient>
                          {combinedChartCompetitors.map((brand, idx) => {
                            const c = getBrandColor(brandColorMap, brand, idx);
                            return (
                              <linearGradient key={brand} id={`cg${idx + 1}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.main} /><stop offset="100%" stopColor={c.dark} /></linearGradient>
                            );
                          })}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                        <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} unit="%" />
                        <Tooltip cursor={{ fill: '#3f3f46', opacity: 0.2 }} content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const totalCount = payload[0]?.payload?.totalCount || 0;
                          return (
                            <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
                              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</div>
                              {payload.map((e: any, i: number) => { const cnt = e.payload[`${e.name}_count`] ?? 0; return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: e.name === appliedMyBrand ? '#a78bfa' : getBrandColor(brandColorMap, e.name, Math.max(0, i - 1)).main }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{e.name}</span></div>
                                  <div><span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{e.value}%</span><span style={{ color: '#71717a', fontSize: 10, marginLeft: 6 }}>({cnt} offers)</span></div>
                                </div>); })}
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717a', fontSize: 11 }}>Category Total</span><span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{totalCount.toLocaleString()}</span></div>
                            </div>);
                        }} />
                        <Legend wrapperStyle={{ paddingTop: '12px' }} />
                        <Bar dataKey={appliedMyBrand} name={appliedMyBrand} fill="url(#cg0)" radius={[6,6,0,0]} barSize={28} animationDuration={800}
                          label={{ position: 'top', fill: '#a78bfa', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? `${Math.round(v)}%` : '' }} />
                        {combinedChartCompetitors.map((brand, idx) => (
                          <Bar key={brand} dataKey={brand} name={brand} fill={`url(#cg${idx+1})`} radius={[6,6,0,0]} barSize={28} animationDuration={800}
                            label={{ position: 'top', fill: getBrandColor(brandColorMap, brand, idx).main, fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? `${Math.round(v)}%` : '' }} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-80 w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayData.activityChart} margin={{ top: 30, right: 20, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="barGradPurple" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient>
                          <linearGradient id="barGradOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#ea580c" /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                        <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                        <Tooltip cursor={{ fill: '#3f3f46', opacity: 0.3 }} content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const myD = payload[0]; const compD = payload[1];
                          const total = (myD?.payload?.myBrandCount ?? 0) + (myD?.payload?.competitorCount ?? 0);
                          return (
                            <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
                              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</div>
                              {myD && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6' }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{myD.name}</span></div><span style={{ color: '#fff', fontWeight: 700 }}>{myD.value}%</span></div>}
                              {compD && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#ea580c' }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{compD.name}</span></div><span style={{ color: '#fff', fontWeight: 700 }}>{compD.value}%</span></div>}
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #27272a', color: '#71717a', fontSize: 11 }}>Total: <span style={{ color: '#fff', fontWeight: 600 }}>{total.toLocaleString()} offers</span></div>
                            </div>);
                        }} />
                        <Legend wrapperStyle={{ paddingTop: '12px' }} />
                        <Bar dataKey={appliedBrandOnBrand ? 'brandA' : 'myBrandShare'} name={appliedBrandOnBrand ? brand1Label : 'My Brand'} fill="url(#barGradPurple)" radius={[6,6,0,0]} barSize={36} animationDuration={800}
                          label={{ position: 'top', fill: '#a78bfa', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? `${Math.round(v)}%` : '' }} />
                        <Bar dataKey={appliedBrandOnBrand ? 'brandB' : 'competitorShare'} name={appliedBrandOnBrand ? brand2Label : 'Competitor'} fill="url(#barGradOrange)" radius={[6,6,0,0]} barSize={36} animationDuration={800}
                          label={{ position: 'top', fill: '#fb923c', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? `${Math.round(v)}%` : '' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-3 font-medium text-gray-300 pr-2">Timeline</th>
                        <th className="text-center py-3 font-medium text-gray-300">Latest 4 wks</th>
                        <th className="text-center py-3 font-medium text-gray-300">Latest 12 wks</th>
                        <th className="text-center py-3 font-medium text-gray-300">YTD</th>
                        <th className="text-center py-3 font-medium text-gray-300">Latest 52 wks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.activityTable.map((row) => {
                        const isSelectedCompetitorRow =
                          !appliedBrandOnBrand &&
                          row.brand === brand2Label &&
                          appliedCompetitor === MULTI_COMPETITORS &&
                          selectedCompetitorBreakdownRows.length > 0;

                        return (
                          <Fragment key={`activity-${row.brand}`}>
                            <tr
                              className={`border-b border-zinc-800 ${
                                isSelectedCompetitorRow
                                  ? 'bg-gradient-to-r from-zinc-900/60 to-zinc-900/30 hover:from-zinc-800/60 hover:to-zinc-800/30 transition-all cursor-pointer'
                                  : ''
                              }`}
                              onClick={isSelectedCompetitorRow ? () => setShowSelectedCompetitorBreakdown((prev) => !prev) : undefined}
                            >
                              <td className="py-3 font-medium text-gray-300">
                                {isSelectedCompetitorRow ? (
                                  <div className="inline-flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center transition-transform duration-200 ${showSelectedCompetitorBreakdown ? 'rotate-180' : ''}`}>
                                      <ChevronDown className="h-3.5 w-3.5 text-purple-400" />
                                    </div>
                                    <span className="text-white font-semibold">{row.brand}</span>
                                    <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/50">
                                      {showSelectedCompetitorBreakdown ? 'Click to collapse' : 'Click to expand'}
                                    </span>
                                  </div>
                                ) : (
                                  row.brand
                                )}
                              </td>
                              <td className="text-center py-3 text-white">{row.latest4Weeks}</td>
                              <td className="text-center py-3 text-white">{row.latest12Weeks}</td>
                              <td className="text-center py-3 text-white">{row.ytd}</td>
                              <td className="text-center py-3 text-white">{row.latest52Weeks}</td>
                            </tr>
                            {isSelectedCompetitorRow && showSelectedCompetitorBreakdown && (
                              <>
                                <tr className="bg-gradient-to-r from-zinc-900 to-zinc-950 border-b border-zinc-700">
                                  <td className="py-2.5 pl-8 pr-3 text-xs font-bold text-purple-300 uppercase tracking-wider">Brand</td>
                                  <td className="text-center py-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">4 wks</td>
                                  <td className="text-center py-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">12 wks</td>
                                  <td className="text-center py-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">YTD</td>
                                  <td className="text-center py-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">52 wks</td>
                                </tr>
                                {selectedCompetitorBreakdownRows.map((r, idx) => {
                                  const dotColors = ['#ea580c', '#06b6d4', '#22c55e', '#eab308', '#ec4899'];
                                  return (
                                  <tr key={`breakdown-${r.brand}`} className="border-b border-zinc-800/60 bg-zinc-950/30 hover:bg-zinc-800/40 transition-colors">
                                    <td className="py-3 pl-8 pr-3 text-sm text-zinc-100 font-medium">
                                      <span className="inline-flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: dotColors[idx % dotColors.length] }} />
                                        {r.brand}
                                      </span>
                                    </td>
                                    <td className="text-center py-3 text-zinc-100 font-medium">{r.latest4Weeks.toLocaleString()}</td>
                                    <td className="text-center py-3 text-zinc-100 font-medium">{r.latest12Weeks.toLocaleString()}</td>
                                    <td className="text-center py-3 text-zinc-100 font-medium">{r.ytd.toLocaleString()}</td>
                                    <td className="text-center py-3 text-zinc-100 font-medium">{r.latest52Weeks.toLocaleString()}</td>
                                  </tr>
                                  );
                                })}
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {!useCategoryOverallLayout && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6"><h2 className="text-lg font-semibold text-white mb-4 sm:mb-0">Price Trend on the basis of:</h2><div className="flex flex-wrap gap-4">{priceOptions.map(({ label, value }) => (<label key={value} className="flex items-center cursor-pointer"><input type="radio" name="priceType" value={value} checked={priceTrendType === value} onChange={(e) => setPriceTrendType(e.target.value)} className="form-radio bg-zinc-700 border-zinc-600 text-purple-500" /><span className="text-sm text-gray-300 ml-2">{label}</span></label>))}</div></div>
              <div className="text-center mb-4"><h3 className="text-base font-medium text-gray-300">{priceTrendChartTitle}</h3></div>
              <div className="h-80 w-full mb-6">
                {!appliedBrandOnBrand && appliedCompetitors.filter(c => c && c !== ALL_COMPETITORS).length > 1 && perBrandPeriodMap.size > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={combinedCompetitorPriceTrendChartData} margin={{ top: 30, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cgPrice0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient>
                        {combinedChartCompetitors.map((brand, idx) => {
                          const c = getBrandColor(brandColorMap, brand, idx);
                          return (
                            <linearGradient key={brand} id={`cgPrice${idx + 1}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.main} /><stop offset="100%" stopColor={c.dark} /></linearGradient>
                          );
                        })}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#3f3f46', opacity: 0.3 }} content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const currentCurrency = getCurrency(appliedCountry);
                        const formatVal = (v: any) => {
                          if (typeof v !== 'number') return 'N/A';
                          if (priceTrendType === 'discount') return `${v.toFixed(1)}%`;
                          return `${currentCurrency} ${v.toFixed(1)}`;
                        };
                        return (
                          <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</div>
                            {payload.map((e: any, i: number) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: e.name === appliedMyBrand ? '#a78bfa' : getBrandColor(brandColorMap, e.name, Math.max(0, i - 1)).main }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{e.name}</span></div>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{formatVal(e.value)}</span>
                              </div>
                            ))}
                          </div>);
                      }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey={appliedMyBrand} name={appliedMyBrand} fill="url(#cgPrice0)" radius={[6,6,0,0]} barSize={28} animationDuration={800}
                        label={{ position: 'top', fill: '#a78bfa', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? (priceTrendType === 'discount' ? `${Math.round(v)}%` : v.toFixed(1)) : '' }} />
                      {combinedChartCompetitors.map((brand, idx) => (
                        <Bar key={brand} dataKey={brand} name={brand} fill={`url(#cgPrice${idx+1})`} radius={[6,6,0,0]} barSize={28} animationDuration={800}
                          label={{ position: 'top', fill: getBrandColor(brandColorMap, brand, idx).main, fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? (priceTrendType === 'discount' ? `${Math.round(v)}%` : v.toFixed(1)) : '' }} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayData.priceTrendChart} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="barGradPurplePrice" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient>
                        <linearGradient id="barGradOrangePrice" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#ea580c" /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#3f3f46', opacity: 0.3 }} content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const myD = payload[0]; const compD = payload[1];
                        const currentCurrency = getCurrency(appliedCountry);
                        const formatVal = (v: any) => {
                          if (typeof v !== 'number') return 'N/A';
                          if (priceTrendType === 'discount') return `${v.toFixed(1)}%`;
                          return `${currentCurrency} ${v.toFixed(1)}`;
                        };
                        return (
                          <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, padding: 16, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }} className="chart-tooltip text-white text-xs z-50">
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, borderBottom: '1px solid #27272a', paddingBottom: 8 }}>{label}</div>
                            {myD && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6' }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{myD.name}</span></div><span style={{ color: '#fff', fontWeight: 700 }}>{formatVal(myD.value)}</span></div>}
                            {compD && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#ea580c' }} /><span style={{ color: '#a1a1aa', fontSize: 12 }}>{compD.name}</span></div><span style={{ color: '#fff', fontWeight: 700 }}>{formatVal(compD.value)}</span></div>}
                          </div>);
                      }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="myBrand" name={brand1Label} fill="url(#barGradPurplePrice)" radius={[6, 6, 0, 0]} barSize={36} animationDuration={800}
                        label={{ position: 'top', fill: '#a78bfa', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? (priceTrendType === 'discount' ? `${Math.round(v)}%` : v.toFixed(1)) : '' }} />
                      <Bar dataKey="competitor" name={brand2Label} fill="url(#barGradOrangePrice)" radius={[6, 6, 0, 0]} barSize={36} animationDuration={800}
                        label={{ position: 'top', fill: '#fb923c', fontSize: 11, fontWeight: 600, formatter: (v: number) => v > 0 ? (priceTrendType === 'discount' ? `${Math.round(v)}%` : v.toFixed(1)) : '' }} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-zinc-800"><th className="text-left py-3 font-medium text-gray-300"></th><th className="text-center py-3 font-medium text-gray-300">Latest 4 wks</th><th className="text-center py-3 font-medium text-gray-300">Latest 12 wks</th><th className="text-center py-3 font-medium text-gray-300">YTD</th><th className="text-center py-3 font-medium text-gray-300">Latest 52 wks</th></tr></thead><tbody>{displayData.priceTrendTable.map(row => (<tr key={row.brand} className="border-b border-zinc-800 last:border-b-0"><td className="py-3 font-medium text-gray-300">{row.brand}</td><td className="text-center py-3 text-white">{row.latest4Weeks}</td><td className="text-center py-3 text-white">{row.latest12Weeks}</td><td className="text-center py-3 text-white">{row.ytd}</td><td className="text-center py-3 text-white">{row.latest52Weeks}</td></tr>))}</tbody></table></div>
            </div>
          )}

          {!useCategoryOverallLayout && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {Object.values(displayData.priceSummary).map((data) => (<div key={data.title} className="bg-zinc-900 rounded-lg border border-zinc-800 p-4"><h3 className="text-lg font-semibold text-white mb-4">{data.title}</h3><table className="w-full text-sm"><thead><tr className="border-b border-zinc-700"><th className="text-left py-2 pr-2 font-medium text-gray-400">Period</th><th className="text-center py-2 font-medium text-gray-400">{appliedBrandOnBrand ? brand1Label : 'My Brand'}</th><th className="text-center py-2 font-medium text-gray-400">{brand2Label}</th></tr></thead><tbody>{data.data.map((row) => (<tr key={row.period} className="border-b border-zinc-800 last:border-b-0"><td className="py-2 pr-3 text-gray-300">{row.period}</td><td className="py-2 text-white text-center font-medium">{row.myBrand}</td><td className="py-2 text-white text-center font-medium">{row.competitor}</td></tr>))}</tbody></table></div>))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'competitor' && (
        <div className="space-y-4">
          {/* We pass the state and setter down to the component so its internal buttons control the parent's data */}
          <CompetitorPricingAnalysis
            myBrand={effectiveMyBrandForTabs}
            selectedCompetitor={effectiveCompetitorForTabs}
            selectedCompetitors={effectiveCompetitorsForTabs}
            selectedCountry={appliedCountry}
            selectedRegion={appliedRegion}
            selectedRetailer={appliedRetailer}
            selectedCategory={appliedCategory}
            selectedSubCategories={appliedSubCategory ? [appliedSubCategory] : []}
            selectedPackSizes={appliedBasePack ? [appliedBasePack] : appliedQuantity ? [appliedQuantity] : []}
            isDistinctView={appliedOfferType === 'Distinct Offers'}
            selectedPeriod={competitorPeriod}
            onPeriodChange={setCompetitorPeriod}
            hasAppliedFilters={!!appliedMyBrand}
            products={processedData}
            isLoadingProducts={isLoadingDetailedData}
          />
        </div>
      )}
      {activeTab === 'allBrand' && (
        <AllBrandActivities
          products={processedData}
          allBrands={allBrands}
          myBrand={effectiveMyBrandForTabs}
          selectedCategory={appliedCategory}
          selectedRegion={appliedRegion}
          selectedCountry={appliedCountry}
          selectedCompetitor={effectiveCompetitorForTabs}
          offerType={appliedOfferType}
          isLoading={isLoadingDetailedData}
        />
      )}

      {activeTab === 'priceTrend' && (
        <PriceTrendAnalysis
          products={processedData}
          isLoading={isLoadingDetailedData}
          primaryBrand={effectiveMyBrandForTabs}
          competitorBrand={effectiveCompetitorForTabs}
          competitorBrands={effectiveCompetitorsForTabs.filter(c => c !== ALL_COMPETITORS)}
          selectedCategory={appliedCategory}
          selectedCountry={appliedCountry}
          selectedRegion={appliedRegion}
          selectedRetailer={appliedRetailer}
          selectedSubCategory={appliedSubCategory}
          offerType={appliedOfferType}
          selectedBasePack={appliedBasePack}
          selectedQuantity={appliedQuantity}
        />
      )}

      {activeTab === 'export' && (
        <>
          {isSpotlightActive && (
            <div 
              onClick={() => setIsSpotlightActive(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 cursor-pointer animate-in fade-in duration-300"
            />
          )}

          <div className={`bg-zinc-900 rounded-xl border p-6 space-y-6 shadow-lg relative transition-all duration-300 ${
            isSpotlightActive 
              ? 'z-50 relative border-purple-500/50 shadow-[0_0_50px_rgba(147,51,234,0.4)]' 
              : 'border-zinc-800'
          }`}>
            
            {/* Mocked / Local Filters for Export */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80 mb-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Add On Pack Size</label>
                <select className="bg-zinc-900 border border-zinc-800 text-zinc-350 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer">
                  <option value="All">All</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Add On Qty</label>
                <select className="bg-zinc-900 border border-zinc-800 text-zinc-350 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer">
                  <option value="All">All</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Analysis Week</label>
                <select 
                  value={exportAnalysisWeek}
                  onChange={(e) => setExportAnalysisWeek(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-350 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
                >
                  <option value="latest4Weeks">Latest 4 weeks</option>
                  <option value="latest12Weeks">Latest 12 weeks</option>
                  <option value="ytd">YTD</option>
                  <option value="latest52Weeks">Latest 52 weeks</option>
                </select>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input 
                  type="checkbox" 
                  id="exportAllData" 
                  checked={exportAllData} 
                  onChange={(e) => setExportAllData(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-850 text-purple-650 focus:ring-purple-650 h-4 w-4" 
                />
                <label htmlFor="exportAllData" className="text-xs text-zinc-400 font-semibold cursor-pointer select-none">Export All Data</label>
              </div>
              <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-850 md:col-span-2 mt-4 self-center justify-self-end">
                <button
                  onClick={() => setExportOfferType('Distinct Offers')}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    exportOfferType === 'Distinct Offers' && !exportAllData
                      ? 'bg-purple-600 text-white shadow-sm font-semibold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  disabled={exportAllData}
                >
                  Distinct Offers
                </button>
                <button
                  onClick={() => setExportOfferType('All Offers')}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    exportOfferType === 'All Offers' || exportAllData
                      ? 'bg-purple-600 text-white shadow-sm font-semibold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  disabled={exportAllData}
                >
                  All Offers
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">Export Raw Data</h2>
                  {isSpotlightActive && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-purple-950/60 text-purple-400 border border-purple-900/50 animate-pulse">
                      Spotlight Mode
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs mt-1">
                  {isLoadingDetailedData ? (
                    "Fetching filtered rows..."
                  ) : (
                    `Showing ${filteredByExportFilters.length.toLocaleString()} raw records matching selected filters (limited to 5,000 to prevent crashing).`
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 relative">
                {isSpotlightActive && (
                  <button
                    onClick={() => setIsSpotlightActive(false)}
                    className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-755 transition-colors border border-zinc-700"
                  >
                    Exit Spotlight
                  </button>
                )}
                
                <button
                  onClick={handleDownload}
                  disabled={filteredByExportFilters.length === 0 || isLoading || isLoadingDetailedData}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 to-orange-500 shadow-md transition-all hover:scale-[1.02] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed border border-white/10"
                >
                  <Download className="h-4 w-4" />
                  Download Excel
                </button>

                {/* Three dots dropdown */}
                <div className="relative" ref={threeDotsMenuRef}>
                  <button 
                    onClick={() => setShowThreeDotsMenu(!showThreeDotsMenu)}
                    className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {showThreeDotsMenu && (
                    <div className="absolute right-0 mt-2 z-50 w-48 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl p-1 animate-in slide-in-from-top-2 fade-in">
                      <button 
                        onClick={() => { handleDownload(); setShowThreeDotsMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 rounded transition-colors flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5 text-purple-400" />
                        <span>Export data</span>
                      </button>
                      <button 
                        onClick={() => { setIsSpotlightActive(false); setIsInsightsOpen(false); setShowThreeDotsMenu(false); toast({ title: "Table view focused" }); }}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 rounded transition-colors flex items-center gap-2"
                      >
                        <Table className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Show as a table</span>
                      </button>
                      <button 
                        onClick={() => { setIsSpotlightActive(true); setShowThreeDotsMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 rounded transition-colors flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                        <span>Spotlight</span>
                      </button>
                      <button 
                        onClick={triggerGetInsights}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 rounded transition-colors flex items-center gap-2"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Get insights</span>
                      </button>
                      <button 
                        onClick={() => { setSortOrder('desc'); setShowThreeDotsMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${
                          sortOrder === 'desc' ? 'text-purple-400 font-semibold bg-purple-950/20' : 'text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>Sort descending</span>
                        </span>
                        {sortOrder === 'desc' && <Check className="w-3 h-3" />}
                      </button>
                      <button 
                        onClick={() => { setSortOrder('asc'); setShowThreeDotsMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${
                          sortOrder === 'asc' ? 'text-purple-400 font-semibold bg-purple-950/20' : 'text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>Sort ascending</span>
                        </span>
                        {sortOrder === 'asc' && <Check className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto no-scrollbar rounded-lg border border-zinc-800">
              <table className="w-full text-left border-collapse min-w-[1000px] text-xs">
                <thead className="bg-zinc-900/90 backdrop-blur text-zinc-300 font-semibold sticky top-0 z-10 shadow-sm border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Country</th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Retailer</th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Analysis Week</th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Offer ID</th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Offer Name</th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-right">Offer Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-350 bg-zinc-950/20">
                  {isLoadingDetailedData ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-zinc-500 text-xs font-mono animate-pulse">Loading dataset...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredByExportFilters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-zinc-500 font-medium">
                        No records found. Adjust your filters or select a different Analysis Week.
                      </td>
                    </tr>
                  ) : (
                    filteredByExportFilters.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-800/40 transition-colors border-b border-zinc-900/60 last:border-b-0">
                        <td className="px-4 py-3.5 font-bold uppercase text-zinc-400">
                          {item.country ? item.country.toUpperCase() : 'N/A'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                            {item.mart_name || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-zinc-300">
                          {getAnalysisWeek(item)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-[11px] font-semibold text-purple-400 bg-purple-950/40 border border-purple-900/30 px-2 py-0.5 rounded">
                            {item.id}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-200 font-semibold truncate max-w-[350px]" title={item.offer_name || ''}>
                          {item.offer_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-zinc-400 text-[11px] tracking-tight">
                          {formatTimelineDisplay(item.start_date, item.end_date)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Quick Insights Modal */}
      {isInsightsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-250">
          {/* Backdrop */}
          <div onClick={() => setIsInsightsOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer animate-in fade-in duration-250" />
          
          {/* Modal Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative z-10 animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsInsightsOpen(false)} 
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-6">
              <Lightbulb className="w-5 h-5 text-purple-400 animate-pulse" />
              <span>Marhaba Quick Insights</span>
            </h3>

            {isAnalyzingInsights ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                <p className="text-xs text-zinc-400 font-mono animate-pulse">Running data heuristics & trend analysis...</p>
              </div>
            ) : !insights ? (
              <p className="text-zinc-500 text-sm py-6 text-center">No data available to analyze. Please apply filters first.</p>
            ) : (
              <div className="space-y-4 text-sm text-zinc-300">
                <div className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-800/60 flex items-center justify-between">
                  <span className="text-zinc-400 text-xs uppercase font-semibold">Analyzed Offers</span>
                  <span className="text-purple-400 font-mono font-bold text-base">{insights.total.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-zinc-950/20 rounded-xl border border-zinc-800/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Avg Discounted Price</span>
                    <span className="text-emerald-400 font-mono font-bold text-sm">
                      {insights.avgPrice} <span className="text-[10px] text-zinc-500 font-normal">{getCurrency(appliedCountry)}</span>
                    </span>
                  </div>
                  <div className="p-3 bg-zinc-950/20 rounded-xl border border-zinc-800/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Unique Products</span>
                    <span className="text-white font-mono font-bold text-sm">{insights.uniqueProductCount}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
                    <p>
                      <strong className="text-zinc-100">Top Retailer:</strong> <span className="text-purple-300 font-medium">{insights.topRetailer}</span> has the highest share of promotions in this selection.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 flex-shrink-0" />
                    <p>
                      <strong className="text-zinc-100">Leading Brand:</strong> <span className="text-orange-400 font-medium">{insights.topBrand}</span> is running the most active offers.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                    <p>
                      <strong className="text-zinc-100">Geographic Spread:</strong> Promotional activities span across <span className="text-blue-300 font-semibold">{insights.regionsCount} regions</span>.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-800 flex justify-end">
                  <button 
                    onClick={() => setIsInsightsOpen(false)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider text-zinc-300 rounded-lg transition-colors border border-zinc-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PromotionAnalysis;