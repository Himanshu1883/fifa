import assert from "node:assert/strict";
import { parseEventMatchNumber } from "../src/lib/parse-match-label-number";
import { resolveDedicatedResaleMatchNum } from "../src/lib/resale-discord-notify";

assert.equal(parseEventMatchNumber("Match3", "Canada vs Bosnia and Herzegovina"), 3);
assert.equal(parseEventMatchNumber("Match3 — Canada vs Bosnia and Herzegovina", ""), 3);
assert.equal(parseEventMatchNumber("Match 3 - Canada vs Bosnia", ""), 3);
assert.equal(parseEventMatchNumber("", "Canada vs Bosnia and Herzegovina"), null);

assert.equal(resolveDedicatedResaleMatchNum("Match3", "Match3", "Canada vs Bosnia and Herzegovina"), 3);
assert.equal(
  resolveDedicatedResaleMatchNum(null, "Match3 — Canada vs Bosnia and Herzegovina", "Canada vs Bosnia and Herzegovina"),
  3,
);

console.log("parse-match-label-number OK");
