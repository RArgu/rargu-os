// Build-time module (scripts/host-resources.ts).
declare module "virtual:host-resources" {
  /** fs path → text, or base64 bytes ("bin"). */
  const table: Record<string, { t: "text" | "bin"; d: string }>;
  export default table;
}
