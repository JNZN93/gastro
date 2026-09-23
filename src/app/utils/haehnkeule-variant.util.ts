export type HaehnkeuleSize = 'groß' | 'klein';

const HAEHNKEULE_ARTICLE_NUMBER = 'hähnkeule';
const SUPPLIER_CODE_PATTERN = /\(\s*15289\s*\)/;
const SIZE_PATTERN = /\(\s*(groß|klein)\s*\)/i;

export function isHaehnkeuleArticle(articleNumber: unknown): boolean {
  return String(articleNumber ?? '').trim().toLowerCase() === HAEHNKEULE_ARTICLE_NUMBER;
}

export function haehnkeuleSizeFromText(text: string): HaehnkeuleSize | null {
  const match = text.replace(/\u00a0/g, ' ').match(SIZE_PATTERN);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase() === 'groß' ? 'groß' : 'klein';
}

export function needsHaehnkeuleSizeChoice(artikel: {
  article_number?: string;
  article_text?: string;
  haehnkeuleSize?: string;
} | null | undefined): boolean {
  if (!artikel || !isHaehnkeuleArticle(artikel.article_number)) {
    return false;
  }
  if (artikel.haehnkeuleSize === 'groß' || artikel.haehnkeuleSize === 'klein') {
    return false;
  }
  return haehnkeuleSizeFromText(artikel.article_text || '') === null;
}

/** Ersetzt die Kennung (15289) am Artikeltext durch (groß) oder (klein). */
export function applyHaehnkeuleSize(text: string, size: HaehnkeuleSize): string {
  const label = size === 'groß' ? '(groß)' : '(klein)';
  const source = (text || '').replace(/\u00a0/g, ' ');

  if (SUPPLIER_CODE_PATTERN.test(source)) {
    return source.replace(SUPPLIER_CODE_PATTERN, label);
  }
  if (SIZE_PATTERN.test(source)) {
    return source.replace(SIZE_PATTERN, label);
  }

  const trimmed = source.trim();
  return trimmed ? `${trimmed} ${label}` : label;
}

export function withHaehnkeuleSize<T extends { article_text?: string; description?: string }>(
  artikel: T,
  size: HaehnkeuleSize
): T & { article_text: string; description: string; haehnkeuleSize: HaehnkeuleSize } {
  const article_text = applyHaehnkeuleSize(artikel.article_text || '', size);
  return {
    ...artikel,
    article_text,
    description: article_text,
    haehnkeuleSize: size,
  };
}

export function isSameOrderArticle(
  existing: { article_number?: string; article_text?: string },
  incoming: { article_number?: string; article_text?: string }
): boolean {
  if (String(existing.article_number ?? '') != String(incoming.article_number ?? '')) {
    return false;
  }
  if (!isHaehnkeuleArticle(incoming.article_number)) {
    return true;
  }
  const normalize = (value: string | undefined) => (value || '').replace(/\u00a0/g, ' ').trim();
  return normalize(existing.article_text) === normalize(incoming.article_text);
}
