export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "App";

export const APP_LOGO = "/logo-exclusive-vector.svg";

export const DEFAULT_OAUTH_PORTAL_URL = "https://manus.im";

export function resolveOAuthPortalUrl(configuredPortal: unknown): string {
  const candidate = String(configuredPortal ?? "").trim();
  return /^https?:\/\//i.test(candidate) ? candidate : DEFAULT_OAUTH_PORTAL_URL;
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = resolveOAuthPortalUrl(
    import.meta.env.VITE_OAUTH_PORTAL_URL
  );
  const appId = String(import.meta.env.VITE_APP_ID || "").trim();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL("/app-auth", oauthPortalUrl);
  if (appId) url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
