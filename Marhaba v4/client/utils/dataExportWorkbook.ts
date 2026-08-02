import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

// Data Export writes a real PivotTable workbook by reusing the client's own
// data_pivot file as a template (public/pivot-template.xlsx): its five pivots
// — Leaflet Share / DOP / Price Per KG / Price Per SKU / Price Per Pack — are
// already defined there, so we only swap the `fulldata` sheet and mark the
// pivot cache dirty. Excel rebuilds the pivots on open.
//
// Generating pivots from scratch is not an option: SheetJS community edition
// neither writes nor preserves pivot parts.

export interface ExportRow {
  country?: string | null;
  coverage_regions?: string | null;
  mart_name?: string | null;
  offer_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  category?: string | null;
  type?: string | null;
  brand?: string | null;
  product_name?: string | null;
  regular_price?: string | number | null;
  discounted_price?: string | number | null;
  weight_quantity?: string | null;
  image_path?: string | null;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const first = String(v).split("/")[0];
  const n = parseFloat(first.replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
};

/** "750 gm" -> 0.75, "2.5 kg" -> 2.5, "4 x 200 gm" -> 0.8. Returns kg/litre. */
export const weightInKg = (weightStr: string | null | undefined): number => {
  if (!weightStr) return 0;
  const lower = String(weightStr).toLowerCase().replace(/\s/g, "");
  let multiplier = 1;
  let unitPart = lower;
  if (lower.includes("x")) {
    const parts = lower.split("x");
    const m = parseFloat(parts[0]);
    if (!isNaN(m)) multiplier = m;
    unitPart = parts[1] || "";
  }
  const value = parseFloat(unitPart.replace(/[^\d.]/g, ""));
  if (isNaN(value)) return 0;
  if (unitPart.includes("kg") || unitPart.includes("ltr") || unitPart.includes("liter")) {
    return value * multiplier;
  }
  if (unitPart.includes("g") || unitPart.includes("ml")) return (value / 1000) * multiplier;
  return 0;
};

const effectiveDate = (r: ExportRow): Date | null => {
  const raw = r.end_date || r.start_date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Column order of the `fulldata` sheet. The first 15 are the template's pivot
 * cache fields, in cache order — the cache source range covers exactly A:O, so
 * the two columns appended after them stay out of the pivots.
 */
export const FULLDATA_COLUMNS = [
  "country",
  "retailer",
  "flyer_year",
  "mymonth",
  "segment",
  "sub_segment",
  "brand",
  "Variant",
  "retailer_desc",
  "price",
  "pricperkg",
  "discounted_from",
  "discount_percentage",
  "base_size",
  "image_location",
  "City/Emirates",
  "Flyer Theme",
] as const;

const CACHE_FIELD_COUNT = 15; // A:O — must match the template's cacheFields.

/** One `fulldata` row, keyed by FULLDATA_COLUMNS. */
export const toFullDataRow = (r: ExportRow): Record<string, string | number> => {
  const d = effectiveDate(r);
  const promo = num(r.discounted_price);
  const regular = num(r.regular_price);
  const kg = weightInKg(r.weight_quantity);
  return {
    country: r.country ?? "",
    retailer: r.mart_name ?? "",
    flyer_year: d ? d.getFullYear() : "",
    mymonth: d ? d.getMonth() + 1 : "",
    segment: r.category ?? "",
    sub_segment: r.type ?? "",
    brand: r.brand ?? "",
    Variant: "",
    retailer_desc: r.product_name ?? "",
    price: promo || "",
    pricperkg: kg > 0 && promo > 0 ? Number((promo / kg).toFixed(4)) : "",
    discounted_from: regular || "",
    // Both prices must be present — a missing promo price is not a 100% discount.
    discount_percentage:
      promo > 0 && regular > promo ? Number((((regular - promo) / regular) * 100).toFixed(2)) : "",
    base_size: r.weight_quantity ?? "",
    image_location: r.image_path ?? "",
    "City/Emirates": r.coverage_regions ?? "",
    "Flyer Theme": r.offer_name ?? "",
  };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
const colName = (i: number): string => {
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const cell = (ref: string, value: string | number): string => {
  if (value === "") return "";
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
};

const IMAGE_COLUMN = FULLDATA_COLUMNS.indexOf("image_location");

/**
 * Rebuilds `xl/worksheets/sheet1.xml` (the `fulldata` sheet) from scratch, plus
 * its relationship part — image URLs are written as real Excel hyperlinks, which
 * live in the sheet's rels rather than the cell.
 *
 * Inline strings keep us out of the workbook's shared string table, which the
 * pivot result sheets still index into.
 */
export const buildFullDataSheet = (
  rows: Record<string, string | number>[],
): { xml: string; rels: string } => {
  const last = colName(FULLDATA_COLUMNS.length - 1);
  const header = FULLDATA_COLUMNS.map((c, i) => cell(`${colName(i)}1`, c)).join("");
  const links: { ref: string; target: string }[] = [];
  const body = rows
    .map((row, r) => {
      const n = r + 2;
      const image = row.image_location;
      if (typeof image === "string" && /^https?:\/\//i.test(image)) {
        links.push({ ref: `${colName(IMAGE_COLUMN)}${n}`, target: image });
      }
      const cells = FULLDATA_COLUMNS.map((c, i) => cell(`${colName(i)}${n}`, row[c] ?? "")).join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");
  const dim = `A1:${last}${rows.length + 1}`;
  const hyperlinks = links.length
    ? `<hyperlinks>${links
        .map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`)
        .join("")}</hyperlinks>`
    : "";
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="${dim}"/><sheetData><row r="1">${header}</row>${body}</sheetData>` +
    `<autoFilter ref="${dim}"/>${hyperlinks}</worksheet>`;
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    links
      .map(
        (l, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.target).replace(/"/g, "&quot;")}" TargetMode="External"/>`,
      )
      .join("") +
    "</Relationships>";
  return { xml, rels };
};

/**
 * Points the pivot cache at the new row range and marks it stale, so Excel
 * refreshes every pivot the moment the file is opened.
 */
export const patchCacheDefinition = (xml: string, rowCount: number): string =>
  xml
    .replace(
      /<worksheetSource[^>]*\/>/,
      `<worksheetSource ref="A1:${colName(CACHE_FIELD_COUNT - 1)}${rowCount + 1}" sheet="fulldata"/>`,
    )
    .replace(/ refreshOnLoad="[^"]*"/, "")
    .replace(/ recordCount="[^"]*"/, ' recordCount="0"')
    .replace("<pivotCacheDefinition ", '<pivotCacheDefinition refreshOnLoad="1" ');

const TEMPLATE_URL = "/pivot-template.xlsx";

/** Swaps `fulldata` into the pivot template and downloads the result. */
export const downloadPivotWorkbook = async (rows: ExportRow[], filename: string) => {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`Pivot template missing (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A missing asset still returns 200 here: the SPA rewrite hands back
  // index.html. Every xlsx is a zip, so check the "PK" magic number instead.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Pivot template not deployed — public/pivot-template.xlsx is missing");
  }
  const files = unzipSync(bytes);

  const fullData = rows.map(toFullDataRow);
  const sheet = buildFullDataSheet(fullData);
  files["xl/worksheets/sheet1.xml"] = strToU8(sheet.xml);
  files["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(sheet.rels);

  const cachePath = "xl/pivotCache/pivotCacheDefinition1.xml";
  files[cachePath] = strToU8(patchCacheDefinition(strFromU8(files[cachePath]), fullData.length));

  // The template's autofilter defined name still points at the old row count.
  const wbPath = "xl/workbook.xml";
  files[wbPath] = strToU8(
    strFromU8(files[wbPath]).replace(
      /fulldata!\$A\$1:\$[A-Z]+\$\d+/,
      `fulldata!$A$1:$${colName(FULLDATA_COLUMNS.length - 1)}$${fullData.length + 1}`,
    ),
  );

  const blob = new Blob([zipSync(files, { level: 6 })], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};