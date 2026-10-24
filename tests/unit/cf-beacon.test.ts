// 010 R9.a: the live same-origin check lets only the Cloudflare beacon through.
import { describe, expect, it } from "vitest";
import { cfBeacon } from "../e2e/cf-beacon.ts";

describe("010 R9.a Cloudflare Web Analytics filter", () => {
  it("accepts the beacon script and its report", () => {
    expect(
      cfBeacon(
        "https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092",
      ),
    ).toBe(true);
    expect(
      cfBeacon("https://static.cloudflareinsights.com/beacon.min.js"),
    ).toBe(true);
    expect(cfBeacon("https://cloudflareinsights.com/cdn-cgi/rum")).toBe(true);
  });
  it("rejects any other third-party origin or path", () => {
    for (const url of [
      "https://static.cloudflareinsights.com/other.js",
      "https://cloudflareinsights.com/other",
      "http://static.cloudflareinsights.com/beacon.min.js",
      "https://evil.static.cloudflareinsights.com.example/beacon.min.js",
      "https://www.google-analytics.com/analytics.js",
      "https://rargu.dev/beacon.min.js",
    ])
      expect(cfBeacon(url), url).toBe(false);
  });
});
