import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Globe,
  MapPin,
  Building2,
  Search,
  Calendar as CalendarIcon,
  CheckCircle,
  Heart,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  ChevronDown,
  ExternalLink,
  Trash2,
  Save,
  ArrowLeft,
  Loader2,
  X,
  SlidersHorizontal
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { addDays, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@supabase/supabase-js";
import { Switch } from "@/components/ui/switch";

// --- SUPABASE CLIENT INITIALIZATION ---
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from "@/context/AuthContext";

// --- STATIC LISTS & HELPER ---
import {
  staticCountries,
  regionsMap,
  currencyMap,
  getRegionsForCountry,
  getCurrency,
  sameStringArray,
  splitRegionValues,
  normalizeSingleValue,
  normalizeMultiSelectForRpc,
  tryParseDate,
  parseValidRange,
  parsePrice,
  toTitleCase
} from '../utils/offerBankUtils';

// --- INTERFACES ---
interface FlyerProduct {
  id: number;
  product_name: string | null;
  brand: string | null;
  type: string | null;
  weight_quantity: string | null;
  regular_price: string | null;
  discounted_price: string | null;
  category: string | null;
  image_path: string | null;
  mart_name: string | null;
  offer_timeline: string | null;
  country: string | null;
  flyer_url: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Offer {
  id: string;
  image: string;
  title: string;
  price: number;
  original: number;
  discount: number;
  retailer: string;
  country: string;
  valid: string;
  brand: string;
  productType: string;
  category: string;
  packSize: string;
  flyerUrl: string | null;
  offerName: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface SavedFilter {
  id: string;
  name: string;
  description: string;
  criteria: any;
  timestamp: Date;
}

type MasterFilterData = {
  regions: string[];
  retailers: string[];
  categories: string[];
  subcategories: string[];
  packSizes: string[];
  brands: string[];
};

// --- HELPERS FOR CARD RENDERING ---
const formatRetailerName = (name: string | null | undefined): string => {
  if (!name) return "N/A";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatCardDate = (validText: string | null | undefined): string => {
  if (!validText) return "N/A";
  
  // Try to parse using parseValidRange
  const range = parseValidRange(validText);
  if (range) {
    const formatSingleDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };
    return `From ${formatSingleDate(range.from)} To ${formatSingleDate(range.to)}`;
  }

  // Fallback: Clean up raw string if parsing fails
  let cleaned = validText.trim();
  cleaned = cleaned.replace(/^(valid until|valid from|valid|from|until|till)\s+/i, '');
  cleaned = cleaned.replace(/\b\d{4}\b/g, '').trim();
  
  // Find a separator
  const sep = cleaned.match(/\s+(?:to|until|till|–|-)\s+/i);
  if (sep) {
    const parts = cleaned.split(sep[0]);
    if (parts.length >= 2) {
      const p0 = parts[0].trim().replace(/[./\s-]+$/, '').replace(/^[./\s-]+/, '');
      const p1 = parts[1].trim().replace(/[./\s-]+$/, '').replace(/^[./\s-]+/, '');
      return `From ${p0} To ${p1}`;
    }
  }
  
  cleaned = cleaned.replace(/[./\s-]+$/, '').replace(/^[./\s-]+/, '');
  return `From ${cleaned}`;
};

const formatOfferTimeline = (
  startStr: string | null | undefined, 
  endStr: string | null | undefined,
  fallbackTimeline: string | null | undefined
): string => {
  if (!startStr && !endStr) {
    return formatCardDate(fallbackTimeline);
  }
  
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const yyyy = parts[0];
        const mm = parts[1];
        const dd = parts[2];
        return `${dd}/${mm}/${yyyy}`;
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return "";
    }
  };

  const startFmt = formatDate(startStr);
  const endFmt = formatDate(endStr);

  if (startFmt && endFmt) return `From ${startFmt} To ${endFmt}`;
  if (startFmt) return `From ${startFmt}`;
  if (endFmt) return `Until ${endFmt}`;
  return formatCardDate(fallbackTimeline);
};

const formatOfferTimelineCompact = (
  startStr: string | null | undefined,
  endStr: string | null | undefined,
  fallbackTimeline: string | null | undefined
): string => {
  if (!startStr && !endStr) {
    if (!fallbackTimeline) return "";
    const range = parseValidRange(fallbackTimeline);
    if (range) {
      return `From ${range.from.getDate()}/${range.from.getMonth() + 1}/${range.from.getFullYear()} To ${range.to.getDate()}/${range.to.getMonth() + 1}/${range.to.getFullYear()}`;
    }
    return fallbackTimeline;
  }

  const formatCompactDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const yyyy = parts[0];
        const mm = String(parseInt(parts[1], 10)).padStart(2, '0');
        const dd = String(parseInt(parts[2], 10)).padStart(2, '0');
        return `${dd}/${mm}/${yyyy}`;
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return "";
    }
  };

  const startFmt = formatCompactDate(startStr);
  const endFmt = formatCompactDate(endStr);

  if (startFmt && endFmt) return `From ${startFmt} To ${endFmt}`;
  if (startFmt) return `From ${startFmt}`;
  if (endFmt) return endFmt;
  return fallbackTimeline || "";
};


