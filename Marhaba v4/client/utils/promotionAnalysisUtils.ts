export interface PeriodAnalysis {
  myBrandCount: number;
  competitorCount: number;
  totalCount: number;
  myBrandShare: number;
  competitorShare: number;
  brandACount?: number;
  brandBCount?: number;
  brandAShare?: number;
  brandBShare?: number;
  avgOfferPrice: { myBrand: number; competitor: number };
  avgRegularPrice: { myBrand: number; competitor: number };
  avgDiscount: { myBrand: number; competitor: number };
  avgPricePerKg: { myBrand: number; competitor: number };
}

// Extracted pure helper to get the raw number safely (never NaN/null/undefined)
export const getRawValue = (
  period: Partial<PeriodAnalysis> | undefined | null,
  priceTrendType: string,
  brand: 'myBrand' | 'competitor'
): number => {
  if (!period) return 0;
  let val: any = 0;
  switch (priceTrendType) {
    case 'offer':
      val = period.avgOfferPrice?.[brand];
      break;
    case 'regular':
      val = period.avgRegularPrice?.[brand];
      break;
    case 'discount':
      val = period.avgDiscount?.[brand];
      break;
    case 'perkg':
      val = period.avgPricePerKg?.[brand];
      break;
  }
  return typeof val === 'number' && !isNaN(val) ? val : 0;
};

// Extracted pure helper to format numbers to a standard currency or percent representation safely
export const formatValue = (
  value: number,
  priceTrendType: string,
  currentCurrency: string
): string => {
  const isPercent = priceTrendType === 'discount';
  const safeVal = typeof value === 'number' && !isNaN(value) ? value : 0;
  return isPercent ? `${safeVal.toFixed(1)}%` : `${currentCurrency} ${safeVal.toFixed(1)}`;
};

export const getPriceData = (
  period: Partial<PeriodAnalysis> | undefined | null,
  priceTrendType: string,
  brand: 'myBrand' | 'competitor',
  currentCurrency: string
): string => {
  return formatValue(getRawValue(period, priceTrendType, brand), priceTrendType, currentCurrency);
};

export const formatPriceSummary = (
  period: Partial<PeriodAnalysis> | undefined | null,
  currentCurrency: string
) => {
  const getVal = (
    obj: { myBrand: number; competitor: number } | undefined | null,
    brandKey: 'myBrand' | 'competitor'
  ): number => {
    if (!obj) return 0;
    const val = obj[brandKey];
    return typeof val === 'number' && !isNaN(val) ? val : 0;
  };

  const offerPriceMy = getVal(period?.avgOfferPrice, 'myBrand');
  const offerPriceComp = getVal(period?.avgOfferPrice, 'competitor');

  const regularPriceMy = getVal(period?.avgRegularPrice, 'myBrand');
  const regularPriceComp = getVal(period?.avgRegularPrice, 'competitor');

  const discountMy = getVal(period?.avgDiscount, 'myBrand');
  const discountComp = getVal(period?.avgDiscount, 'competitor');

  const pricePerKgMy = getVal(period?.avgPricePerKg, 'myBrand');
  const pricePerKgComp = getVal(period?.avgPricePerKg, 'competitor');

  return {
    offerPrice: {
      myBrand: `${currentCurrency} ${offerPriceMy.toFixed(1)}`,
      competitor: `${currentCurrency} ${offerPriceComp.toFixed(1)}`,
    },
    regularPrice: {
      myBrand: `${currentCurrency} ${regularPriceMy.toFixed(1)}`,
      competitor: `${currentCurrency} ${regularPriceComp.toFixed(1)}`,
    },
    discount: {
      myBrand: `${discountMy.toFixed(1)}%`,
      competitor: `${discountComp.toFixed(1)}%`,
    },
    pricePerKg: {
      myBrand: `${currentCurrency} ${pricePerKgMy.toFixed(1)}`,
      competitor: `${currentCurrency} ${pricePerKgComp.toFixed(1)}`,
    },
  };
};
