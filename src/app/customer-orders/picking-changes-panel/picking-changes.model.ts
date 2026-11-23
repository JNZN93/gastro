export type PickingChangeType =
  | 'replaced'
  | 'unavailable'
  | 'removed'
  | 'quantity_changed'
  | 'text_changed'
  | 'added'
  | 'deferred';

export interface PickingChangeEntry {
  id: number;
  order_id: number;
  change_type: PickingChangeType;
  original_article_number: string | null;
  original_text: string | null;
  original_quantity: string | number | null;
  original_price: string | number | null;
  new_article_number: string | null;
  new_text: string | null;
  new_quantity: string | number | null;
  new_price: string | number | null;
  picker_user_name: string | null;
  created_at: string;
}

export const PICKING_CHANGE_LABELS: Record<PickingChangeType, string> = {
  replaced: 'Ersetzt',
  unavailable: 'Nicht verfügbar',
  removed: 'Entfernt',
  quantity_changed: 'Menge geändert',
  text_changed: 'Text geändert',
  added: 'Hinzugefügt',
  deferred: 'Nachlieferung',
};

export function formatPickingQuantity(value: string | number | null): string {
  if (value == null || value === '') {
    return '–';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  return number.toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

export interface PickingChangeHint {
  type: PickingChangeType;
  text: string;
}

/** Kurzer Hinweis für die Auftragszeile, deren Artikelnummer zum kommissionierten Stand gehört. */
export function pickingChangeHintsForArticle(
  changes: PickingChangeEntry[],
  articleNumber: string | null | undefined
): PickingChangeHint[] {
  if (!articleNumber) {
    return [];
  }
  const key = String(articleNumber).trim();
  return changes
    .filter((change) => change.new_article_number === key)
    .map((change) => ({ type: change.change_type, text: hintText(change) }));
}

function hintText(change: PickingChangeEntry): string {
  switch (change.change_type) {
    case 'replaced':
      return `Ersatz für ${change.original_text || change.original_article_number || 'Artikel'}`;
    case 'quantity_changed':
      return `Menge geändert (bestellt ${formatPickingQuantity(change.original_quantity)})`;
    case 'text_changed':
      return `Text geändert (vorher „${change.original_text || ''}“)`;
    case 'added':
      return 'Bei der Kommissionierung hinzugefügt';
    case 'deferred':
      return 'Wird nachgeliefert';
    default:
      return PICKING_CHANGE_LABELS[change.change_type];
  }
}
