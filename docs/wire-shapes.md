# Wire shapes

Estimate and amount-or-percent fields persist a **kind-discriminated
envelope on their own key** — there are no `<key>Source`/`<key>Hybrid`
sibling keys anywhere on the wire:

```jsonc
// estimate (control "estimate", x-field-type "computed")
"totalProjectBudget": {
  "kind": "estimate",
  "value": 60000,
  "mode": "estimate",
  "manualValue": 60000,
  "lastFlippedAt": "…"
}
// formula-owned: NO value key — the server recompute authors it
"totalProjectBudget": { "kind": "estimate", "mode": "formula" }

// amount-or-percent (control "amount-or-percent", x-field-type "hybrid")
"initialDisbursement": {
  "kind": "amount-or-percent",
  "value": 12500,
  "mode": "percent",
  "basis": "total_commitment"
}
```

Wire `mode` uses settled names (`estimate`/`formula`, `amount`/`percent`).
Every other field persists bare. The shape is owned by ONE static
descriptor — `envelopesWire` in `src/plugins/envelopes/wire.ts` — imported
identically by the client plugin and the server codec (spec D7), so the
halves cannot drift.

## Encode: `encodeDirty(schema, dirty, { knownColumns, wire })`

```mermaid
flowchart TD
  D["dirty values<br/>(pickDirty / getDirtyInput — envelope leaves already wrapped)"] --> K{"for each declared root key"}
  K -- undeclared --> DROP["dropped (allow-list)"]
  K -- declared --> SKIP{"wire.skipValue?"}
  SKIP -- "formula (derivationWire)" --> DROP2["dropped — recompute is the author"]
  SKIP -- no --> ENV{"envelope control?"}
  ENV -- yes --> NORM["envelopesWire.encode:<br/>estimate not pinned estimate → strip value half;<br/>bare estimate value → dropped (LOS-461)"]
  NORM --> BAG["data (envelope WHOLE)"]
  NORM -- "x-column: true" --> MIRROR["columns (scalar value-half mirror)"]
  ENV -- no --> COL{"x-column === true?"}
  COL -- "yes, in knownColumns" --> C["columns"]
  COL -- "yes, unknown column" --> DROP3["dropped (undeclared write path)"]
  COL -- no --> BAG2["data"]
```

Key rules:

- **The envelope is one bag key.** Partial writes clobber the other half, so
  every emission is a COMPLETE envelope; whole-array posts wrap every
  estimate/hybrid row leaf, dirty or not (`encodeScopeValues`).
- **Column-backed envelope fields**: the bag holds the envelope (source of
  truth); the column gets a mirrored scalar for SQL/list pages. Decode prefers
  the bag.
- The LOS-461 policy is unchanged, relocated: a formula value is always
  server-recomputed; an estimate value persists exactly when its meta pins
  `mode: "estimate"`.

## Decode

`decodeRecord(schema, record, { envelopes })` routes by `x-column` and passes
envelopes through whole; the walk unwraps the value half at each leaf
(`unwrapLeafInput`) and the envelopes plugin takes the meta half — see the
fork diagram atop `src/core/codec/decode-record.ts` and
[decode-fork.md](./decode-fork.md).
