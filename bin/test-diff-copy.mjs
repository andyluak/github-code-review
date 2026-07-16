#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/diff-copy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const context = {
  require,
  module: { exports: {} },
  exports: {},
};
context.exports = context.module.exports;
vm.runInNewContext(compiled, context, { filename: "diff-copy.ts" });

const { copyTextFromSelectedDiffCells } = context.module.exports;

assert.equal(
  copyTextFromSelectedDiffCells(
    [
      { text: "const before = true;", side: "old", layout: "split" },
      { text: "const after = true;", side: "new", layout: "split" },
      { text: "run(after);", side: "new", layout: "split" },
    ],
    {
      startSide: "new",
      endSide: "new",
      startLayout: "split",
      endLayout: "split",
    },
  ),
  "const after = true;\nrun(after);",
);

assert.equal(
  copyTextFromSelectedDiffCells(
    [
      { text: "if (ready) {", side: "new", layout: "split" },
      { text: "", side: "new", layout: "split" },
      { text: "  ship();", side: "new", layout: "split" },
    ],
    {
      startSide: "new",
      endSide: "new",
      startLayout: "split",
      endLayout: "split",
    },
  ),
  "if (ready) {\n\n  ship();",
);

assert.equal(
  copyTextFromSelectedDiffCells(
    [
      { text: "- old();", side: "old", layout: "unified" },
      { text: "+ next();", side: "new", layout: "unified" },
    ],
    {
      startSide: "old",
      endSide: "new",
      startLayout: "unified",
      endLayout: "unified",
    },
  ),
  "- old();\n+ next();",
);

assert.equal(copyTextFromSelectedDiffCells([], {}), null);

console.log("diff copy ok");
