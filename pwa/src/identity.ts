/** Anonymous browser identity (POC parity, no login). */

const STORAGE_KEY = 'diagonal_user_id';

function newHexId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `uuid:${hex}`;
}

/**
 * Returns the stable anonymous id, generating + persisting one on
 * first run. Empty/corrupt values regenerate (no repair UI).
 */
export function getUserId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const trimmed = stored.trim();
      if (/^uuid:[0-9a-f]{32}$/.test(trimmed)) return trimmed;
    }
  } catch {
    // Storage unavailable (private mode) — fall through to ephemeral.
  }
  const id = newHexId();
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ephemeral id for this session only.
  }
  return id;
}
