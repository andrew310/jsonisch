#!/usr/bin/env bash
# Consumer smoke for issue #28: proves the PACKED tarball's d.ts gives a
# real npm consumer the plugin-contributed FieldStoreSlots members
# (field.derived, field.mode, …). Installs the tarball plus typescript in
# a scratch dir and typechecks a widget-shaped consumer — no tsconfig
# paths, no monorepo resolution, exactly what a consumer sees. Needs
# network for the scratch install; run manually or in CI, not on publish.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

cd "$root"
pnpm build >/dev/null
node scripts/check-dist-augmentations.mjs
tarball="$root/$(npm pack --silent | tail -1)"
trap 'rm -rf "$scratch" "$tarball"' EXIT

cd "$scratch"
npm init -y >/dev/null
npm install --silent "$tarball" typescript@5.9 @types/react@19 >/dev/null

cat > consumer.ts <<'EOF'
import type { DerivedState, DerivationMode } from "jsonisch";
import type { FieldStore } from "jsonisch/react";

// The two members issue #28 reported as consumer-side type errors, read
// the way a widget reads them — plus the indexed-access form.
export function readDerived(field: FieldStore): DerivedState | undefined {
  const mode: DerivationMode | undefined = field.mode;
  if (mode === "estimate") field.setMode("formula");
  return field.derived;
}
export type Derived = FieldStore["derived"];
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["consumer.ts"]
}
EOF

./node_modules/.bin/tsc -p tsconfig.json
echo "consumer smoke passed: field.derived/field.mode typecheck against the packed tarball"
