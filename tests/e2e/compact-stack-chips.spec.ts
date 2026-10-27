// Spec 014: stack chips in the browser at 390 × 844 (phone).
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";
import { checks } from "./stack-chips-checks";

checks(test, expect, sheet);
