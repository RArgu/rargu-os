// 010 R9 (owner, G-net 2026-10-24): Cloudflare Web Analytics, added to
// rargu.dev by Cloudflare at the edge. The only third-party requests allowed.
export function cfBeacon(url: string): boolean {
  const u = new URL(url);
  return (
    (u.origin === "https://static.cloudflareinsights.com" &&
      u.pathname.startsWith("/beacon.min.js")) ||
    (u.origin === "https://cloudflareinsights.com" &&
      u.pathname === "/cdn-cgi/rum")
  );
}
