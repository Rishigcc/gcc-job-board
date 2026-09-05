const STORAGE_KEY = "postLoginRedirect";

export function setPostLoginRedirect(path, state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path, state }));
}

export function consumePostLoginRedirect() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);

  if (!raw) return { path: null, state: undefined };

  try {
    return JSON.parse(raw);
  } catch {
    return { path: null, state: undefined };
  }
}
