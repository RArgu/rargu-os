// Build-time modules (scripts/host-chunks.ts).
declare module "virtual:host-url" {
  /** The host chunk's URL; null in dev. */
  const url: string | null;
  export default url;
}
declare module "virtual:app-urls" {
  /** Hosted app id → its main chunk's URL; empty in dev. */
  const urls: Record<string, string>;
  export default urls;
}
