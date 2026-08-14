import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ArticleSearchResult {
  results: any[];
  showDropdown: boolean;
}

@Injectable({ providedIn: 'root' })
export class ArticleSearchService {
  private readonly http = inject(HttpClient);

  normalizeSearchTerm(term: string): string {
    return term.trim();
  }

  filterArticles(artikels: any[], searchTerm: string): Observable<ArticleSearchResult> {
    const trimmedTerm = this.normalizeSearchTerm(searchTerm);

    if (!trimmedTerm) {
      return of({ results: [], showDropdown: false });
    }

    const isEanSearch = /^\d{8}$|^\d{12}$|^\d{13}$/.test(trimmedTerm);
    if (!isEanSearch && trimmedTerm.length < 3) {
      return of({ results: [], showDropdown: false });
    }

    if (isEanSearch) {
      const localEanResults = artikels.filter((artikel) =>
        this.eanMatches(trimmedTerm, artikel.ean)
      );

      if (localEanResults.length > 0) {
        return of({ results: localEanResults, showDropdown: true });
      }

      return this.searchEanInApi(artikels, trimmedTerm);
    }

    const terms = trimmedTerm.toLowerCase().split(/\s+/);
    const filtered = artikels.filter((artikel) =>
      terms.every(
        (term) =>
          artikel.article_text?.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
      )
    );

    const results = this.sortArticles(filtered, trimmedTerm);
    return of({ results, showDropdown: results.length > 0 });
  }

  private getEanLookupVariants(ean: string): string[] {
    const trimmed = ean.trim();
    const variants = new Set<string>([trimmed]);

    if (/^\d{13}$/.test(trimmed) && trimmed.startsWith('0')) {
      variants.add(trimmed.slice(1));
    }

    if (/^\d{12}$/.test(trimmed)) {
      variants.add(`0${trimmed}`);
    }

    return [...variants];
  }

  private eanMatches(searchEan: string, storedEan: string | undefined): boolean {
    if (!storedEan) {
      return false;
    }

    const searchVariants = this.getEanLookupVariants(searchEan);
    const storedVariants = this.getEanLookupVariants(storedEan);
    return searchVariants.some((variant) => storedVariants.includes(variant));
  }

  private searchEanInApi(artikels: any[], eanCode: string): Observable<ArticleSearchResult> {
    const variants = this.getEanLookupVariants(eanCode);
    return this.tryEanVariantsInApi(artikels, variants);
  }

  private tryEanVariantsInApi(
    artikels: any[],
    variants: string[]
  ): Observable<ArticleSearchResult> {
    if (variants.length === 0) {
      return of({ results: [], showDropdown: false });
    }

    const [currentVariant, ...remainingVariants] = variants;

    return this.fetchEanFromApi(artikels, currentVariant).pipe(
      switchMap((result) => {
        if (result.results.length > 0 || remainingVariants.length === 0) {
          return of(result);
        }
        return this.tryEanVariantsInApi(artikels, remainingVariants);
      }),
      catchError(() => {
        if (remainingVariants.length === 0) {
          return of(this.performLocalSearch(artikels, currentVariant));
        }
        return this.tryEanVariantsInApi(artikels, remainingVariants);
      })
    );
  }

  private fetchEanFromApi(artikels: any[], eanCode: string): Observable<ArticleSearchResult> {
    const token = localStorage.getItem('token');

    return this.http
      .get<{ success: boolean; data?: { article_number: string } }>(
        `${environment.apiUrl}/api/product-eans/ean/${eanCode}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      )
      .pipe(
        map((response) => {
          if (response?.success && response.data?.article_number) {
            const existingProduct = artikels.find(
              (artikel) => artikel.article_number === response.data!.article_number
            );
            if (existingProduct) {
              return { results: [existingProduct], showDropdown: true };
            }
          }
          return { results: [], showDropdown: false };
        })
      );
  }

  private performLocalSearch(artikels: any[], searchTerm: string): ArticleSearchResult {
    const terms = searchTerm.toLowerCase().split(/\s+/);
    const filtered = artikels.filter((artikel) =>
      terms.every(
        (term) =>
          artikel.article_text?.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
      )
    );

    return { results: filtered, showDropdown: filtered.length > 0 };
  }

  sortArticles(filtered: any[], trimmedTerm: string = ''): any[] {
    const searchTermLower = trimmedTerm.trim().toLowerCase();

    return [...filtered].sort((a, b) => {
      if (searchTermLower) {
        const aArticleNumber = this.getArticleNumber(a);
        const bArticleNumber = this.getArticleNumber(b);
        const aArticleText = this.getArticleText(a);
        const bArticleText = this.getArticleText(b);
        const aEan = (a.ean || '').toLowerCase();
        const bEan = (b.ean || '').toLowerCase();

        const aArticleNumberExact = aArticleNumber === searchTermLower;
        const bArticleNumberExact = bArticleNumber === searchTermLower;
        const aArticleTextExact = aArticleText === searchTermLower;
        const bArticleTextExact = bArticleText === searchTermLower;
        const aEanExact = aEan === searchTermLower;
        const bEanExact = bEan === searchTermLower;

        const aArticleNumberStartsWith = aArticleNumber.startsWith(searchTermLower);
        const bArticleNumberStartsWith = bArticleNumber.startsWith(searchTermLower);
        const aArticleTextStartsWith = aArticleText.startsWith(searchTermLower);
        const bArticleTextStartsWith = bArticleText.startsWith(searchTermLower);
        const aEanStartsWith = aEan.startsWith(searchTermLower);
        const bEanStartsWith = bEan.startsWith(searchTermLower);

        if (aArticleNumberExact && !bArticleNumberExact) return -1;
        if (!aArticleNumberExact && bArticleNumberExact) return 1;
        if (aArticleTextExact && !bArticleTextExact) return -1;
        if (!aArticleTextExact && bArticleTextExact) return 1;
        if (aEanExact && !bEanExact) return -1;
        if (!aEanExact && bEanExact) return 1;
        if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
        if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
        if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
        if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
        if (aEanStartsWith && !bEanStartsWith) return -1;
        if (!aEanStartsWith && bEanStartsWith) return 1;
      }

      const articleNumberComparison = this.compareArticleNumbers(
        this.getArticleNumber(a) || undefined,
        this.getArticleNumber(b) || undefined
      );
      if (articleNumberComparison !== 0) {
        return articleNumberComparison;
      }
      return this.getArticleText(a).localeCompare(this.getArticleText(b));
    });
  }

  private getArticleText(item: any): string {
    return (item?.article_text || item?.product_name || '').toLowerCase();
  }

  private getArticleNumber(item: any): string {
    return (item?.article_number || item?.product_id || '').toLowerCase();
  }

  private compareArticleNumbers(a: string | undefined, b: string | undefined): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    const aNum = parseFloat(a);
    const bNum = parseFloat(b);

    if (!isNaN(aNum) && !isNaN(bNum) && a.toString() === aNum.toString() && b.toString() === bNum.toString()) {
      return aNum - bNum;
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
}