const getFallbackFlyerUrl = (imagePath: string | null | undefined): string | null => {
  if (!imagePath || !imagePath.startsWith("http")) return null;
  const match = imagePath.match(/(.+?)\/flyer-products\/(flyer_\d+)\//i);
  if (!match) return null;
  const baseUrl = match[1];
  const flyerName = match[2];
  return `${baseUrl}/FLYERS/${flyerName}.jpg`;
};

const RetailerLogo = ({ name, size = "small" }: { name: string | null | undefined; size?: "small" | "large" }) => {
  const formattedName = formatRetailerName(name);
  const lowercaseName = (name || "").toLowerCase().trim();

  // 1. Check local SVG logos
  const localLogos = [
    { key: "adcoop", file: "Adcoop.svg" },
    { key: "ad coop", file: "Adcoop.svg" },
    { key: "al ardhiya", file: "Al Ardhiya Coop.svg" },
    { key: "ardhiya", file: "Al Ardhiya Coop.svg" },
    { key: "al badia", file: "Al Badia Hypermarket.svg" },
    { key: "al madina hyper", file: "Al Madina Hypermarket.svg" },
    { key: "al madina", file: "Al Madina.svg" },
    { key: "madina", file: "Al Madina.svg" },
    { key: "al meera", file: "Al Meera.svg" },
    { key: "meera", file: "Al Meera.svg" },
    { key: "al raya", file: "Al Raya.svg" },
    { key: "alraya", file: "Al Raya.svg" },
    { key: "ala kaifak", file: "Ala Kaifak.svg" },
    { key: "ansar gallery", file: "Ansar Gallery.svg" },
    { key: "ansar", file: "Ansar Gallery.svg" },
    { key: "aswaq ramez", file: "Aswaq Ramez.svg" },
    { key: "ramez", file: "Aswaq Ramez.svg" },
    { key: "babil", file: "Babil Hypermarket.svg" },
    { key: "bin dawood", file: "Bin Dawood Market.svg" },
    { key: "bindawood", file: "Bin Dawood Market.svg" },
    { key: "carrefour", file: "Carrefour.svg" },
    { key: "city hyper", file: "City Hypermarket.svg" },
    { key: "danube", file: "Danube.svg" },
    { key: "dukan", file: "Dukan.svg" },
    { key: "emirates co", file: "Emirates Co-Operative Society.svg" },
    { key: "farm", file: "Farm.svg" },
    { key: "grand costo", file: "Grand Costo.svg" },
    { key: "grand hyper", file: "Grand Hyper.svg" },
    { key: "panda", file: "Hyper Panda.svg" },
    { key: "hyper panda", file: "Hyper Panda.svg" },
    { key: "istanbul", file: "Istanbul Supermarket.svg" },
    { key: "k m trading", file: "K M Trading.svg" },
    { key: "k.m.", file: "K M Trading.svg" },
    { key: "km trading", file: "K M Trading.svg" },
    { key: "kenz", file: "Kenz Hypermarket.svg" },
    { key: "lulu", file: "LuLu Hypermarket.svg" },
    { key: "manuel", file: "Manuel Market.svg" },
    { key: "mark save", file: "Mark & Save.svg" },
    { key: "mark & save", file: "Mark & Save.svg" },
    { key: "masskar", file: "Masskar Hypermarket.svg" },
    { key: "meem", file: "Meem Market.svg" },
    { key: "monoprix", file: "Monoprix.svg" },
    { key: "nesto", file: "Nesto Hypermarkets (covers Nesto & nesto hypermarket).svg" },
    { key: "rawabi", file: "Rawabi Hypermarket.svg" },
    { key: "spar", file: "SPAR.svg" },
    { key: "safari", file: "Safari Hypermarket.svg" },
    { key: "safeer", file: "Safeer Market.svg" },
    { key: "saudia", file: "Saudia Hypermarket.svg" },
    { key: "tamimi", file: "Tamimi Market.svg" },
    { key: "sultan", file: "The Sultan Center (covers sultan center).svg" },
    { key: "west zone", file: "West Zone Supermarket.svg" }
  ];

  let localSvgUrl = "";
  for (const entry of localLogos) {
    if (lowercaseName.includes(entry.key)) {
      localSvgUrl = `/logos/${entry.file}`;
      break;
    }
  }

  // 2. Mapping of common retailer names to domain names for Clearbit logos as fallback
  const domainMap: Record<string, string> = {
    lulu: "luluhypermarket.com",
    carrefour: "carrefouruae.com",
    monoprix: "monoprix.qa",
    spar: "spar-international.com",
    spinneys: "spinneys.com",
    nesto: "nestogroup.com",
    ansar: "ansar-group.com",
    safari: "safarihypermarket.com",
    ramez: "ramezgroup.com",
    grand: "grandhyper.com",
    choithrams: "choithrams.com",
    coop: "coop.ae",
    km: "kmtrading.com",
    "k.m.": "kmtrading.com",
    kabayan: "kabayanhypermarket.com",
    madina: "almadinahypermarket.com",
    "al madina": "almadinahypermarket.com",
    "aswaq ramez": "ramezgroup.com",
    meera: "almeera.com.qa",
    "al meera": "almeera.com.qa"
  };

  let fallbackDomain = "";
  for (const key in domainMap) {
    if (lowercaseName.includes(key)) {
      fallbackDomain = domainMap[key];
      break;
    }
  }

  const [localSvgError, setLocalSvgError] = useState(false);
  const [clearbitError, setClearbitError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fallback to text initials
  const initials = formattedName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Try local SVG first, then Clearbit fallback, then text initials
  const hasLocalSvg = localSvgUrl && !localSvgError;
  const hasClearbit = fallbackDomain && !clearbitError;

  let logoUrl = "";
  if (hasLocalSvg) {
    logoUrl = localSvgUrl;
  } else if (hasClearbit) {
    logoUrl = `https://logo.clearbit.com/${fallbackDomain}`;
  }

  const showImage = !!logoUrl;

  const containerClasses = size === "large"
    ? "w-14 h-14 rounded-xl bg-white border border-zinc-200 overflow-hidden flex items-center justify-center p-1.5 shrink-0 transition-all duration-200 hover:scale-110 cursor-pointer relative shadow-md"
    : "w-7 h-7 rounded-md bg-white border border-zinc-200 overflow-hidden flex items-center justify-center p-0.5 shrink-0 transition-all duration-200 hover:scale-110 cursor-pointer relative shadow-sm";

  const placeholderClasses = size === "large"
    ? "absolute inset-0 bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 uppercase select-none z-0"
    : "absolute inset-0 bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase select-none z-0";

  return (
    <div className="relative flex items-center justify-center shrink-0" title={formattedName}>
      <div className={containerClasses}>
        {/* Render initials as placeholder/fallback (no pink/purple gradient!) */}
        <div className={placeholderClasses}>
          {initials}
        </div>

        {/* If we have a logo URL and no error, render the image over the initials placeholder */}
        {showImage && (
          <img
            src={logoUrl}
            alt={formattedName}
            className={`w-full h-full object-contain bg-white transition-opacity duration-300 relative z-10 ${loading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setLoading(false)}
            onError={() => {
              if (logoUrl === localSvgUrl) {
                setLocalSvgError(true);
              } else {
                setClearbitError(true);
              }
              setLoading(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

const getDbCountryKey = (c: string): string => {
  const normalized = c.toLowerCase().trim();
  if (normalized === "united arab emirates" || normalized === "uae") {
    return "uae";
  }
  return normalized;
};

const mapDbOfferToFrontend = (p: any): Offer => {
  const originalPrice = parsePrice(p.regular_price);
  const promoPrice = parsePrice(p.discounted_price);
  let displayPrice = promoPrice ?? originalPrice ?? 0;
  let crossOutPrice = originalPrice && promoPrice && promoPrice < originalPrice ? originalPrice : 0;
  let discountPercentage = crossOutPrice > 0 ? Math.round(((crossOutPrice - displayPrice) / crossOutPrice) * 100) : 0;

  const rawBrand = p.brand?.trim() || '';
  const isBrandValid = rawBrand && rawBrand.toLowerCase() !== 'null' && rawBrand.toLowerCase() !== 'na' && rawBrand.toLowerCase() !== 'not known';
  const rawProductName = (p.product_name || 'N/A').trim();
  
  let formattedTitle = rawProductName;
  if (isBrandValid) {
    const brandLower = rawBrand.toLowerCase();
    const nameLower = rawProductName.toLowerCase();
    if (!nameLower.includes(brandLower)) {
      formattedTitle = `${rawBrand} ${rawProductName}`;
    }
  }

  return {
    id: p.id != null ? p.id.toString() : String(Math.random()),
    title: formattedTitle,
    image: p.image_path || '/placeholder.svg',
    price: displayPrice,
    original: crossOutPrice,
    discount: discountPercentage,
    retailer: p.mart_name || 'N/A',
    country: p.country || 'N/A',
    valid: p.offer_timeline || 'N/A',
    brand: isBrandValid ? rawBrand : 'N/A',
    productType: p.type || 'N/A',
    category: p.category || 'N/A',
    packSize: p.weight_quantity || 'N/A',
    flyerUrl: p.flyer_url,
    offerName: p.offer_name || null,
    startDate: p.start_date || null,
    endDate: p.end_date || null
  };
};

export default function OfferBank() {
  const { user } = useAuth();

  // --- STATE ---
  const [offerType, setOfferType] = useState("offers");
  const [search, setSearch] = useState(() => sessionStorage.getItem("offerbank_search") || "");
  const [range, setRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    const stored = sessionStorage.getItem("offerbank_range");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          from: parsed.from ? new Date(parsed.from) : undefined,
          to: parsed.to ? new Date(parsed.to) : undefined
        };
      } catch {}
    }
    return { from: undefined, to: undefined };
  });
  const [applied, setApplied] = useState(() => sessionStorage.getItem("offerbank_applied") === "true");
  const [showDistinct, setShowDistinct] = useState(() => {
    const stored = sessionStorage.getItem("offerbank_showDistinct");
    return stored !== null ? stored === "true" : true;
  });
  const [appliedFilters, setAppliedFilters] = useState<any>(() => {
    const stored = sessionStorage.getItem("offerbank_appliedFilters");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.range) {
          if (parsed.range.from) parsed.range.from = new Date(parsed.range.from);
          if (parsed.range.to) parsed.range.to = new Date(parsed.range.to);
        }
        return parsed;
      } catch {}
    }
    return null;
  });

  // --- STATE FOR FILTER DROPDOWNS ---
  const [country, setCountry] = useState(() => sessionStorage.getItem("offerbank_country") || "");
  const [city, rawSetCity] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("offerbank_city");
    return stored ? JSON.parse(stored) : [];
  });
  const [retailers, rawSetRetailers] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("offerbank_retailers");
    return stored ? JSON.parse(stored) : [];
  });
  const [retailerSearch, setRetailerSearch] = useState("");

  const [category, rawSetCategory] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("offerbank_category");
    return stored ? JSON.parse(stored) : [];
  }); 
  const [categorySearch, setCategorySearch] = useState("");

  const [subCategory, setSubCategory] = useState(() => sessionStorage.getItem("offerbank_subCategory") || "all");

  // Mirror shared filters into Promotion Analysis' session keys so switching
  // from Offer Bank to Promo Analysis keeps the same context (country,
  // category). Retailer is deliberately NOT mirrored: Offer Bank is
  // multi-select, Promo Analysis is single-select, and copying the first
  // retailer made Promo default to one retailer instead of "All Retailers".
  useEffect(() => {
    if (country) sessionStorage.setItem("promoanalysis_country", country);
  }, [country]);
  useEffect(() => {
    // Only mirror a genuine single choice. "All Categories" expands to the
    // full list here, and taking the first entry handed Promo Analysis a
    // real selection ("Cereals & Bars", alphabetically first) instead of
    // leaving it on "All Categories".
    const picked = category.filter((c) => c && c.toLowerCase() !== "all");
    if (picked.length === 1) {
      sessionStorage.setItem("promoanalysis_selectedCategory", picked[0]);
    } else {
      sessionStorage.removeItem("promoanalysis_selectedCategory");
    }
  }, [category]);

  // Safe wrapper setters to prevent redundant renders from reference-inequality
  const setCity = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    rawSetCity((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      return sameStringArray(prev, next) ? prev : next;
    });
  }, []);

  const setRetailers = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    rawSetRetailers((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      return sameStringArray(prev, next) ? prev : next;
    });
  }, []);

  const setCategory = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    rawSetCategory((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      return sameStringArray(prev, next) ? prev : next;
    });
  }, []);

  // --- STATE TO HOLD DROPDOWN OPTIONS ---
  const [countries, setCountries] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [retailerOptions, setRetailerOptions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subCategories, setSubCategories] = useState<string[]>([]);
  
  // NEW: State for Pack Sizes and unified loading
  const [packSizeOptions, setPackSizeOptions] = useState<string[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  // --- SEARCH STATES FOR SIDE FILTERS ---
  const [brandSearch, setBrandSearch] = useState("");
  const [packSizeSearch, setPackSizeSearch] = useState("");

  // --- FAVORITES & SAVED FILTERS STATE ---
  const [savedOffers, setSavedOffers] = useState<Offer[]>([]);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);

  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [savedFiltersDialogOpen, setSavedFiltersDialogOpen] = useState(false);

  // --- LOADING STATES (Kept for UI compatibility, but controlled by unified fetch) ---
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingRetailers, setIsLoadingRetailers] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingSubCategories, setIsLoadingSubCategories] = useState(false);
  const [userPermissions, setUserPermissions] = useState<{
    allowed_categories: string[];
    allowed_regions: string[];
  } | null>(null);

  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  // --- RESULTS PANEL STATE ---
  const [offers, setOffers] = useState<Offer[]>([]);
  const [totalCount, setTotalCount] = useState(0); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [price, setPrice] = useState<number[]>(() => {
    const stored = sessionStorage.getItem("offerbank_price");
    return stored ? JSON.parse(stored) : [0, 2000];
  });
  const [discount, setDiscount] = useState<number[]>(() => {
    const stored = sessionStorage.getItem("offerbank_discount");
    return stored ? JSON.parse(stored) : [0, 100];
  });
  const [selectedPacks, setSelectedPacks] = useState<string[]>(() => {
    const stored = sessionStorage.getItem("offerbank_selectedPacks");
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedBrands, setSelectedBrands] = useState<Record<string, boolean>>(() => {
    const stored = sessionStorage.getItem("offerbank_selectedBrands");
    return stored ? JSON.parse(stored) : {};
  });
  const [sort, setSort] = useState(() => sessionStorage.getItem("offerbank_sort") || "best");
  const [page, setPage] = useState(() => {
    const stored = sessionStorage.getItem("offerbank_page");
    return stored ? parseInt(stored, 10) : 1;
  });
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return (sessionStorage.getItem("offerbank_viewMode") as 'grid' | 'table') || 'grid';
  });
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // --- SAVE STATES TO SESSION STORAGE ---
  useEffect(() => {
    sessionStorage.setItem("offerbank_search", search);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_range", JSON.stringify(range));
  }, [range]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_applied", String(applied));
  }, [applied]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_showDistinct", String(showDistinct));
  }, [showDistinct]);

  useEffect(() => {
    if (appliedFilters) {
      sessionStorage.setItem("offerbank_appliedFilters", JSON.stringify(appliedFilters));
    } else {
      sessionStorage.removeItem("offerbank_appliedFilters");
    }
  }, [appliedFilters]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_country", country);
  }, [country]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_city", JSON.stringify(city));
  }, [city]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_retailers", JSON.stringify(retailers));
  }, [retailers]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_category", JSON.stringify(category));
  }, [category]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_subCategory", subCategory);
  }, [subCategory]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_price", JSON.stringify(price));
  }, [price]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_discount", JSON.stringify(discount));
  }, [discount]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_selectedPacks", JSON.stringify(selectedPacks));
  }, [selectedPacks]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_selectedBrands", JSON.stringify(selectedBrands));
  }, [selectedBrands]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_sort", sort);
  }, [sort]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_page", String(page));
  }, [page]);

  useEffect(() => {
    sessionStorage.setItem("offerbank_viewMode", viewMode);
  }, [viewMode]);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterDescription, setFilterDescription] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOffer, setDetailOffer] = useState<Offer | null>(null);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [flyerOffer, setFlyerOffer] = useState<Offer | null>(null);
  const [compareList, setCompareList] = useState<Offer[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const { toast } = useToast();

  // Current Currency Symbol
  const currencySymbol = useMemo(() => getCurrency(country), [country]);

  // --- HELPERS FOR LABELS ---
  const categoryLabel = useMemo(() => {
    if (!category || category.length === 0) return "Select Categories";
    if (categories.length > 0 && category.length === categories.length) return "All Categories";
    if (category.length === 1) return category[0];
    return `${category.length} Categories Selected`;
  }, [category, categories]);

  const cityLabel = useMemo(() => {
    if (!city || city.length === 0) return "Select City";
    if (cities.length > 0 && city.length === cities.length) return "All Cities";
    const allCities = getRegionsForCountry(country);
    if (allCities.length > 0 && city.length === allCities.length) return "All Cities";
    return city.join(", ");
  }, [city, country, cities]);

  const retailerLabel = useMemo(() => {
    if (!retailers || retailers.length === 0) return "Select Retailer";
    if (retailerOptions.length > 0 && retailers.length === retailerOptions.length) return "All Retailers";
    if (retailers.length === 1) return retailers[0];
    return `${retailers.length} Retailers Selected`;
  }, [retailers, retailerOptions]);

  // --- LOAD USER PERMISSIONS FIRST ---
  useEffect(() => {
    const loadPermissions = async () => {
      setIsLoadingPermissions(true);
      const { data, error } = await supabase.rpc('get_current_user_permissions');

      if (error || !data?.length) {
        console.error("Failed to load permissions", error);
        setUserPermissions({ allowed_categories: [], allowed_regions: [] });
        toast({
          title: "Access restricted",
          description: "No permissions found for your account.",
          variant: "destructive"
        });
      } else {
        setUserPermissions(data[0]);
      }
      setIsLoadingPermissions(false);
    };

    loadPermissions();
  }, []);

  // --- LOAD USER SAVED FILTERS & LIKED OFFERS ---
  useEffect(() => {
    if (!user) {
      setSavedFilters([]);
      setSavedOffers([]);
      return;
    }

    const loadUserData = async () => {
      try {
        // 1. Fetch saved filters
        const { data: filtersData, error: filtersError } = await supabase
          .from('user_saved_filters')
          .select('*')
          .order('created_at', { ascending: false });

        if (!filtersError && filtersData) {
          setSavedFilters(filtersData.map((f: any) => ({
            id: f.id,
            name: f.name,
            description: f.description || "",
            criteria: f.criteria,
            timestamp: new Date(f.created_at)
          })));
        }

        // 2. Fetch liked offers
        const { data: likedData, error: likedError } = await supabase
          .from('user_liked_offers')
          .select(`
            offer_id,
            flyer_products (
              id, product_key_id, product_name, brand, type, weight_quantity,
              regular_price, discounted_price, category,
              image_path, mart_name, offer_timeline, country, flyer_url,
              start_date, end_date
            )
          `);

        if (!likedError && likedData) {
          const mappedLiked = likedData
            .filter((row: any) => row.flyer_products)
            .map((row: any) => mapDbOfferToFrontend(row.flyer_products));
          setSavedOffers(mappedLiked);
        } else {
          setSavedOffers([]);
        }
      } catch (err) {
        console.error("Error loading user preferences data:", err);
      }
    };

    loadUserData();
  }, [user]);

  // --- INIT COUNTRIES (filtered by permissions) ---
  useEffect(() => {
    if (!userPermissions?.allowed_regions?.length) {
      setCountries([]);
      setIsLoadingCountries(false);
      return;
    }

    // Helper to normalize country names for comparison
    const normalize = (s: string) => s.toLowerCase().replace(/ /g, '').replace('uae', 'unitedarabemirates');

    const allowed = staticCountries.filter(staticC =>
      userPermissions.allowed_regions.some(allowedR => {
        const s = normalize(staticC);
        const a = normalize(allowedR);
        return s.includes(a) || a.includes(s);
      })
    );

    setCountries(allowed.sort());
    setIsLoadingCountries(false);

    if (allowed.length > 0 && country && !allowed.includes(country)) {
      setCountry(allowed[0]);
    }
  }, [userPermissions]);

  // --- UPDATE CITIES ON COUNTRY CHANGE ---
  useEffect(() => {
    if (!country) {
      setCities([]);
      return;
    }
    
    setIsLoadingCities(true);
    const staticCities = getRegionsForCountry(country);
    if (staticCities && staticCities.length > 0) {
      setCities(staticCities.sort());
    } else {
      setCities([]);
    }
    setIsLoadingCities(false);
  }, [country]);

  // --- REFS TO TRACK PREVIOUS STATE ---
const prevCountryRef = useRef(country);
const prevCityRef = useRef(city);
const prevCategoriesCountRef = useRef(0);
const filterFetchRequestRef = useRef(0);
const countryMasterRpcFiltersCacheRef = useRef<Map<string, { categories: string[] }>>(new Map());

// --- UNIFIED FILTER FETCH (OPTIMIZED VIA MATERIALIZED VIEW) ---
useEffect(() => {
  if (isLoadingPermissions) return;
  if (!userPermissions?.allowed_regions?.length || !country) {
    setRetailerOptions([]);
    setCategories([]);
    setSubCategories([]);
    setAllBrands([]);
    setPackSizeOptions([]);
    return;
  }

  const fetchFilters = async () => {
    const requestId = ++filterFetchRequestRef.current;
    const countryChanged = prevCountryRef.current !== country;

    prevCountryRef.current = country;
    prevCityRef.current = city;

    if (countryChanged) {
      setIsLoadingCategories(true);
      setIsLoadingRetailers(true);
      setIsLoadingCities(true);
    }
    setIsLoadingSubCategories(true);
    setIsLoadingFilters(true);

    try {
      // 1. Fetch country-level filters if country changed (or if states are empty)
      if (countryChanged || categories.length === 0 || retailerOptions.length === 0) {
        const { data: countryData, error: countryError } = await supabase
          .from('mv_promo_dimensions')
          .select('dimension_type, dimension_value')
          .eq('country_key', getDbCountryKey(country))
          .in('dimension_type', ['category', 'region', 'retailer']);

        if (countryError) {
          console.error("❌ Error loading country-level filters:", countryError);
        } else if (countryData && requestId === filterFetchRequestRef.current) {
          const allowedCatsSet = new Set(
            (userPermissions?.allowed_categories || []).map(c => c.toLowerCase().trim())
          );

          const parsedCats = Array.from(new Set(
            countryData
              .filter(r => r.dimension_type === 'category')
              .map(r => r.dimension_value?.trim() || "")
              .filter(Boolean)
          ))
          .filter(c => allowedCatsSet.has(c.toLowerCase().trim()))
          .sort((a, b) => a.localeCompare(b));

          const parsedRets = Array.from(new Set(
            countryData
              .filter(r => r.dimension_type === 'retailer')
              .map(r => r.dimension_value?.trim() || "")
              .filter(Boolean)
          )).sort((a, b) => a.localeCompare(b));

          const parsedCities = Array.from(new Set(
            countryData
              .filter(r => r.dimension_type === 'region')
              .map(r => r.dimension_value?.trim() || "")
              .filter(Boolean)
          )).sort((a, b) => a.localeCompare(b));

          setCategories(parsedCats);
          setRetailerOptions(parsedRets);
          setCities(parsedCities);

          setIsLoadingCategories(false);
          setIsLoadingRetailers(false);
          setIsLoadingCities(false);
        }
      }

      // 2. Fetch category-scoped filters (brands, subcategories, pack sizes).
      // One query per dimension_type: the row cap applies per request, and
      // mv_promo_dimensions UNIONs pack sizes last, so a combined query spent
      // its whole budget on brands and returned zero pack sizes.
      const hasSelectedCategories = Array.isArray(category) && category.length > 0;

      const fetchDimension = async (type: string) => {
        let q = supabase
          .from('mv_promo_dimensions')
          .select('dimension_value')
          .eq('country_key', getDbCountryKey(country))
          .eq('dimension_type', type);
        if (hasSelectedCategories) q = q.in('parent_category', category);
        const { data, error } = await q.limit(1000);
        if (error) {
          console.error(`❌ Error loading ${type} filters:`, error);
          return [] as string[];
        }
        return Array.from(new Set(
          (data || [])
            .map((r: any) => r.dimension_value?.trim() || "")
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b)) as string[];
      };

      const [nextBrands, nextSubCats, nextPackSizes] = await Promise.all([
        fetchDimension('brand'),
        fetchDimension('subcategory'),
        fetchDimension('pack_size'),
      ]);

      if (requestId === filterFetchRequestRef.current) {
        setAllBrands(nextBrands);
        setSubCategories(nextSubCats);
        setPackSizeOptions(nextPackSizes);
      }

    } catch (err) {
      console.error("💥 Unexpected error in filter fetch:", err);
    } finally {
      if (requestId === filterFetchRequestRef.current) {
        setIsLoadingFilters(false);
        setIsLoadingCategories(false);
        setIsLoadingRetailers(false);
        setIsLoadingCities(false);
        setIsLoadingSubCategories(false);
      }
    }
  };

  fetchFilters();
}, [country, category, userPermissions, isLoadingPermissions]);


  // --- CALCULATIONS & DERIVED STATE ---
  
  const activeBrands = useMemo(() => Object.keys(selectedBrands).filter(b => selectedBrands[b]), [selectedBrands]);

  // Keep selected categories in sync when available category options change.
  // If user had "all selected" before options expanded (e.g., 18 -> 22), promote selection to full list.
  useEffect(() => {
    // Options empty means they haven't loaded yet (or are reloading after a
    // country change) — not that every category became invalid. Filtering the
    // selection against an empty list wiped it permanently: applying a saved
    // filter set the categories, the reload blanked `categories`, this cleared
    // the selection to [], and the dropdown fell back to "Select Categories".
    if (categories.length === 0) return;
    setCategory((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const previousTotal = prevCategoriesCountRef.current;
      const wasAllSelected = previousTotal > 0 && prev.length === previousTotal;
      if (wasAllSelected) {
        const nextAll = categories;
        return sameStringArray(prev, nextAll) ? prev : nextAll;
      }
      const filtered = prev.filter((c) => categories.includes(c));
      return sameStringArray(prev, filtered) ? prev : filtered;
    });
    prevCategoriesCountRef.current = categories.length;
  }, [categories]);

  const visibleCategories = useMemo(() => {
  if (!categorySearch) return categories;
  return categories.filter(c =>
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );
}, [categories, categorySearch]);

  // Updated: Use pack sizes from DB response instead of deriving from offers
  const packSizes = useMemo(() => {
    return packSizeOptions;
  }, [packSizeOptions]);

  const currentFilters = {
    offerType,
    country,
    city,
    retailers,
    category,
    subCategory,
    search,
    range,
    showDistinct,
    activeBrands,
    selectedPacks
  };

  // Sidebar filters (Brand, Pack Size) apply on their own — see the effect
  // below — so they are deliberately excluded from the "needs Apply" check.
  // Compare on a normalised signature, not raw JSON.stringify of the two
  // objects: appliedFilters can come from a saved filter (brands/packSize keys)
  // or from sessionStorage (dates as strings), so a straight stringify compare
  // stayed permanently unequal — which meant the nudge fired once on mount and
  // never again.
  const filterSignature = (f: any) => JSON.stringify({
    offerType: f?.offerType ?? "",
    country: f?.country ?? "",
    city: [...(f?.city ?? [])].sort(),
    retailers: [...(f?.retailers ?? [])].sort(),
    category: [...(f?.category ?? [])].sort(),
    subCategory: f?.subCategory ?? "all",
    search: (f?.search ?? "").trim(),
    from: f?.range?.from ? new Date(f.range.from).getTime() : null,
    to: f?.range?.to ? new Date(f.range.to).getTime() : null,
    showDistinct: Boolean(f?.showDistinct),
  });

  const hasUnappliedChanges = applied && appliedFilters
    ? filterSignature(currentFilters) !== filterSignature(appliedFilters)
    : false;

  // Brand and Pack Size are sidebar filters: they take effect as soon as they
  // change, no Apply click. They still go through appliedFilters (and so the
  // RPC) rather than being filtered in the browser, which keeps the offer count
  // and pagination honest — client-side filtering would only trim the current
  // page. Early-returns when nothing changed, so this can't loop.
  useEffect(() => {
    if (!applied || !appliedFilters) return;
    const prevBrands = appliedFilters.activeBrands ?? appliedFilters.brands ?? [];
    const prevPacks = appliedFilters.selectedPacks ?? appliedFilters.packSize ?? [];
    if (sameStringArray(prevBrands, activeBrands) && sameStringArray(prevPacks, selectedPacks)) return;
    setAppliedFilters({ ...appliedFilters, activeBrands, selectedPacks });
    setPage(1);
  }, [activeBrands, selectedPacks, applied, appliedFilters]);

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
      description: "Click Apply to update the results.",
    });
  }, [hasUnappliedChanges, toast]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  // --- MAIN OFFERS FETCH (server-side with permissions) ---
  useEffect(() => {
    if (!applied || !appliedFilters) {
      setLoading(false);
      setOffers([]);
      setTotalCount(0);
      return;
    }

    if (!userPermissions?.allowed_regions?.length || !appliedFilters.country) {
      setOffers([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const fetchOffers = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = {
          p_country: getDbCountryKey(appliedFilters.country),
          p_cities: normalizeMultiSelectForRpc(appliedFilters.city, cities),
          p_categories: normalizeMultiSelectForRpc(appliedFilters.category, categories),
          p_subcategories: appliedFilters.subCategory !== 'all' ? [appliedFilters.subCategory] : null,
          p_retailers: normalizeMultiSelectForRpc(appliedFilters.retailers, retailerOptions),
          p_brands: (appliedFilters.activeBrands || appliedFilters.brands)?.length > 0 
            ? (appliedFilters.activeBrands || appliedFilters.brands) 
            : null,
          p_pack_sizes: (appliedFilters.selectedPacks || appliedFilters.packSize)?.length > 0 
            ? (appliedFilters.selectedPacks || appliedFilters.packSize) 
            : null,
          p_search: (appliedFilters.search || "").trim() || null,
          p_date_from: appliedFilters.range?.from ? format(appliedFilters.range.from, 'yyyy-MM-dd') : null,
          p_date_to: appliedFilters.range?.to ? format(appliedFilters.range.to, 'yyyy-MM-dd') : null,
          p_show_distinct: appliedFilters.showDistinct,
          p_page: page,
          p_page_size: 30
        };



        const { data, error } = await supabase.rpc('get_offers_filtered_paged', params);



        if (error) throw error;

        if (data && data.length > 0) {
          const count = data[0]?.total_count || 0;
          setTotalCount(count);

          const mappedOffers = data.map((p: any) => mapDbOfferToFrontend(p));

          setOffers(mappedOffers);
        } else {
          setOffers([]);
          setTotalCount(0);
        }
      } catch (err: any) {
        console.error("Offers fetch error:", err);
        setError(err.message || "Failed to load offers");
        setOffers([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [appliedFilters, page, userPermissions]);

  const filtered = useMemo(() => {
    let res = offers.filter((o) =>
      o.price >= price[0] && o.price <= price[1] &&
      o.discount >= discount[0] && o.discount <= discount[1]
    );

    if (sort === "best") res = [...res].sort((a, b) => b.discount - a.discount);
    if (sort === "price-low") res = [...res].sort((a, b) => a.price - b.price);
    if (sort === "price-high") res = [...res].sort((a, b) => b.price - a.price);

    return res;
  }, [offers, price, discount, sort]);

  const ITEMS_PER_PAGE = 30;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const paginationRange = useMemo(() => {
    const range: (number | string)[] = [];
    const siblings = 1; // Number of pages on either side of current page

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        range.push(i);
      }
      return range;
    }

    // Always show first page
    range.push(1);

    const leftSiblingIndex = Math.max(page - siblings, 2);
    const rightSiblingIndex = Math.min(page + siblings, totalPages - 1);

    const showLeftSpill = leftSiblingIndex > 2;
    const showRightSpill = rightSiblingIndex < totalPages - 1;

    if (showLeftSpill) {
      range.push("...");
    }

    for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
      range.push(i);
    }

    if (showRightSpill) {
      range.push("...");
    }

    // Always show last page
    range.push(totalPages);

    return range;
  }, [totalPages, page]);

  const paginatedResults = filtered; 

  const clearAll = () => {
    setSubCategory("all");
    setSearch("");
    setRange({ from: undefined, to: undefined });
    setShowDistinct(true);
    setCity([]);
    setRetailers([]);
    setSelectedBrands({});
    setSelectedPacks([]);
    setPrice([0, 2000]);
    setDiscount([0, 100]);
    setAppliedFilters(null);
    setApplied(false);
    setTotalCount(0);
  };

  const handleSaveFilter = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save filters.",
        variant: "destructive"
      });
      return;
    }
    if (!filterName) {
      toast({
        title: "Name is required",
        description: "Please enter a name for your filter.",
        variant: "destructive",
      });
      return;
    }
    const completeFilter = {
      ...currentFilters,
      price,
      discount,
      brands: activeBrands,
      packSize: selectedPacks,
    };

    try {
      const { data, error } = await supabase
        .from('user_saved_filters')
        .insert({
          user_id: user.id,
          name: filterName,
          description: filterDescription,
          criteria: completeFilter
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newSavedFilter = {
          id: data.id,
          name: data.name,
          description: data.description || "",
          criteria: data.criteria,
          timestamp: new Date(data.created_at),
        };
        setSavedFilters(prev => [newSavedFilter, ...prev]);
        toast({
          title: "Filter Saved!",
          description: `"${filterName}" has been added to your saved filters.`,
        });
        setIsSaveDialogOpen(false);
        setFilterName("");
        setFilterDescription("");
      }
    } catch (err: any) {
      console.error("Failed to save filter:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save filter.",
        variant: "destructive"
      });
    }
  };

  const handleApplySavedFilter = (savedFilter: SavedFilter) => {
    const criteria = savedFilter.criteria;
    setOfferType(criteria.offerType || "offers");
    setCountry(criteria.country || "");
    setCity(criteria.city || []);
    setRetailers(criteria.retailers || []);
    setCategory(criteria.category || []);
    setSubCategory(criteria.subCategory || "all");
    setSearch(criteria.search || "");
    setShowDistinct(criteria.showDistinct !== undefined ? criteria.showDistinct : true);
    if (criteria.range?.from && criteria.range?.to) {
      setRange({ from: new Date(criteria.range.from), to: new Date(criteria.range.to) });
    }
    setPrice(criteria.price || [0, 2000]);
    setDiscount(criteria.discount || [0, 100]);
    const packs = Array.isArray(criteria.packSize) ? criteria.packSize : (criteria.packSize ? [criteria.packSize] : []);
    setSelectedPacks(packs);
    if (criteria.brands) {
      const brandMap: Record<string, boolean> = criteria.brands.reduce((acc: any, brand: string) => {
        acc[brand] = true;
        return acc;
      }, {});
      setSelectedBrands(brandMap);
    }
    setAppliedFilters(criteria);
    setApplied(true);
    setSavedFiltersDialogOpen(false);
    toast({ title: `Applied filter: ${savedFilter.name}` });
  };

  const deleteSavedFilter = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_saved_filters')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      setSavedFilters(prev => prev.filter(f => f.id !== id));
      toast({ title: "Saved filter deleted" });
    } catch (err: any) {
      console.error("Failed to delete saved filter:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete saved filter.",
        variant: "destructive"
      });
    }
  };
  const addToCompare = (offer: Offer) => {
    if (!offer) return;
    if (compareList.find(p => p.id === offer.id)) return;
    if (compareList.length >= 2) {
      toast({
        title: "Cannot compare more than 2 items",
        description: "Please remove an item to add a new one.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: `${offer.title} added to compare` });
    setCompareList(prev => [...prev, offer]);
  };

  const removeFromCompare = (id: string) => {
    setCompareList(prev => prev.filter(p => p.id !== id));
  };

  const toggleFavorite = async (offer: Offer) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save offers.",
        variant: "destructive"
      });
      return;
    }

    const isCurrentlySaved = savedOffers.some(o => o.id === offer.id);

    try {
      if (isCurrentlySaved) {
        const { error } = await supabase
          .from('user_liked_offers')
          .delete()
          .eq('user_id', user.id)
          .eq('offer_id', parseInt(offer.id, 10));

        if (error) throw error;

        setSavedOffers(prev => prev.filter(o => o.id !== offer.id));
        toast({ title: "Removed from Saved Offers" });
      } else {
        const { error } = await supabase
          .from('user_liked_offers')
          .insert({
            user_id: user.id,
            offer_id: parseInt(offer.id, 10)
          });

        if (error) throw error;

        setSavedOffers(prev => [...prev, offer]);
        toast({ title: "Added to Saved Offers" });
      }
    } catch (err: any) {
      console.error("Failed to toggle favorite:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update saved offers.",
        variant: "destructive"
      });
    }
  };

  const handleCompareClick = () => {
    if (compareList.length < 2) {
      toast({
        title: "Comparison Incomplete",
        description: compareList.length === 0
          ? "Select two offers to compare."
          : "Add one more offer to compare.",
        variant: "destructive"
      });
    } else {
      setCompareOpen(true);
    }
  };

  const handleExportComparison = () => {
    if (compareList.length === 0) return;
    const headers = [
      "Title", "Price", "Original Price", "Discount", "Retailer", "Country",
      "Brand", "Category", "Pack Size", "Validity"
    ];
    const rows = compareList.map(o => [
      `"${o.title.replace(/"/g, '""')}"`,
      o.price,
      o.original,
      `${o.discount}%`,
      `"${o.retailer}"`,
      `"${o.country}"`,
      `"${o.brand}"`,
      `"${o.category}"`,
      `"${o.packSize}"`,
      `"${formatOfferTimeline(o.startDate, o.endDate, o.valid)}"`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `comparison_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };


  const renderAsideContent = () => (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-300">Brand</label>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-9 items-center justify-between w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-gray-50 shadow-sm">
              <span className="truncate">{activeBrands.length > 0 ? `${activeBrands.length} selected` : 'Select Brands'}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0 space-y-1 bg-black/80 backdrop-blur-md border-white/20 text-white max-h-60 flex flex-col">
            <div className="p-2 border-b border-white/10 bg-zinc-900 shrink-0 space-y-2">
              <input type="text" placeholder="Search brands..." className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1 outline-none focus:border-purple-500" value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} />
              <div className="flex items-center justify-between px-1">
                <button onClick={() => { const visibleBrands = allBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())); const newSelection = { ...selectedBrands }; visibleBrands.forEach(b => newSelection[b] = true); setSelectedBrands(newSelection); }} className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">Select All</button>
                <button onClick={() => setSelectedBrands({})} className="text-xs text-gray-400 hover:text-white transition-colors">Clear All</button>
              </div>
            </div>
            <div className="overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full">
              {allBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).map((b) => {
                const isSelected = !!selectedBrands[b];
                return (
                  <button key={b} onClick={() => setSelectedBrands((s) => ({ ...s, [b]: !isSelected }))} className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between transition-colors ${isSelected ? "bg-white text-black font-medium" : "hover:bg-white/10"}`}>
                    <span className="truncate">{b}</span>
                    {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-300">Pack Size</label>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex h-9 items-center justify-between w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-gray-50 shadow-sm">
              <span className="truncate">{selectedPacks.length > 0 ? `${selectedPacks.length} selected` : 'Select Pack Size'}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0 space-y-1 bg-black/80 backdrop-blur-md border-white/20 text-white max-h-60 flex flex-col">
            <div className="p-2 border-b border-white/10 bg-zinc-900 shrink-0 space-y-2">
              <input type="text" placeholder="Search pack size..." className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1 outline-none focus:border-purple-500" value={packSizeSearch} onChange={(e) => setPackSizeSearch(e.target.value)} />
              <div className="flex items-center justify-between px-1">
                <button onClick={() => { const visiblePacks = packSizes.filter(p => p.toLowerCase().includes(packSizeSearch.toLowerCase())); setSelectedPacks((prev) => Array.from(new Set([...prev, ...visiblePacks]))); }} className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">Select All</button>
                <button onClick={() => setSelectedPacks([])} className="text-xs text-gray-400 hover:text-white transition-colors">Clear All</button>
              </div>
            </div>
            <div className="overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full">
              {packSizes.filter(p => p.toLowerCase().includes(packSizeSearch.toLowerCase())).map((p) => {
                const isSelected = selectedPacks.includes(p);
                return (
                  <button key={p} onClick={() => setSelectedPacks((prev) => isSelected ? prev.filter((item) => item !== p) : [...prev, p])} className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between transition-colors ${isSelected ? "bg-white text-black font-medium" : "hover:bg-white/10"}`}>
                    <span className="truncate">{p}</span>
                    {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium text-gray-300">Offer Price</label>
        <Slider value={price} min={0} max={2000} step={10} onValueChange={(v) => setPrice(v as number[])} className="[&>span:first-of-type]:bg-white/20 [&>span:first-of-type_>span]:bg-gradient-to-r from-purple-500 to-orange-500 [&_[role=slider]]:bg-white [&_[role=slider]]:w-4 [&_[role=slider]]:h-4 [&_[role=slider]]:border-0" />
        <div className="flex items-center justify-between text-sm text-gray-50 mt-2">
          <div className="flex items-center gap-1 border border-white/20 rounded-md bg-white/10 px-2 py-1 shadow-sm">
            <span className="text-xs text-gray-400">{currencySymbol}</span>
            <input type="number" value={price[0]} onChange={(e) => { const value = Math.max(0, Math.min(Number(e.target.value), price[1])); setPrice([value, price[1]]); }} className="w-14 bg-transparent text-center text-sm outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none" />
          </div>
          <span className="text-gray-400">-</span>
          <div className="flex items-center gap-1 border border-white/20 rounded-md bg-white/10 px-2 py-1 shadow-sm">
            <span className="text-xs text-gray-400">{currencySymbol}</span>
            <input type="number" value={price[1]} onChange={(e) => { const value = Math.min(2000, Math.max(Number(e.target.value), price[0])); setPrice([price[0], value]); }} className="w-14 bg-transparent text-center text-sm outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-xs font-medium text-gray-300">Discount</label>
        <Slider value={discount} min={0} max={100} step={1} onValueChange={(v) => setDiscount(v as number[])} className="[&>span:first-of-type]:bg-white/20 [&>span:first-of-type_>span]:bg-gradient-to-r from-purple-500 to-orange-500 [&_[role=slider]]:bg-white [&_[role=slider]]:w-4 [&_[role=slider]]:h-4 [&_[role=slider]]:border-0" />
        <div className="flex items-center justify-between text-sm text-gray-50 mt-2">
          <div className="flex items-center gap-1 border border-white/20 rounded-md bg-white/10 px-2 py-1 shadow-sm">
            <input type="number" value={discount[0]} onChange={(e) => { const value = Math.max(0, Math.min(Number(e.target.value), discount[1])); setDiscount([value, discount[1]]); }} className="w-12 bg-transparent text-center text-sm outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <span className="text-gray-400">-</span>
          <div className="flex items-center gap-1 border border-white/20 rounded-md bg-white/10 px-2 py-1 shadow-sm">
            <input type="number" value={discount[1]} onChange={(e) => { const value = Math.min(100, Math.max(Number(e.target.value), discount[0])); setDiscount([discount[0], value]); }} className="w-12 bg-transparent text-center text-sm outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </div>
      </div>
      <button onClick={() => { setIsSaveDialogOpen(true); setIsMobileFilterOpen(false); }} className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md font-medium text-white text-sm bg-gradient-to-r from-purple-500 to-orange-500 shadow-sm hover:-translate-y-0.5 hover:shadow-lg">Save Filter</button>
    </>
  );

  return (
      <div className="min-h-screen bg-black text-white font-sans">

      {/* --- PAGE CONTENT --- */}
      <section className="container mx-auto px-4 py-6">

        {/* --- TOP FILTER BAR 1 (Back, Dropdowns, Actions) --- */}
        <div className="rounded-lg bg-white p-px shadow-lg">
          <div className="rounded-lg bg-zinc-950 p-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              
              {/* Back Button & Mobile Actions Row */}
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 rounded-full hover:bg-white/10 text-white border border-white/20 transition-colors flex-shrink-0"
                  aria-label="Go Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                
                {/* Mobile Actions */}
                <div className="flex sm:hidden items-center gap-2">
                  <button onClick={() => setSavedFiltersDialogOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-white border border-white/20 transition-colors" title="View Saved Filters">
                    <Save className="h-5 w-5" />
                  </button>
                  <button onClick={() => setSavedDialogOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-white border border-white/20 transition-colors relative" title="View Saved Offers">
                    <Heart className="h-5 w-5" />
                    {savedOffers.length > 0 && (<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{savedOffers.length}</span>)}
                  </button>
                </div>
              </div>

              {/* Dropdowns Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                <Select value={offerType} onValueChange={setOfferType}>
                  <SelectTrigger className="h-9 w-full bg-white/5 border border-white/30 text-gray-50 shadow-sm">
                    <SelectValue placeholder="Offers" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-white">
                    <SelectItem value="offers" className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">Offers</SelectItem>
                    <SelectItem value="flyers" className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">Flyers</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={country} onValueChange={(value) => { setCountry(value); setCity([]); setRetailers([]); setSubCategory("all"); }} disabled={isLoadingCountries}>
                  <SelectTrigger className="h-9 w-full bg-white/5 border border-white/30 text-gray-50 shadow-sm">
                    <div className="flex items-center gap-2"> <Globe className="h-4 w-4 text-gray-300" /> <SelectValue placeholder="Select Country" /> </div>
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-white">
                    {isLoadingCountries ? (<SelectItem value="loading" disabled>Loading...</SelectItem>) : (
                      countries.map(c => (<SelectItem key={c} value={c} className="capitalize cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">{c}</SelectItem>))
                    )}
                  </SelectContent>
                </Select>

                {/* Multi-select City */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" disabled={isLoadingCities || !country} className="flex h-9 items-center justify-between w-full min-w-0 rounded-md border border-white/30 bg-white/5 px-3 text-sm text-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                      <div className="flex items-center gap-2 min-w-0"> <MapPin className="h-4 w-4 text-gray-300" /> <span className="capitalize truncate">{cityLabel}</span> </div>
                      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0 bg-black/90 backdrop-blur-md border-white/20 text-white max-h-60 flex flex-col">
                    {isLoadingCities ? (
                      <div className="p-4 text-sm text-gray-400">Loading...</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-zinc-900 shrink-0">
                          <button onClick={() => { setCity([...cities]); setRetailers([]);  setSubCategory("all"); }} className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">Select All</button>
                          <button onClick={() => { setCity([]); setRetailers([]);  setSubCategory("all"); }} className="text-xs text-gray-400 hover:text-white transition-colors">Clear All</button>
                        </div>
                        <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full">
                          {cities.map((c) => {
                            const isSelected = city.includes(c);
                            return (
                              <button key={c} onClick={() => { setCity((prev) => isSelected ? prev.filter((item) => item !== c) : [...prev, c]); setRetailers([]);  setSubCategory("all"); }}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between transition-colors ${isSelected ? "bg-white text-black font-medium" : "hover:bg-white/10"}`}>
                                <span className="capitalize">{c}</span>
                                {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Multi-select Retailer */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" disabled={isLoadingRetailers || !country} className="flex h-9 items-center justify-between w-full min-w-0 rounded-md border border-white/30 bg-white/5 px-3 text-sm text-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-4 w-4 text-gray-300 flex-shrink-0" />
                        <span className="truncate">{retailerLabel}</span>
                        {isLoadingRetailers && <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin flex-shrink-0" />}
                      </div>
                      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0 bg-black/90 backdrop-blur-md border-white/20 text-white max-h-60 flex flex-col">
                    {isLoadingRetailers ? (
                      <div className="p-4 text-sm text-purple-300 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading retailers...</span>
                      </div>
                    ) : (
                      <>
                        <div className="p-2 border-b border-white/10 bg-zinc-900 shrink-0 space-y-2">
                          <input type="text" placeholder="Search retailer..." className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 outline-none focus:border-purple-500" value={retailerSearch} onChange={(e) => setRetailerSearch(e.target.value)} />
                          <div className="flex items-center justify-between px-1">
                            <button onClick={() => { const visibleRetailers = retailerOptions.filter(r => r.toLowerCase().includes(retailerSearch.toLowerCase())); setRetailers((prev) => Array.from(new Set([...prev, ...visibleRetailers]))); setSubCategory("all"); }} className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">Select All</button>
                            <button onClick={() => { setRetailers([]);  setSubCategory("all"); }} className="text-xs text-gray-400 hover:text-white transition-colors">Clear All</button>
                          </div>
                        </div>
                        <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full">
                          {retailerOptions.filter(r => r.toLowerCase().includes(retailerSearch.toLowerCase())).map(r => {
                            const isSelected = retailers.includes(r);
                            return (
                              <button key={r} onClick={() => { setRetailers((prev) => isSelected ? prev.filter((item) => item !== r) : [...prev, r]);  setSubCategory("all"); }}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between transition-colors ${isSelected ? "bg-white text-black font-medium" : "hover:bg-white/10"}`}>
                                <span className="truncate">{r}</span>
                                {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Desktop Action Icons */}
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setSavedFiltersDialogOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-white border border-white/20 transition-colors" title="View Saved Filters">
                  <Save className="h-5 w-5" />
                </button>
                <button onClick={() => setSavedDialogOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-white border border-white/20 transition-colors relative" title="View Saved Offers">
                  <Heart className="h-5 w-5" />
                  {savedOffers.length > 0 && (<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{savedOffers.length}</span>)}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* --- TOP FILTER BAR 2 --- */}
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Dropdown */}
<Popover>
  <PopoverTrigger asChild>
    <button
      type="button"
      disabled={isLoadingCategories}
      className="flex h-9 w-full sm:w-[220px] min-w-0 items-center justify-between rounded-md border border-white/30 bg-white/5 px-3 text-sm text-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 min-w-0">
        <LayoutGrid className="h-4 w-4 text-gray-300 flex-shrink-0" />
        <span className="truncate">{categoryLabel}</span>
        {/* A spinning chevron read as a second dropdown arrow — use the spinner. */}
        {isLoadingCategories && <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin flex-shrink-0" />}
      </div>
      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
    </button>
  </PopoverTrigger>

  <PopoverContent
    align="start"
    className="w-[220px] p-0 bg-black/90 backdrop-blur-md border-white/20 text-white max-h-60 flex flex-col"
  >
    {/* Search + Actions */}
    <div className="p-2 border-b border-white/10 bg-zinc-900 shrink-0 space-y-2">
      {isLoadingCategories && (
        <div className="text-[11px] text-purple-300 flex items-center gap-1">
          <LayoutGrid className="h-3 w-3" />
          <span>Syncing categories...</span>
        </div>
      )}
      <input
        type="text"
        placeholder="Search category..."
        className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 outline-none focus:border-purple-500"
        value={categorySearch}
        onChange={(e) => setCategorySearch(e.target.value)}
      />

      <div className="flex items-center justify-between px-1">
        {/* ✅ FIXED SELECT ALL */}
        <button
          onClick={() => {
            setCategory(categories); // 🔥 ALL categories, not filtered
            setSubCategory("all");
          }}
          className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
        >
          Select All
        </button>

        <button
          onClick={() => {
            setCategory([]);
            setSubCategory("all");
          }}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>

    {/* Category List */}
    <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full">
      {visibleCategories.map((c) => {
        const isSelected = category.includes(c);

        return (
          <button
            key={c}
            onClick={() => {
              setCategory((prev) =>
                isSelected
                  ? prev.filter((item) => item !== c)
                  : [...prev, c]
              );
              setSubCategory("all");
            }}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between transition-colors ${
              isSelected
                ? "bg-white text-black font-medium"
                : "hover:bg-white/10"
            }`}
          >
            <span className="truncate">{c}</span>
            {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
          </button>
        );
      })}

      {visibleCategories.length === 0 && (
        <div className="px-3 py-2 text-xs text-gray-400">
          No categories found
        </div>
      )}
    </div>
  </PopoverContent>
</Popover>


            <Select value={subCategory} onValueChange={setSubCategory} disabled={category.length === 0 || isLoadingSubCategories}>
              <SelectTrigger className="h-9 w-full sm:w-[220px] bg-white/5 border border-white/30 text-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="flex items-center gap-2"> <LayoutGrid className="h-4 w-4 text-gray-300" /> <SelectValue placeholder="Select Sub-Category" /> </div>
              </SelectTrigger>
              <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-white">
                <SelectItem value="all" className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">All Sub-Categories</SelectItem>
                {isLoadingSubCategories ? (<SelectItem value="loading" disabled>Loading...</SelectItem>) : (subCategories.map((sub) => (<SelectItem key={sub} value={sub} className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">{sub}</SelectItem>)))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-white/30 bg-white/5 px-3 text-sm text-gray-50 shadow-sm">
                  <CalendarIcon className="h-4 w-4 text-gray-300" />
                  <span>
                    {range?.from && range?.to ? `${format(range.from, "MMM dd, yyyy")} - ${format(range.to, "MMM dd, yyyy")}` : "All Dates (History)"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-4 bg-black/80 backdrop-blur-md border-white/20 text-white flex flex-col gap-3">
                <Calendar mode="range" numberOfMonths={2} selected={range} onSelect={(v) => { if (v?.from && v?.to) { setRange({ from: v.from, to: v.to }); } }} />
                <div className="flex justify-end border-t border-white/10 pt-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRange(undefined)}
                    className="px-3 py-1.5 rounded bg-white text-black text-xs font-semibold hover:bg-gray-200 transition-colors shadow-sm"
                  >
                    All Dates (History)
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-white/30 bg-white/5 px-3 text-sm text-gray-300 shadow-sm min-w-[220px]">
              <Search className="h-4 w-4 text-gray-400" />
              <input aria-label="Search by Item and Brand" placeholder="Search by Item and Brand" value={search} onChange={(e) => setSearch(e.target.value)} className="h-full w-full bg-transparent text-sm text-gray-50 placeholder-gray-400 outline-none" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-7">
            <div className="flex items-center space-x-2">
              <Switch id="distinct-toggle" checked={showDistinct} onCheckedChange={setShowDistinct} className="data-[state=checked]:bg-purple-500 data-[state=unchecked]:bg-gray-700" />
              <Label htmlFor="distinct-toggle" className="text-sm font-medium text-white cursor-pointer">{showDistinct ? 'Distinct Offers' : 'Showing Duplicates'}</Label>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={clearAll} className="inline-flex items-center gap-2 h-9 px-4 rounded-md font-medium text-white text-sm bg-gradient-to-r from-purple-500 to-orange-500 shadow-sm transition-transform duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:from-purple-300 disabled:to-orange-300">Clear All</button>
              <button onClick={() => {
                if (!country) {
                  toast({
                    title: "Country is required",
                    description: "Please select a country to apply filters.",
                    variant: "destructive"
                  });
                  return;
                }
                let finalCategory = category;
                if (!category || category.length === 0) {
                  finalCategory = categories;
                  setCategory(categories);
                }
                let finalCity = city;
                if (!city || city.length === 0) {
                  finalCity = cities;
                  setCity(cities);
                }
                let finalRetailers = retailers;
                if (!retailers || retailers.length === 0) {
                  finalRetailers = retailerOptions;
                  setRetailers(retailerOptions);
                }
                setAppliedFilters({
                  ...currentFilters,
                  category: finalCategory,
                  city: finalCity,
                  retailers: finalRetailers
                });
                setApplied(true);
                setPage(1);
              }} className="inline-flex items-center gap-2 h-9 px-4 rounded-md font-medium text-white text-sm bg-gradient-to-r from-purple-500 to-orange-500 shadow-sm transition-transform duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:from-purple-300 disabled:to-orange-300">
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div className="mt-6 flex flex-row gap-6 relative">
          {applied && (
            <aside className="w-[260px] flex-shrink-0 p-4 md:p-6 space-y-6 sticky top-20 self-start max-h-[calc(100vh-120px)] overflow-y-auto rounded-lg border border-white/20 bg-white/5 backdrop-blur-lg shadow-lg scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full hidden md:block">
              <h3 className="text-sm font-semibold text-white">Filters</h3>
              {renderAsideContent()}
            </aside>
          )}

          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-white/20 bg-white/5 backdrop-blur-lg p-6 md:p-10 shadow-lg min-h-[420px]">
              {!applied ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <p className="text-xl font-semibold text-white ">Welcome to Offer Index</p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <p className="text-xl font-semibold text-white">Loading Offers from Database...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                  <p className="text-xl font-semibold text-red-400">An Error Occurred</p>
                  <p className="text-sm text-gray-400 mt-2">{error}</p>
                </div>
              ) : (
                <main className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
                    <h2 className="text-sm md:text-base font-semibold text-white">Offers ({totalCount})</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      {applied && (
                        <button
                          onClick={() => setIsMobileFilterOpen(true)}
                          className="md:hidden h-8 px-2.5 rounded-md border border-white/30 bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-white/20 transition-all"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>Filters</span>
                        </button>
                      )}
                      <span className="text-gray-300">Sort by:</span>
                      <Select value={sort} onValueChange={setSort}>
                        <SelectTrigger className="h-8 w-[140px] sm:w-[160px] border-white/30 bg-white/10 text-gray-50 shadow-sm">
                          <SelectValue placeholder="Best Discount" />
                        </SelectTrigger>
                        <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-white">
                          <SelectItem value="best" className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">Best Discount</SelectItem>
                          <SelectItem value="price-low" className="cursor-pointer data-[highlighted]:bg-zinc-700 data-[highlighted]:text-gray-50">Price: Low to High</SelectItem>
                          <SelectItem value="price-high" className="cursor-pointer data-[highlighted]:bg-zinc-7F00 data-[highlighted]:text-gray-50">Price: High to Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="inline-flex items-center gap-1 ml-1">
                        <button aria-label="grid" onClick={() => setViewMode('grid')} className={`h-8 w-8 rounded-md border ${viewMode === 'grid' ? 'bg-white text-black' : 'bg-transparent text-gray-200 border-white/30'}`}>▦</button>
                        <button aria-label="table" onClick={() => setViewMode('table')} className={`h-8 w-8 rounded-md border ${viewMode === 'table' ? 'bg-white text-black' : 'bg-transparent text-gray-200 border-white/30'}`}>≡</button>
                      </div>
                    </div>
                  </div>

                  {viewMode === 'table' ? (
                    <div className="rounded-lg border border-white/20 bg-black/20 overflow-x-auto">
                      <table className="w-full text-sm text-left text-gray-300 border-collapse min-w-[1400px]">
                        <thead className="text-xs uppercase bg-white/10 text-gray-200 font-semibold tracking-wider">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-center w-12 border-b border-white/10 whitespace-nowrap">Select</th>
                            <th scope="col" className="px-4 py-3 text-center w-16 border-b border-white/10 whitespace-nowrap">S.No</th>
                            <th scope="col" className="px-4 py-3 text-center w-20 border-b border-white/10 whitespace-nowrap">Image</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Country</th>
                            <th scope="col" className="px-4 py-3 text-left min-w-[200px] border-b border-white/10 whitespace-nowrap">Offer Name</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Retailer</th>
                            <th scope="col" className="px-4 py-3 text-right w-28 border-b border-white/10 whitespace-nowrap">Regular Price</th>
                            <th scope="col" className="px-4 py-3 text-right w-28 border-b border-white/10 whitespace-nowrap">Promo Price</th>
                            <th scope="col" className="px-4 py-3 text-left w-24 border-b border-white/10 whitespace-nowrap">Pack Size</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Product</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Brand</th>
                            <th scope="col" className="px-4 py-3 text-left min-w-[150px] border-b border-white/10 whitespace-nowrap">Offer Timeline</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Promo Mechanic</th>
                            <th scope="col" className="px-4 py-3 text-left w-24 border-b border-white/10 whitespace-nowrap">Promo Qty</th>
                            <th scope="col" className="px-4 py-3 text-left w-32 border-b border-white/10 whitespace-nowrap">Offer Image ID</th>
                            <th scope="col" className="px-4 py-3 text-center w-28 border-b border-white/10 whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {paginatedResults.map((o, idx) => {
                            const isInCompareList = compareList.some(item => item.id === o.id);
                            const isSaved = savedOffers.some(item => item.id === o.id);
                            return (
                              <tr key={o.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 text-center align-middle">
                                  <input type="checkbox" aria-label={`Select ${o.title}`} checked={isInCompareList} onChange={() => { if (isInCompareList) { removeFromCompare(o.id); } else { addToCompare(o); } }} className="h-4 w-4 cursor-pointer rounded border-gray-500 bg-zinc-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0" />
                                </td>
                                <td className="px-4 py-3 text-center align-middle text-gray-400">{(page - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                                <td className="px-4 py-3 align-middle"><div className="flex justify-center"><img src={o.image || '/placeholder.svg'} alt={o.title} className="h-10 w-10 object-contain rounded bg-white p-0.5" /></div></td>
                                <td className="px-4 py-3 align-middle font-medium text-white whitespace-nowrap">{toTitleCase(o.country)}</td>
                                <td className="px-4 py-3 align-middle font-medium text-white whitespace-normal">{o.title}</td>
                                <td className="px-4 py-3 align-middle whitespace-nowrap">
                                  <RetailerLogo name={o.retailer} />
                                </td>
                                <td className="px-4 py-3 align-middle text-right text-gray-400 whitespace-nowrap">{o.original > 0 ? `${currencySymbol} ${o.original}` : '-'}</td>
                                <td className="px-4 py-3 align-middle text-right font-bold text-green-400 whitespace-nowrap">{currencySymbol} {o.price}</td>
                                <td className="px-4 py-3 align-middle text-gray-300 whitespace-nowrap">{o.packSize}</td>
                                <td className="px-4 py-3 align-middle text-gray-300 whitespace-nowrap">{toTitleCase(o.productType)}</td>
                                <td className="px-4 py-3 align-middle text-gray-300 whitespace-nowrap">{o.brand}</td>
                                <td className="px-4 py-3 align-middle text-xs text-gray-400 leading-tight whitespace-normal">{formatOfferTimeline(o.startDate, o.endDate, o.valid)}</td>
                                <td className="px-4 py-3 align-middle text-gray-400 whitespace-nowrap">Special Offer</td>
                                <td className="px-4 py-3 align-middle text-gray-400 text-center">-</td>
                                <td className="px-4 py-3 align-middle text-xs font-mono text-gray-400">IMG_00{o.id}</td>
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => { setDetailOffer(o); setDetailOpen(true); }} className="rounded bg-white text-black px-2 py-1 text-xs font-medium hover:bg-gray-200 transition-colors">View</button>
                                    <button onClick={() => toggleFavorite(o)} className="text-gray-400 hover:text-red-500 transition-colors"><Heart className={`h-4 w-4 ${isSaved ? "fill-red-500 text-red-500" : ""}`} /></button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {paginatedResults.map((o) => {
                        const isInCompareList = compareList.some(item => item.id === o.id);
                        const isSaved = savedOffers.some(item => item.id === o.id);
                        return (
                          <div key={o.id} className="rounded-lg border border-white/10 bg-zinc-900/60 backdrop-blur-md overflow-hidden shadow-lg flex flex-col h-full transition-all duration-300 hover:border-purple-500/50 hover:shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:-translate-y-0.5 group/card">
                            <div className="relative h-56 bg-white/5 flex items-center justify-center p-0">
                              <img src={o.image || '/placeholder.svg'} alt={o.title} className="h-full w-full object-contain transition-transform duration-300 group-hover/card:scale-105" />
                              <button aria-label="select for compare" onClick={() => { if (isInCompareList) { removeFromCompare(o.id); } else { addToCompare(o); } }} className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white z-20">
                                {isInCompareList ? <CheckCircle className="h-4 w-4" /> : <span className="block h-3 w-3 rounded-full bg-white/50" />}
                              </button>
                              {o.discount > 0 && (
                                <span className="absolute right-2 top-2 rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-md uppercase tracking-wider z-20">
                                  {o.discount}% OFF
                                </span>
                              )}
                              {/* RETAILER LOGO OVERLAY ON BOTTOM-RIGHT */}
                              <div className="absolute right-2.5 bottom-2.5 z-20">
                                <RetailerLogo name={o.retailer} size="large" />
                              </div>
                            </div>
                            <div className="p-4 flex flex-col flex-1">
                              <div className="flex items-start justify-between gap-2 h-10 mb-2">
                                <p className="text-sm font-semibold leading-tight text-white line-clamp-2" title={o.title}>{o.title}</p>
                                <button className={`hover:text-red-500 transition-all duration-200 hover:scale-110 flex-shrink-0 ${isSaved ? "text-red-500" : "text-zinc-400"}`} aria-label="wishlist" onClick={() => toggleFavorite(o)}>
                                  <Heart className={`h-4 w-4 ${isSaved ? "fill-red-500 text-red-500 animate-pulse" : ""}`} />
                                </button>
                              </div>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-base font-bold text-white">{currencySymbol} {o.price}</span>
                                {o.original > o.price && (<span className="text-xs text-zinc-500 line-through">{currencySymbol} {o.original}</span>)}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-auto mb-4">
                                <span className="text-xs font-semibold text-zinc-400 truncate max-w-[120px]">{o.retailer}</span>
                                <span className="text-zinc-200 font-bold font-mono text-[11px] whitespace-nowrap shrink-0 text-right">{formatOfferTimeline(o.startDate, o.endDate, o.valid)}</span>
                              </div>
                              <div>
                                <button onClick={() => { setDetailOffer(o); setDetailOpen(true); }} className="h-8 w-full rounded-md bg-zinc-800 hover:bg-gradient-to-r hover:from-purple-600 hover:to-orange-500 text-white hover:text-white border border-white/10 hover:border-transparent transition-all duration-300 text-xs font-medium shadow-md">
                                  View Deal
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1">
                      {/* First Page Button */}
                      <button 
                        className="h-8 w-8 rounded-md border border-white/30 bg-transparent text-gray-200 hover:bg-white/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={() => setPage(1)} 
                        aria-label="First" 
                        disabled={page === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>

                      {/* Prev Page Button */}
                      <button 
                        className="h-8 w-8 rounded-md border border-white/30 bg-transparent text-gray-200 hover:bg-white/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={() => setPage((p) => Math.max(1, p - 1))} 
                        aria-label="Prev" 
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      {/* Page Range Buttons */}
                      {paginationRange.map((n, index) => {
                        if (typeof n === 'string') {
                          return <span key={`ellip-${index}`} className="px-2 text-sm text-gray-400">…</span>;
                        }
                        return (
                          <button 
                            key={n} 
                            onClick={() => setPage(n)} 
                            className={`h-8 min-w-[32px] px-1.5 rounded-md border text-sm ${page === n ? "bg-white text-black border-white" : "bg-transparent text-gray-200 border-white/30 hover:bg-white/10"}`}
                          >
                            {n}
                          </button>
                        );
                      })}

                      {/* Next Page Button */}
                      <button 
                        className="h-8 w-8 rounded-md border border-white/30 bg-transparent text-gray-200 hover:bg-white/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))} 
                        aria-label="Next" 
                        disabled={page === totalPages || totalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>

                      {/* Last Page Button */}
                      <button 
                        className="h-8 w-8 rounded-md border border-white/30 bg-transparent text-gray-200 hover:bg-white/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={() => setPage(totalPages)} 
                        aria-label="Last" 
                        disabled={page === totalPages || totalPages === 0}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </main>
              )}
            </div>
          </div>

          {/* Save Filter / Saved Offers / Saved Filters are available regardless of
              whether filters have been applied yet — only Compare needs applied offers. */}
          <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
            <DialogContent className="sm:max-w-[425px] bg-zinc-900/90 backdrop-blur-md text-zinc-200">
              <DialogHeader><DialogTitle>Save Filter</DialogTitle><DialogDescription className="text-zinc-400">Give this filter a name.</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name" className="text-right text-zinc-400">Name</Label><Input id="name" value={filterName} onChange={(e) => setFilterName(e.target.value)} className="col-span-3 bg-zinc-800 border-zinc-600" placeholder="Filter Name" /></div>
                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="description" className="text-right text-zinc-400">Description</Label><Textarea id="description" value={filterDescription} onChange={(e) => setFilterDescription(e.target.value)} className="col-span-3 bg-zinc-800 border-zinc-600" placeholder="Description" /></div>
              </div>
              <DialogFooter><button onClick={() => setIsSaveDialogOpen(false)} className="h-9 px-4 rounded-md border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">Cancel</button><button onClick={handleSaveFilter} className="h-9 px-4 rounded-md font-medium text-black bg-white hover:bg-gray-200">Save Filter</button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={savedDialogOpen} onOpenChange={setSavedDialogOpen}>
            <DialogContent className="sm:max-w-[600px] bg-zinc-900/90 backdrop-blur-md text-zinc-200 max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-white">Saved Offers</DialogTitle></DialogHeader>
              <div className="mt-4 space-y-4">
                {savedOffers.length === 0 ? (<div className="text-center text-zinc-400 py-8">No saved offers yet.</div>) : (savedOffers.map((o) => (
                  <div key={o.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-zinc-700">
                    <img src={o.image} alt={o.title} className="h-16 w-16 object-contain bg-white rounded" />
                    <div className="flex-1 min-w-0"><h4 className="text-white font-medium truncate">{o.title}</h4><div className="flex items-center gap-2 text-sm"><span className="text-purple-400 font-bold">{currencySymbol} {o.price}</span></div></div>
                    <button onClick={() => { setDetailOffer(o); setDetailOpen(true); setSavedDialogOpen(false); }} className="px-3 py-1.5 text-xs bg-white text-black rounded hover:bg-gray-200">View</button>
                    <button onClick={() => toggleFavorite(o)} aria-label="Remove from saved offers" className="p-2 text-red-500 hover:bg-white/10 rounded" title="Unlike">
                      <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                    </button>
                  </div>
                )))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={savedFiltersDialogOpen} onOpenChange={setSavedFiltersDialogOpen}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-900/90 backdrop-blur-md text-zinc-200 max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-white">Saved Filters</DialogTitle></DialogHeader>
              <div className="mt-4 space-y-3">
                {savedFilters.length === 0 ? (<div className="text-center text-zinc-400 py-8">No saved filters found.</div>) : (savedFilters.map((f) => (
                  <div key={f.id} className="group flex items-center justify-between p-3 rounded-lg bg-white/5 border border-zinc-700 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => handleApplySavedFilter(f)}>
                    <div><h4 className="text-white font-medium">{f.name}</h4><p className="text-[10px] text-zinc-500 mt-1">{format(f.timestamp, "MMM dd, yyyy")}</p></div>
                    <button onClick={(e) => { e.stopPropagation(); deleteSavedFilter(f.id); }} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-white/5 rounded"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )))}
              </div>
            </DialogContent>
          </Dialog>

          {applied && (
            <>
              {/* Compare Button */}
              <button onClick={handleCompareClick} className="fixed bottom-8 right-8 z-50 flex items-center justify-center gap-2 h-14 w-40 rounded-full bg-gradient-to-r from-purple-500 to-orange-500 text-white font-bold shadow-lg transition-transform duration-200 ease-in-out hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                <span>Compare</span>
                {compareList.length > 0 && (<span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm">{compareList.length}</span>)}
              </button>

              <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
                <DialogContent className="p-6 w-[95vw] max-w-[1000px] bg-zinc-900/95 backdrop-blur-md text-zinc-200 rounded-xl max-h-[90vh] overflow-y-auto">
                  <DialogTitle className="text-xl font-bold text-white tracking-tight">Product Comparison</DialogTitle>
                  <div className="overflow-hidden mt-1">
                    <p className="text-xs text-zinc-400 mb-4">Compare products side by side to find the best deals</p>
                    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/20">
                      {compareList.length === 0 ? (
                        <div className="p-10 text-center text-zinc-500 font-medium">No products selected for comparison</div>
                      ) : (
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-950/40 align-middle w-40 min-w-[160px]">
                                Attributes
                              </th>
                              {compareList.map((p, idx) => (
                                <th 
                                  key={p.id} 
                                  className={`p-4 text-center align-top bg-zinc-900/30 min-w-[220px] w-72 ${
                                    idx === compareList.length - 1 ? "" : "border-r border-zinc-800/40"
                                  }`}
                                >
                                  <div className="relative h-28 w-36 mx-auto bg-white p-2.5 rounded-lg border border-zinc-700 shadow-md flex items-center justify-center mb-3 transition-transform hover:scale-[1.03]">
                                    <img 
                                      src={p.image || '/placeholder.svg'} 
                                      alt={p.title} 
                                      className="max-h-full max-w-full object-contain" 
                                    />
                                  </div>
                                  <div className="font-bold text-xs text-white line-clamp-2 max-w-[220px] mx-auto leading-normal">
                                    {p.title}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["Retailer", (p: any) => <div className="flex justify-center"><RetailerLogo name={p.retailer} /></div>],
                              ["Brand", (p: any) => p.brand || "N/A"],
                              ["Product Type", (p: any) => toTitleCase(p.productType) || "N/A"],
                              ["Category", (p: any) => toTitleCase(p.category) || "N/A"],
                              ["Pack Size", (p: any) => p.packSize || "N/A"],
                              ["Promo Price", (p: any) => `${getCurrency(p.country)} ${p.price}`],
                              ["Regular Price", (p: any) => p.original > 0 ? `${getCurrency(p.country)} ${p.original}` : "N/A"],
                              ["Discount", (p: any) => p.discount > 0 ? `${p.discount}% OFF` : "None"],
                              ["Validity", (p: any) => formatOfferTimeline(p.startDate, p.endDate, p.valid)],
                              ["Country", (p: any) => toTitleCase(p.country) || "N/A"]
                            ].map(([label, fn]: any) => (
                              <tr key={label} className="border-t border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                                <td className="p-3.5 font-semibold text-xs text-zinc-400 bg-zinc-950/40 border-r border-zinc-800 align-middle">
                                  {label}
                                </td>
                                {compareList.map((p, idx) => (
                                  <td 
                                    key={p.id + label} 
                                    className={`p-3.5 text-center text-sm text-zinc-300 align-middle ${
                                      idx === compareList.length - 1 ? "" : "border-r border-zinc-800/40"
                                    }`}
                                  >
                                    {typeof fn === 'function' ? fn(p) : fn}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr className="border-t border-zinc-800 bg-zinc-950/10">
                              <td className="p-3.5 bg-zinc-950/40 border-r border-zinc-800"></td>
                              {compareList.map((p, idx) => (
                                <td 
                                  key={p.id + 'remove'} 
                                  className={`p-3.5 text-center ${
                                    idx === compareList.length - 1 ? "" : "border-r border-zinc-800/40"
                                  }`}
                                >
                                  <button 
                                    onClick={() => removeFromCompare(p.id)} 
                                    className="inline-flex items-center justify-center h-8 px-4 rounded-md font-semibold text-xs text-red-400 bg-red-950/20 border border-red-900/40 hover:bg-red-900/35 hover:border-red-800 transition-all duration-200"
                                  >
                                    Remove
                                  </button>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="mt-5 flex items-center justify-end">
                      <button 
                        onClick={() => setCompareOpen(false)} 
                        className="h-9 px-5 rounded-md font-semibold text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-all duration-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </section>

      {/* --- MOVED OFFER DETAIL DIALOG HERE TO ENSURE IT ALWAYS RENDERS --- */}
      <OfferDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        offer={detailOffer}
        currency={currencySymbol}
        onAddToCompare={() => detailOffer && addToCompare(detailOffer)}
        onOpenFlyer={() => {
          if (detailOffer) {
            setFlyerOffer(detailOffer);
            setFlyerOpen(true);
          }
        }}
        isSaved={detailOffer ? savedOffers.some(s => s.id === detailOffer.id) : false}
        onToggleSave={() => detailOffer && toggleFavorite(detailOffer)}
      />

      <FlyerDialog
        open={flyerOpen}
        onOpenChange={setFlyerOpen}
        offer={flyerOffer}
      />

      {/* Mobile filter panel drawer */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end md:hidden">
          {/* Overlay background */}
          <div onClick={() => setIsMobileFilterOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
          {/* Drawer content panel */}
          <div className="relative w-80 max-w-full bg-zinc-950 border-l border-white/10 p-6 overflow-y-auto flex flex-col h-full z-10 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white">Filters</h3>
              <button onClick={() => setIsMobileFilterOpen(false)} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6">
              {renderAsideContent()}
            </div>
          </div>
        </div>
      )}

    </div>
    );
}

function OfferDetailDialog({
  open,
  onOpenChange,
  offer,
  currency,
  onAddToCompare,
  onOpenFlyer,
  isSaved,
  onToggleSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
  currency: string;
  onAddToCompare: () => void;
  onOpenFlyer: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open && offer && user) {
      const fetchNote = async () => {
        try {
          const { data, error } = await supabase
            .from('user_offer_notes')
            .select('note')
            .eq('user_id', user.id)
            .eq('offer_id', parseInt(offer.id, 10))
            .maybeSingle();

          if (!error && data) {
            setNote(data.note);
          } else {
            setNote("");
          }
        } catch (err) {
          console.error("Failed to fetch offer note:", err);
          setNote("");
        }
      };
      fetchNote();
    } else {
      setNote("");
    }
  }, [open, offer, user]);

  const handleSaveNote = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save notes.",
        variant: "destructive"
      });
      return;
    }

    try {
      if (!note.trim()) {
        const { error } = await supabase
          .from('user_offer_notes')
          .delete()
          .eq('user_id', user.id)
          .eq('offer_id', parseInt(offer.id, 10));

        if (error) throw error;
        toast({ title: "Note cleared!" });
      } else {
        const { error } = await supabase
          .from('user_offer_notes')
          .upsert({
            user_id: user.id,
            offer_id: parseInt(offer.id, 10),
            note: note.trim(),
            updated_at: new Date()
          }, {
            onConflict: 'user_id,offer_id'
          });

        if (error) throw error;
        toast({ title: "Note saved!" });
      }
    } catch (err: any) {
      console.error("Failed to save note:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save note.",
        variant: "destructive"
      });
    }
  };

  if (!offer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden w-[95vw] max-w-[900px] bg-zinc-950 text-zinc-200 rounded-lg [&>button]:z-20 [&>button]:top-2">
        <DialogTitle className="sr-only">Offer details</DialogTitle>

        {/* Top banner matching Sharjah Coop Eid Mubarak Offers */}
        <div className="bg-gradient-to-r from-purple-600 to-orange-500 px-6 py-4 flex items-center justify-between border-b border-white/10 relative">
          <h2 className="text-base font-bold text-white leading-none pr-12">
            {formatRetailerName(offer.retailer)} Offers
          </h2>
        </div>

        {/* Centered Validity dates under banner */}
        <div className="text-center py-2 bg-zinc-900/40 border-b border-white/5">
          <span className="text-zinc-400 font-semibold font-mono text-[11px] uppercase tracking-wider">
            Valid {formatOfferTimeline(offer.startDate, offer.endDate, offer.valid)}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col md:flex-row gap-6 max-h-[70vh] overflow-y-auto">
          
          {/* Left Column: Image wrapper with white background */}
          <div className="md:w-1/3 bg-white p-4 flex items-center justify-center rounded-lg border border-white/5 shadow-md shrink-0">
            <img src={offer.image || '/placeholder.svg'} alt={offer.title} className="max-h-64 object-contain" />
          </div>

          {/* Right Column: Tailored information */}
          <div className="md:w-2/3 space-y-4 flex flex-col justify-between">
            
            {/* Title + Prices Box */}
            <div className="border border-white/10 bg-white/5 p-4 rounded-lg space-y-3">
              <h3 className="text-lg font-bold text-white leading-tight">{offer.title}</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-extrabold text-white">{currency} {offer.price}</span>
                  {offer.original > offer.price && (
                    <span className="text-sm text-zinc-500 line-through">{currency} {offer.original}</span>
                  )}
                </div>
                {offer.discount > 0 && (
                  <span className="bg-red-600 text-white text-[11px] font-bold px-3 py-1 rounded-md shadow-sm uppercase tracking-wider">
                    {offer.discount}% OFF
                  </span>
                )}
              </div>
            </div>

            {/* Grid/Table layout styled exactly like the reference image */}
            <div className="rounded-lg border border-white/10 overflow-hidden divide-y divide-white/10 text-sm">
              {[
                ["Retailer", formatRetailerName(offer.retailer)],
                ["Brand", offer.brand || "N/A"],
                ["Product", toTitleCase(offer.productType) || "N/A"],
                ["Pack Size", offer.packSize || "N/A"],
                ["Offer Mechanic", "Weekly Special"]
              ].map(([label, val]) => (
                <div key={label} className="flex">
                  <div className="w-1/3 bg-white/5 px-4 py-2.5 font-semibold text-zinc-300 border-r border-white/10 shrink-0">
                    {label}
                  </div>
                  <div className="flex-1 px-4 py-2.5 text-white font-medium">
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onToggleSave}
                className={`flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-xs font-semibold shadow-sm transition-all duration-200 ${
                  isSaved
                    ? "bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30"
                    : "bg-white/5 border-white/20 text-zinc-200 hover:bg-white/10 hover:border-white/30"
                }`}
              >
                <Heart className={`h-4 w-4 ${isSaved ? "fill-red-500" : ""}`} />
                {isSaved ? "Saved" : "Add to Saved Offers"}
              </button>

              <button
                onClick={onOpenFlyer}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-md border border-purple-500/50 bg-purple-500/10 text-purple-300 px-4 py-2 text-xs font-semibold hover:bg-purple-500/20 shadow-sm transition-all duration-200"
              >
                <ExternalLink className="h-4 w-4" /> Flyer Page
              </button>

              <button
                onClick={onAddToCompare}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-md border border-white/20 bg-white/5 text-zinc-200 px-4 py-2 text-xs font-semibold hover:bg-white/10 shadow-sm transition-all duration-200"
              >
                Compare
              </button>
            </div>

            {/* Notes Section */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Notes</label>
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="flex-1 rounded-md border border-white/10 bg-zinc-950 text-white text-xs px-3 py-2 outline-none focus:border-purple-500 transition-colors"
                  placeholder="Enter your note"
                />
                <button
                  onClick={handleSaveNote}
                  className="rounded-md bg-gradient-to-r from-purple-600 to-orange-500 text-white px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity shrink-0"
                >
                  Add/Update
                </button>
              </div>
            </div>

          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

const parseFlyerUrl = (imagePath: string | null | undefined) => {
  if (!imagePath || !imagePath.startsWith("http")) return null;
  const match = imagePath.match(/(.+?)\/flyer-products\/(flyer_\d+)\//i);
  if (!match) return null;
  const baseUrl = match[1];
  const flyerName = match[2]; // e.g. "flyer_10"
  const pageMatch = flyerName.match(/flyer_(\d+)/i);
  const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
  return { baseUrl, pageNum };
};

function FlyerDialog({
  open,
  onOpenChange,
  offer
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
}) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [totalPagesCount, setTotalPagesCount] = useState<number | null>(null);
  const { toast } = useToast();

  const parsed = useMemo(() => {
    if (!offer) return null;
    return parseFlyerUrl(offer.image);
  }, [offer]);

  useEffect(() => {
    if (open && parsed) {
      setCurrentPage(parsed.pageNum);
      setHasReachedEnd(false);
      setImgError(false);
      setImgLoading(true);
      setTotalPagesCount(null);

      const fetchTotalPages = async () => {
        try {
          const { data, error } = await supabase
            .from('flyer_products')
            .select('flyer_url, image_path')
            .like('image_path', `${parsed.baseUrl}/flyer-products/%`);
          
          if (!error && data) {
            let maxPage = 0;
            data.forEach(p => {
              let pageNum = 0;
              if (p.flyer_url) {
                const match = p.flyer_url.match(/flyer_(\d+)\.jpg/i);
                if (match) pageNum = parseInt(match[1], 10);
              }
              if (!pageNum && p.image_path) {
                const match = p.image_path.match(/\/flyer-products\/flyer_(\d+)\//i);
                if (match) pageNum = parseInt(match[1], 10);
              }
              if (pageNum > maxPage) maxPage = pageNum;
            });
            if (maxPage > 0) {
              setTotalPagesCount(maxPage);
            }
          }
        } catch (err) {
          console.error("Error fetching total pages:", err);
        }
      };
      fetchTotalPages();
    }
  }, [open, parsed]);

  if (!offer || !parsed) return null;

  // Construct flyer S3 URL for currentPage
  const flyerUrl = `${parsed.baseUrl}/FLYERS/flyer_${currentPage}.jpg`;

  const handlePrev = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      setHasReachedEnd(false);
      setImgError(false);
      setImgLoading(true);
    }
  };

  const handleNext = () => {
    if (totalPagesCount && currentPage >= totalPagesCount) {
      setHasReachedEnd(true);
      toast({
        title: "End of Flyer",
        description: "You have reached the last page of this flyer.",
      });
      return;
    }
    if (!hasReachedEnd) {
      setCurrentPage(prev => prev + 1);
      setImgError(false);
      setImgLoading(true);
    }
  };

  const handleImageError = () => {
    // If we tried to go Next and it failed, we hit the end
    if (currentPage > parsed.pageNum) {
      setCurrentPage(prev => prev - 1);
      setHasReachedEnd(true);
      setImgLoading(false);
      toast({
        title: "End of Flyer",
        description: "You have reached the last page of this flyer.",
      });
    } else {
      setImgError(true);
      setImgLoading(false);
    }
  };

  // Title formatting: "Sharjah Coop Eid Mubarak Offers (27/3 - 6/4)"
  const retailer = formatRetailerName(offer.retailer);
  const campaign = offer.offerName 
    ? offer.offerName.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : "Special Offers";
  
  const compactDates = formatOfferTimelineCompact(offer.startDate, offer.endDate, offer.valid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden w-[95vw] max-w-[800px] bg-zinc-950 text-zinc-200 rounded-lg flex flex-col max-h-[90vh] [&>button]:z-20 [&>button]:top-2">
        <DialogTitle className="sr-only">Flyer Viewer</DialogTitle>
        
        {/* Header - Matching layout with close button */}
        <div className="bg-gradient-to-r from-purple-600 to-orange-500 px-6 py-4 flex items-center justify-between border-b border-white/10 shrink-0 relative pr-12">
          <h2 className="text-base font-bold text-white leading-none truncate">
            {retailer} {campaign} {compactDates ? `(${compactDates})` : ""}
          </h2>
        </div>

        {/* Image content container */}
        <div className="p-4 bg-zinc-950 flex-1 flex items-center justify-center relative min-h-[400px] overflow-hidden">
          {imgLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
                <span className="text-xs text-zinc-400">Loading flyer page...</span>
              </div>
            </div>
          )}

          {imgError ? (
            <div className="text-center py-12 text-zinc-400">
              <p>Flyer image could not be loaded.</p>
            </div>
          ) : (
            <img
              src={flyerUrl}
              alt={`Page ${currentPage}`}
              className="max-h-[60vh] object-contain rounded border border-white/10 shadow-lg select-none"
              onLoad={() => setImgLoading(false)}
              onError={handleImageError}
            />
          )}
        </div>

        {/* Footer Bar - matching the user mockup */}
        <div className="bg-zinc-950 border-t border-white/10 px-6 py-4 flex items-center justify-between text-sm shrink-0">
          <div className="text-zinc-400 font-semibold font-mono">
            Page {currentPage} {totalPagesCount ? `of ${totalPagesCount}` : ""}
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={handlePrev}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 font-semibold text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              &lt; Prev
            </button>
            <button
              onClick={handleNext}
              disabled={hasReachedEnd || (totalPagesCount !== null && currentPage >= totalPagesCount)}
              className="inline-flex items-center gap-1 font-semibold text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next &gt;
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}