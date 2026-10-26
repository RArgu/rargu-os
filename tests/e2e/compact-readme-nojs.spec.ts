// Spec 013 T11: without JavaScript at 390 × 844 (R13.a); the checks are in
// readme-nojs-checks.ts.
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";
import { checks } from "./readme-nojs-checks";

test.use({ javaScriptEnabled: false });

checks(test, expect, sheet);
