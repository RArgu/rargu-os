// Spec 013 T11: without JavaScript (R13). The phone size is in
// compact-readme-nojs.spec.ts; both share `checks`.
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";
import { checks } from "./readme-nojs-checks";

test.use({ javaScriptEnabled: false });

checks(test, expect, sheet);
