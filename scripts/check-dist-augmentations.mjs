#!/usr/bin/env node
// Tripwire for issue #28: a `declare module` with a relative specifier in
// the published d.ts resolves nowhere for consumers — every plugin-
// contributed FieldStoreSlots member (field.derived, field.mode, …)
// becomes a consumer-side type error. Augmentations must target the
// public specifier ("jsonisch/react"). Runs after build in prepublishOnly.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist", import.meta.url).pathname;

function* dtsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* dtsFiles(path);
    else if (name.endsWith(".d.ts")) yield path;
  }
}

let sawPublicAugmentation = false;
const offenders = [];
for (const file of dtsFiles(dist)) {
  const content = readFileSync(file, "utf8");
  if (/declare module\s+["']\.\.?\//.test(content)) offenders.push(file);
  if (content.includes('declare module "jsonisch/react"')) {
    sawPublicAugmentation = true;
  }
}

if (offenders.length > 0) {
  console.error(
    `Relative "declare module" specifier in emitted d.ts (unresolvable for consumers):\n  ${offenders.join("\n  ")}`,
  );
  process.exit(1);
}
// The positive half keeps the check honest: if the augmentations move or
// vanish, this fails instead of the grep silently matching nothing.
if (!sawPublicAugmentation) {
  console.error(
    'No \'declare module "jsonisch/react"\' found in dist — the FieldStoreSlots augmentations are missing.',
  );
  process.exit(1);
}
console.log("dist declare-module augmentations target the public specifier");
