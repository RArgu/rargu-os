// 001 R2.b fixture: a lazy app import from a module in the registry's chunk
// that is not the registry itself.
export const writer = () => import("../../../../src/apps/writer/main.ts");
