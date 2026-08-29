export async function readApiJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(messageForHttpStatus(response.status));
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(messageForHttpStatus(response.status, true));
  }
}

function messageForHttpStatus(status: number, nonJson = false): string {
  if (status === 413) {
    return 'Der Auftrag ist zu groß zum Speichern.';
  }
  if (nonJson) {
    return `Unerwartete Server-Antwort (HTTP ${status}). Bitte erneut versuchen.`;
  }
  return `Fehler beim Speichern (HTTP ${status}).`;
}
