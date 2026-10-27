// Spec 014: stack chips in the browser (desktop); checks in stack-chips-checks.ts.
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";
import { checks } from "./stack-chips-checks";

checks(test, expect, sheet);
