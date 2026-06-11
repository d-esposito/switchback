const KEY = "switchback:deviceId";
const LEGACY_KEY = "trailbound:deviceId";

export function getDeviceId(): string {
  // migrate identities created before the rename so nobody loses their hiker
  let id = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
  if (!id) {
    id = crypto.randomUUID();
  }
  localStorage.setItem(KEY, id);
  return id;
}
