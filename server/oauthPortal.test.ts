import { describe, expect, it } from "vitest";
import {
  DEFAULT_OAUTH_PORTAL_URL,
  resolveOAuthPortalUrl,
} from "../client/src/const";

describe("resolveOAuthPortalUrl", () => {
  it("uses the public Manus portal when no value is configured", () => {
    expect(resolveOAuthPortalUrl(undefined)).toBe(DEFAULT_OAUTH_PORTAL_URL);
    expect(resolveOAuthPortalUrl(" ")).toBe(DEFAULT_OAUTH_PORTAL_URL);
  });

  it("rejects non-HTTP values", () => {
    expect(resolveOAuthPortalUrl("oauth.manus.computer")).toBe(
      DEFAULT_OAUTH_PORTAL_URL
    );
    expect(resolveOAuthPortalUrl("javascript:alert(1)")).toBe(
      DEFAULT_OAUTH_PORTAL_URL
    );
  });

  it("preserves a configured HTTP(S) portal", () => {
    expect(resolveOAuthPortalUrl("https://manus.im")).toBe("https://manus.im");
    expect(resolveOAuthPortalUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000"
    );
  });
});
