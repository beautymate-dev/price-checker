import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * One cookie-jar-backed fetch per site adapter instance, since store
 * selection on the Foodstuffs sites is session/cookie scoped: calling
 * ChangeStore sets a cookie that subsequent search requests rely on.
 */
export function createSessionFetch() {
  const jar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, jar);

  return async function sessionFetch(url: string, init: RequestInit = {}) {
    const headers = {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "application/json, text/plain, */*",
      ...init.headers,
    };
    return fetchWithCookies(url, { ...init, headers });
  };
}
