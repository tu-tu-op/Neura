import assert from "node:assert/strict";
import test from "node:test";

import { calculate, chunkMarkdown, TOOL_DEFINITIONS } from "../src/agent/runtime";

test("calculator evaluates precedence without executable JavaScript", () => {
  assert.equal(calculate("2 + 3 * (4 - 1)"), 11);
  assert.throws(() => calculate("process.exit()"), /unsupported characters/);
  assert.throws(() => calculate("1 / 0"), /Invalid arithmetic expression/);
});

test("artifact chunking preserves content and bounds normal sections", () => {
  const chunks = chunkMarkdown(`# One\n${"a".repeat(900)}\n\n# Two\n${"b".repeat(900)}`);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0]!, /# One/);
  assert.match(chunks[1]!, /# Two/);
});

test("the initial runtime exposes only bounded read-only tools", () => {
  assert.deepEqual(TOOL_DEFINITIONS.map((tool) => tool.function.name), ["web_search", "artifact_search", "calculator", "current_time"]);
  for (const tool of TOOL_DEFINITIONS) assert.equal(tool.function.parameters.additionalProperties, false);
});
