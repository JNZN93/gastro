const PICKER_NAME_STORAGE_KEY = 'pickingPickerName';
const PICKER_NAME_CONFIRMED_KEY = 'pickingPickerNameConfirmed';

export function isUsablePickerName(value?: string | null): boolean {
  const name = (value || '').trim();
  return name.length >= 2 && !name.includes('@');
}

export function displayPickerName(value?: string | null): string {
  return isUsablePickerName(value) ? String(value).trim() : '';
}

export function getStoredPickerName(): string {
  try {
    const stored = (localStorage.getItem(PICKER_NAME_STORAGE_KEY) || '').trim();
    return isUsablePickerName(stored) ? stored : '';
  } catch {
    return '';
  }
}

export function saveStoredPickerName(name: string): void {
  try {
    localStorage.setItem(PICKER_NAME_STORAGE_KEY, name);
  } catch {
    // localStorage kann im privaten Modus fehlen
  }
}

export function markPickerNameConfirmed(): void {
  try {
    sessionStorage.setItem(PICKER_NAME_CONFIRMED_KEY, '1');
  } catch {
    // sessionStorage kann im privaten Modus fehlen
  }
}

export function consumePickerNameConfirmation(): boolean {
  try {
    const confirmed = sessionStorage.getItem(PICKER_NAME_CONFIRMED_KEY) === '1';
    if (confirmed) {
      sessionStorage.removeItem(PICKER_NAME_CONFIRMED_KEY);
    }
    return confirmed && !!getStoredPickerName();
  } catch {
    return false;
  }
}
