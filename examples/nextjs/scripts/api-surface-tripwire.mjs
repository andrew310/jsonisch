// Anti-drift tripwire for the /api reference page (issue #32): the page
// documents lib/api-reference.ts; this script imports the three entry
// points of the INSTALLED jsonisch package and diffs their runtime exports
// (Object.keys) against the data module's non-type entries. A jsonisch
// upgrade that adds or removes an export fails the build until the page's
// data catches up. Type-only exports have no runtime key, so they are
// outside what this can check.
//
// Runs with `node --experimental-strip-types` so it can import the typed
// data module directly (a no-op flag on Node >= 23, required on 22.6+).

import { apiReference } from "../lib/api-reference.ts";

const entryPoints = ["jsonisch", "jsonisch/plugin", "jsonisch/react"];
let failed = false;

for (const entry of entryPoints) {
  const runtime = new Set(Object.keys(await import(entry)));
  const documented = new Set(
    apiReference
      .filter((row) => row.entry === entry && row.kind !== "type")
      .map((row) => row.name),
  );
  const missing = [...runtime].filter((name) => !documented.has(name));
  const extra = [...documented].filter((name) => !runtime.has(name));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`✗ ${entry}`);
    if (missing.length)
      console.error(`  exported but undocumented: ${missing.sort().join(", ")}`);
    if (extra.length)
      console.error(`  documented but not exported: ${extra.sort().join(", ")}`);
  } else {
    console.log(`✓ ${entry} — ${documented.size} runtime exports match`);
  }
}

if (failed) {
  console.error(
    "\napi surface drift: update lib/api-reference.ts to match the installed jsonisch.",
  );
  process.exit(1);
}
