// Build-time modules (scripts/*.ts Vite plugins).
declare module "virtual:castlewars-frames" {
  import type { Unit, UnitFrames } from "../../../scripts/castlewars-frames.ts";
  /** Each unit's frame data and PNG asset URL, in the mock's order. */
  const units: Record<Unit, UnitFrames & { src: string }>;
  export default units;
}
