import {
  applyHaehnkeuleSize,
  isSameOrderArticle,
  needsHaehnkeuleSizeChoice,
  withHaehnkeuleSize,
} from './haehnkeule-variant.util';

describe('haehnkeule-variant', () => {
  const baseText = "W'HOF Hähnchen - Keulen mit 25% Rst. / gewürzt 10 kg in E1 Kiste (15289)";

  it('replaces the supplier code with groß or klein', () => {
    expect(applyHaehnkeuleSize(baseText, 'groß')).toBe(
      "W'HOF Hähnchen - Keulen mit 25% Rst. / gewürzt 10 kg in E1 Kiste (groß)"
    );
    expect(applyHaehnkeuleSize(baseText, 'klein')).toBe(
      "W'HOF Hähnchen - Keulen mit 25% Rst. / gewürzt 10 kg in E1 Kiste (klein)"
    );
  });

  it('asks for a size only for hähnkeule without a chosen size', () => {
    expect(needsHaehnkeuleSizeChoice({ article_number: 'hähnkeule', article_text: baseText })).toBeTrue();
    expect(needsHaehnkeuleSizeChoice({ article_number: 'putkeule', article_text: baseText })).toBeFalse();
    expect(needsHaehnkeuleSizeChoice({
      article_number: 'hähnkeule',
      article_text: applyHaehnkeuleSize(baseText, 'groß')
    })).toBeFalse();
  });

  it('keeps groß and klein as separate order lines', () => {
    const gross = withHaehnkeuleSize({ article_number: 'hähnkeule', article_text: baseText }, 'groß');
    const klein = withHaehnkeuleSize({ article_number: 'hähnkeule', article_text: baseText }, 'klein');

    expect(isSameOrderArticle(gross, klein)).toBeFalse();
    expect(isSameOrderArticle(gross, { ...gross })).toBeTrue();
    expect(isSameOrderArticle(
      { article_number: 'pom10', article_text: 'Pommes' },
      { article_number: 'pom10', article_text: 'Pommes' }
    )).toBeTrue();
  });
});
