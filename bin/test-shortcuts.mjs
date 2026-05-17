#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/hooks/use-keybinding.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class MockElement {
  constructor({ editable = false, closestMatch = false } = {}) {
    this.isContentEditable = editable;
    this.closestMatch = closestMatch;
  }

  closest() {
    return this.closestMatch ? this : null;
  }
}

const context = {
  require,
  module: { exports: {} },
  exports: {},
  HTMLElement: MockElement,
};
context.exports = context.module.exports;
vm.runInNewContext(compiled, context, { filename: "use-keybinding.ts" });

const {
  isShortcutTextEntryTarget,
  isSingleCharacterShortcut,
  matchesShortcut,
} = context.module.exports;

function keyEvent(key, overrides = {}) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

assert.equal(isSingleCharacterShortcut("j"), true);
assert.equal(isSingleCharacterShortcut("?"), true);
assert.equal(isSingleCharacterShortcut("Slash"), true);
assert.equal(isSingleCharacterShortcut("cmd+k"), false);
assert.equal(isSingleCharacterShortcut("Escape"), false);
assert.equal(isSingleCharacterShortcut("F1"), false);

assert.equal(matchesShortcut(keyEvent("?", { shiftKey: true }), "?"), true);
assert.equal(matchesShortcut(keyEvent("J", { shiftKey: true }), "j"), false);
assert.equal(matchesShortcut(keyEvent("k", { metaKey: true }), "cmd+k"), true);
assert.equal(matchesShortcut(keyEvent("k", { ctrlKey: true }), "cmd+k"), true);
assert.equal(matchesShortcut(keyEvent("\\", { metaKey: true }), "cmd+Backslash"), true);

assert.equal(isShortcutTextEntryTarget(new MockElement({ closestMatch: true })), true);
assert.equal(isShortcutTextEntryTarget(new MockElement({ editable: true })), true);
assert.equal(isShortcutTextEntryTarget(new MockElement()), false);
assert.equal(isShortcutTextEntryTarget(null), false);

console.log("shortcut guards ok");
