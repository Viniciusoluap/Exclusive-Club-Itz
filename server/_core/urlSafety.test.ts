import { describe, expect, it } from "vitest";
import { assertSafeExternalUrl } from "./urlSafety";

describe("assertSafeExternalUrl", () => {
  it("allows a normal https URL", () => {
    expect(() => assertSafeExternalUrl("https://storage.example.com/receipts/x.jpg")).not.toThrow();
  });

  it("allows a normal http URL", () => {
    expect(() => assertSafeExternalUrl("http://storage.example.com/x.jpg")).not.toThrow();
  });

  it("blocks localhost", () => {
    expect(() => assertSafeExternalUrl("http://localhost:8080/secret")).toThrow();
  });

  it("blocks 127.0.0.1", () => {
    expect(() => assertSafeExternalUrl("http://127.0.0.1/admin")).toThrow();
  });

  it("blocks cloud metadata endpoint (169.254.169.254)", () => {
    expect(() => assertSafeExternalUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
  });

  it("blocks private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)", () => {
    expect(() => assertSafeExternalUrl("http://10.0.0.5/internal")).toThrow();
    expect(() => assertSafeExternalUrl("http://172.20.1.1/internal")).toThrow();
    expect(() => assertSafeExternalUrl("http://192.168.1.1/internal")).toThrow();
  });

  it("blocks non-http(s) schemes", () => {
    expect(() => assertSafeExternalUrl("file:///etc/passwd")).toThrow();
    expect(() => assertSafeExternalUrl("ftp://example.com/x")).toThrow();
  });

  it("blocks malformed URLs", () => {
    expect(() => assertSafeExternalUrl("not a url")).toThrow();
  });

  it("blocks .internal/.local hostnames", () => {
    expect(() => assertSafeExternalUrl("http://service.internal/x")).toThrow();
    expect(() => assertSafeExternalUrl("http://printer.local/x")).toThrow();
  });
});
