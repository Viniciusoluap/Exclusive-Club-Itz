export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "App";

export const APP_LOGO = "/logo-exclusive-vector.svg";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const configuredPortal = String(import.meta.env.VITE_OAUTH_PORTAL_URL || "").trim();
  const oauthPortalUrl = /^https?:\/\//i.test(configuredPortal)
    ? configuredPortal
    : "https://oauth.manus.computer";
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
