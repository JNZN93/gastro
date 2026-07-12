export function formatPickingDate(value?: string | null): string {
  if (!value) {
    return 'Kein Datum';
  }

  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);

  if (dateOnlyMatch && !trimmed.includes('T')) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}.${month}.${year}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const datePart = date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (trimmed.includes('T')) {
    const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  }

  return datePart;
}
