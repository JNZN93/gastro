export interface WeightEan {
  raw: string;
  itemKey: string;
  weightKg: number;
}

export interface WeightEanArticle {
  ean?: string | null;
  eans?: string[] | string | null;
  unit?: string | null;
}

/** Feste Artikelkennung. Stelle 7 wechselt je Etikett und gehört nicht dazu. */
const ARTICLE_KEY_LENGTH = 6;

/**
 * Instore-EAN mit Gewicht: 13 Stellen, Präfix 2.
 * Stellen 1–6 identifizieren den Artikel, Stelle 7 ist variabel,
 * Stellen 8–12 sind Gramm.
 * Beispiel: 2816576147951 und 2816573153702 sind derselbe Artikel.
 */
export function parseWeightEan(code: string | null | undefined): WeightEan | null {
  const trimmed = String(code ?? '').trim();
  if (!/^2\d{12}$/.test(trimmed)) {
    return null;
  }

  const grams = Number(trimmed.slice(7, 12));
  if (!Number.isInteger(grams) || grams <= 0) {
    return null;
  }

  return {
    raw: trimmed,
    itemKey: trimmed.slice(0, ARTICLE_KEY_LENGTH),
    weightKg: grams / 1000,
  };
}

export function isKgUnit(unit: string | null | undefined): boolean {
  return (unit || '').trim().toLowerCase() === 'kg';
}

/** 14.795 kg als 14,795 kg, damit der Punkt nicht wie ein Tausenderpunkt wirkt. */
export function formatQuantityLabel(quantity: number, unit?: string | null): string {
  const value = Number(quantity);
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (isKgUnit(unit) || !Number.isInteger(value)) {
    return `${value.toFixed(3).replace('.', ',')} kg`;
  }
  return `${value}×`;
}

export function eanCodesOf(article: WeightEanArticle): string[] {
  const extra = parseEanList(article.eans);
  return [article.ean, ...extra]
    .map((ean) => (ean == null ? '' : String(ean)))
    .filter((ean) => ean.trim() !== '');
}

export function normalizeEan(ean: string | null | undefined): string {
  return String(ean ?? '').replace(/\s/g, '');
}

export function storedEanMatchesWeightItem(storedEan: string | null | undefined, itemKey: string): boolean {
  const normalized = normalizeEan(storedEan);
  if (!normalized) {
    return false;
  }
  if (normalized === itemKey) {
    return true;
  }
  return /^2\d{12}$/.test(normalized) && normalized.slice(0, ARTICLE_KEY_LENGTH) === itemKey;
}

/** Bei gleichem Artikelanfang gewinnt der exakt gespeicherte Code. */
export function selectWeightArticleMatches<T extends WeightEanArticle>(
  articles: T[],
  parsed: WeightEan
): T[] {
  const matches = articles.filter((article) => articleMatchesWeightEan(article, parsed));
  const exact = matches.filter((article) =>
    eanCodesOf(article).some((ean) => normalizeEan(ean) === parsed.raw)
  );
  return exact.length > 0 ? exact : matches;
}

export function articleMatchesWeightEan(article: WeightEanArticle, parsed: WeightEan): boolean {
  if (!isKgUnit(article.unit)) {
    return false;
  }
  return eanCodesOf(article).some((ean) => storedEanMatchesWeightItem(ean, parsed.itemKey));
}

function parseEanList(eans: WeightEanArticle['eans']): string[] {
  if (Array.isArray(eans)) {
    return eans.filter((ean): ean is string => typeof ean === 'string');
  }
  if (typeof eans !== 'string' || !eans.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(eans);
    return Array.isArray(parsed) ? parsed.filter((ean): ean is string => typeof ean === 'string') : [];
  } catch {
    return [];
  }
}
