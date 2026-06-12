const KEY = "switchback:deviceId";
const LEGACY_KEY = "trailbound:deviceId";
const TAB_KEY = "switchback:tabId";

export function getDeviceId(): string {
  // migrate identities created before the rename so nobody loses their hiker
  let id = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
  if (!id) {
    id = crypto.randomUUID();
  }
  localStorage.setItem(KEY, id);
  return id;
}

/**
 * Presence identity for THIS tab. localStorage is shared across every window
 * of a browser, so a device-level key would make two open windows fight over
 * one presence row (thrashing positions and conflicting writes). The tab
 * nonce lives in sessionStorage, which is per-tab and survives reloads.
 */
export function getPresenceKey(): string {
  // test harness: iframes share the tab's sessionStorage, so a same-page
  // second client needs a per-window nonce override (dev only)
  if (import.meta.env.DEV) {
    const w = window as unknown as { __tabNonce?: string };
    if (w.__tabNonce) return `${getDeviceId()}~${w.__tabNonce}`;
  }
  let tab = sessionStorage.getItem(TAB_KEY);
  if (!tab) {
    tab = Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem(TAB_KEY, tab);
  }
  // "~" is URL-safe — these keys travel in WebSocket query strings
  return `${getDeviceId()}~${tab}`;
}
