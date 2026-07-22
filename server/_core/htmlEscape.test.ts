import { describe, expect, it } from "vitest";
import { escapeHtml } from "./htmlEscape";

describe("escapeHtml", () => {
  it("escapes the 5 HTML-significant characters", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("neutralizes an injected tag", () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      "&lt;img src=x onerror=alert(1)&gt;"
    );
  });

  it("neutralizes a broken-out-of-tag injection", () => {
    const input = `</strong><a href="javascript:alert(1)">click</a>`;
    const result = escapeHtml(input);
    expect(result).not.toContain("<a href=");
    expect(result).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("João da Silva")).toBe("João da Silva");
  });

  it("handles null and undefined as empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("coerces non-string values", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});
