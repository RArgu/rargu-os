// 001 R2.b fixture: stands in for the app host's registry module. Its own
// lazy import of Paint is authorized; the helper bundled beside it is not.
import { writer } from "./helper.ts";
void import("../../../../src/apps/paint/main.ts");
console.log(writer);
