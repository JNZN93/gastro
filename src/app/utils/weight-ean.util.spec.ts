import {
  articleMatchesWeightEan,
  formatQuantityLabel,
  parseWeightEan,
  selectWeightArticleMatches,
  storedEanMatchesWeightItem,
} from './weight-ean.util';

describe('weight-ean', () => {
  it('reads the weight in kilograms from an instore EAN', () => {
    expect(parseWeightEan('2816571154602')).toEqual({
      raw: '2816571154602',
      itemKey: '281657',
      weightKg: 15.46,
    });
    expect(parseWeightEan('2201662023613')?.weightKg).toBe(2.361);
    expect(parseWeightEan('2337870011484')?.weightKg).toBe(1.148);
  });

  it('ignores normal EANs and codes without a weight', () => {
    expect(parseWeightEan('4003476013013')).toBeNull();
    expect(parseWeightEan('2816571000002')).toBeNull();
    expect(parseWeightEan('12345678')).toBeNull();
  });

  it('matches a kg article by the fixed part of the EAN', () => {
    const stored = {
      unit: 'kg',
      ean: '2816571154602',
    };
    const scanned = parseWeightEan('2816571098702');

    expect(scanned).not.toBeNull();
    expect(storedEanMatchesWeightItem(stored.ean, scanned!.itemKey)).toBeTrue();
    expect(articleMatchesWeightEan(stored, scanned!)).toBeTrue();
    expect(articleMatchesWeightEan({ ...stored, unit: 'Stk.' }, scanned!)).toBeFalse();
  });

  it('finds the same article when only the seventh digit and the weight change', () => {
    const stored = { unit: 'kg', ean: '2816576147951' };
    const otherPack = parseWeightEan('2816573153702');

    expect(otherPack?.itemKey).toBe('281657');
    expect(otherPack?.weightKg).toBe(15.37);
    expect(parseWeightEan('2816576147951')?.weightKg).toBe(14.795);
    expect(articleMatchesWeightEan(stored, otherPack!)).toBeTrue();
  });

  it('keeps the article whose stored code is the scanned number', () => {
    const articles = [
      { unit: 'kg', ean: '2816571154602', article_number: 'edamil' },
      { unit: 'kg', ean: '2816576147951', article_number: 'edamer-neu' },
    ];
    const scanned = parseWeightEan('2816576147951')!;

    expect(selectWeightArticleMatches(articles, scanned).map((article) => article.article_number))
      .toEqual(['edamer-neu']);
    expect(selectWeightArticleMatches(articles, parseWeightEan('2816573153702')!).length).toBe(2);
  });

  it('finds the stored Edamer for both pack codes', () => {
    const articles = [{ unit: 'kg', ean: '2816571154602', article_number: 'edamil' }];

    expect(selectWeightArticleMatches(articles, parseWeightEan('2816576147951')!).map((article) => article.article_number))
      .toEqual(['edamil']);
    expect(selectWeightArticleMatches(articles, parseWeightEan('2816573153702')!).map((article) => article.article_number))
      .toEqual(['edamil']);
  });

  it('prints kilogram weights with a comma', () => {
    expect(formatQuantityLabel(14.795, 'kg')).toBe('14,795 kg');
    expect(formatQuantityLabel(15.37, 'kg')).toBe('15,370 kg');
    expect(formatQuantityLabel(3, 'Stk.')).toBe('3×');
  });

  it('also matches additional EANs stored as a list', () => {
    const scanned = parseWeightEan('2945048012507');
    expect(articleMatchesWeightEan({
      unit: 'KG',
      ean: null,
      eans: ['2945048018168'],
    }, scanned!)).toBeTrue();
  });
});
