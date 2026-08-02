export const staticCountries = ["Qatar", "Kuwait", "Oman", "Saudi Arabia", "United Arab Emirates"];

export const regionsMap: Record<string, string[]> = {
  "Qatar": ["Doha", "Al Rayyan", "Al Wakra", "Al Khor", "Al Shamal", "Al-Shahaniya", "Umm Salal", "Al Daayen"],
  "Oman": ["Muscat", "Salalah", "Sohar", "Ibri", "Nizwa"],
  "Kuwait": ["Kuwait City", "Ahmadi Governorate", "Jahra Governorate"],
  "Saudi Arabia": [
    "Dammam", "Jeddah", "Riyadh", "Hafar Al Batin", "Hail", "Al Hasa", "Jubail", "Al Khobar", "Mecca", "Medina",
    "Ta'if", "Buraidah", "Tabuk", "Khamis Mushait", "Al-Kharj", "Abha", "Najran", "Yanbu", "Jazan", "Sakaka",
    "Arar", "Al Bahah", "Rafha", "Qatif", "Ar Rass", "Unayzah", "Bishah", "Al Duwadimi", "Al Majmaah",
    "Mahayil", "Ras Tanura", "Khafji", "Saihat", "Al Qunfudhah", "Az Zulfi", "Wadi ad Dawasir"
  ],
  "United Arab Emirates": [
    "Dubai", "Abu Dhabi", "Sharjah / Ajman", "Al Ain", "Fujairah", "Ras al Khaimah", "Umm al Quwain"
  ]
};

export const currencyMap: Record<string, string> = {
  "Qatar": "QAR",
  "Kuwait": "KWD",
  "Oman": "OMR",
  "Saudi Arabia": "SAR",
  "United Arab Emirates": "AED"
};

export const getRegionsForCountry = (countryName: string | null): string[] => {
  if (!countryName) return [];
  return regionsMap[countryName] || [];
};

// Country arrives either from the UI dropdowns ("Saudi Arabia") or straight
// from flyer_products, which stores it lowercased ("saudi arabia") and uses
// "uae" for the Emirates. Match case-insensitively so both resolve.
const currencyByLowerName: Record<string, string> = {
  ...Object.fromEntries(Object.entries(currencyMap).map(([k, v]) => [k.toLowerCase(), v])),
  uae: "AED",
  ksa: "SAR",
};

export const getCurrency = (countryName: string | null | undefined): string => {
  if (!countryName) return "";
  return currencyByLowerName[countryName.trim().toLowerCase()] || "";
};

// Data arrives lowercased from the source flyers ("saudi arabia", "chicken liver");
// display it capitalised without touching the stored value.
export const toTitleCase = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

export const sameStringArray =(a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const splitRegionValues = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(/[;,|]/g)
    .map((v) => v.trim())
    .filter(Boolean);
};

export const normalizeSingleValue = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

export const normalizeMultiSelectForRpc = (selected: string[], options: string[]): string[] | null => {
  const safeSelected = Array.isArray(selected) ? selected : [];
  if (safeSelected.length === 0) return null;
  const normalizedSelected = Array.from(new Set(safeSelected.map((v) => v.trim()).filter(Boolean)));
  if (normalizedSelected.length === 0) return null;

  const safeOptions = Array.isArray(options) ? options : [];
  const normalizedOptions = Array.from(new Set(safeOptions.map((v) => v.trim()).filter(Boolean)));
  if (normalizedOptions.length > 0 && normalizedSelected.length >= normalizedOptions.length) {
    return null;
  }
  return normalizedSelected;
};

export const tryParseDate = (text: string): Date | null => {
  if (!text) return null;
  
  // Try parsing textual months (e.g. "May 24, 2026")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (const m of months) {
    if (text.includes(m)) {
      const maybe = new Date(text);
      if (!isNaN(maybe.getTime())) return maybe;
    }
  }

  // Handle DD/MM/YYYY and MM/DD/YYYY variations (bounded by word boundaries to avoid matching ISO dates like 2026-05-24 suffix)
  const nums = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (nums) {
    const val1 = parseInt(nums[1], 10);
    const val2 = parseInt(nums[2], 10);
    const year = parseInt(nums[3], 10);
    
    // Construct year properly if it's 2 digits
    const fullYear = year < 100 ? (year > 50 ? 1900 + year : 2000 + year) : year;

    if (val1 > 12 && val2 <= 12) {
      // It's DD/MM/YYYY
      const dd = new Date(fullYear, val2 - 1, val1);
      if (!isNaN(dd.getTime())) return dd;
    } else if (val2 > 12 && val1 <= 12) {
      // It's MM/DD/YYYY
      const dd = new Date(fullYear, val1 - 1, val2);
      if (!isNaN(dd.getTime())) return dd;
    } else {
      // Fallback: try both or default
      const dd1 = new Date(text);
      if (!isNaN(dd1.getTime())) return dd1;

      const dd2 = new Date(fullYear, val2 - 1, val1);
      if (!isNaN(dd2.getTime())) return dd2;
    }
  }

  // Standard constructor fallback
  const d = new Date(text);
  if (!isNaN(d.getTime())) return d;

  return null;
};

export const parseValidRange = (valid: string): { from: Date; to: Date } | null => {
  if (!valid) return null;
  const sep = valid.includes("-") ? "-" : valid.includes("–") ? "–" : null;
  if (!sep) return null;
  const parts = valid.split(sep).map((p) => p.trim());
  if (parts.length < 2) return null;

  // Align years before trying to parse to avoid defaulting issues
  const yearMatch0 = parts[0].match(/\b\d{4}\b/);
  const yearMatch1 = parts[1].match(/\b\d{4}\b/);

  let part0 = parts[0];
  let part1 = parts[1];

  if (!yearMatch0 && yearMatch1) {
    part0 = parts[0] + ", " + yearMatch1[0];
  } else if (yearMatch0 && !yearMatch1) {
    part1 = parts[1] + ", " + yearMatch0[0];
  }

  const a = tryParseDate(part0);
  const b = tryParseDate(part1);
  if (a && b) return { from: a, to: b };

  return null;
};

export const parsePrice = (priceValue: string | number | null | undefined): number | null => {
  if (priceValue === null || priceValue === undefined) return null;
  if (typeof priceValue === 'number') return priceValue;

  const trimmedPrice = String(priceValue).trim();
  if (trimmedPrice === "" || trimmedPrice.toUpperCase() === "EMPTY" || trimmedPrice.toUpperCase() === "N/A") {
    return null;
  }

  if (trimmedPrice.includes('/')) {
    const parts = trimmedPrice.split('/');
    const part = parts[0];
    const num = parseFloat(part.replace(/[^\d.]/g, ''));
    return isNaN(num) ? null : num;
  }

  const num = parseFloat(trimmedPrice.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num; 
};
