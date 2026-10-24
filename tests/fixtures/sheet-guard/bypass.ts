// 001 R2.b fixture: the stand-in registry, loaded lazily as /next loads the
// host; its helper's lazy app import must fail.
void import("./registry/load.ts");
