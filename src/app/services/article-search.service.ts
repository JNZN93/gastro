import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ArticleSearchResult {
  results: any[];
  showDropdown: boolean;
}

@Injectable({ providedIn: 'root' })
export class ArticleSearchService {
  private readonly http = inject(HttpClient);

  filterArticles(artikels: any[], searchTerm: string): Observable<ArticleSearchResult> {
    const trimmedTerm = searchTerm.trim();

    if (!trimmedTerm) {
      return of({ results: [], showDropdown: false });
    }

    const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
    if (!isEanSearch && trimmedTerm.length < 3) {
      return of({ results: [], showDropdown: false });
    }

    if (isEanSearch) {
      const localEanResults = artikels.filter(
        (artikel) => artikel.ean?.toLowerCase() === trimmedTerm.toLowerCase()
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

    const results = this.sortSearchResults(filtered, trimmedTerm);
    return of({ results, showDropdown: results.length > 0 });
  }

  private searchEanInApi(artikels: any[], eanCode: string): Observable<ArticleSearchResult> {
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
        }),
        catchError(() => of(this.performLocalSearch(artikels, eanCode)))
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

  private sortSearchResults(filtered: any[], trimmedTerm: string): any[] {
    const searchTermLower = trimmedTerm.toLowerCase();

    return [...filtered].sort((a, b) => {
      const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
      const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
      const aArticleTextExact = a.article_text?.toLowerCase() === searchTermLower;
      const bArticleTextExact = b.article_text?.toLowerCase() === searchTermLower;
      const aEanExact = a.ean?.toLowerCase() === searchTermLower;
      const bEanExact = b.ean?.toLowerCase() === searchTermLower;

      const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
      const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
      const aArticleTextStartsWith = a.article_text?.toLowerCase().startsWith(searchTermLower);
      const bArticleTextStartsWith = b.article_text?.toLowerCase().startsWith(searchTermLower);
      const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
      const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);

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

      const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
      if (articleNumberComparison !== 0) {
        return articleNumberComparison;
      }
      return (a.article_text || '').localeCompare(b.article_text || '');
    });
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
