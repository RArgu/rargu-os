// Spec 014: stack chips on /p/<id>/ without JavaScript (desktop).
import { expect, test } from "./helpers";
import { noJsChecks } from "./stack-chips-checks";

test.use({ javaScriptEnabled: false });
noJsChecks(test, expect);
