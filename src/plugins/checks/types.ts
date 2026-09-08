import type { Path } from "../../core/types";

export type Severity = "info" | "warning" | "error";
export type SeverityConfig = Severity | "off";

export interface Finding {
  /** Instance id — the bespoke.check row id. */
  readonly id: string;
  /** Definition id — "formula", … */
  readonly checkId: string;
  readonly messageId?: string;
  /** Already interpolated. */
  readonly message: string;
  /** Display title (instance options.name, else the definition id). */
  readonly name: string;
  /** From config. A check cannot set this. */
  readonly severity: Severity;
  /** Field this finding attaches to; `[]` means form-level. */
  readonly path: Path;
}

export interface CheckScope {
  /**
   * One key through the derivation closure (LOS-514): when BOTH the
   * canonical side and the live side are arrays, mergeCollectionRows;
   * otherwise live wins and offForm / plugin collections fill only
   * `undefined`. A root-record ref like `record` is a plain object — get
   * returns that object, never an empty array.
   */
  get(key: string): unknown;
  /**
   * `get(collection)` when the value is an array, else `[]`. Never forces
   * a non-array live value through the collection merge.
   */
  rows(collection: string): readonly Readonly<Record<string, unknown>>[];
  /**
   * The whole bag. Frozen; building it subscribes to every root key.
   */
  values(): Readonly<Record<string, unknown>>;
}

export interface FindingDescriptor {
  readonly messageId?: string;
  readonly message?: string;
  readonly data?: Readonly<Record<string, string | number>>;
  /** Field(s) the finding attaches to. Empty/omitted → form-level. */
  readonly paths?: readonly Path[];
}

export interface CheckContext<Options = unknown> {
  readonly id: string;
  readonly checkId: string;
  readonly options: Options;
  readonly scope: CheckScope;
  report(finding: FindingDescriptor): void;
}

export interface CheckMeta<Options = unknown> {
  readonly name: string;
  readonly messages: Readonly<Record<string, string>>;
  readonly optionsSchema?: Record<string, unknown> | false;
  readonly defaultOptions?: Options;
}

export interface CheckHandlers {
  evaluate(): void;
}

export interface CheckDefinition<Options = unknown> {
  readonly meta: CheckMeta<Options>;
  create(context: CheckContext<Options>): CheckHandlers;
}

export interface CheckInstanceConfig<Options = unknown> {
  readonly id: string;
  readonly check: string;
  readonly severity: SeverityConfig;
  readonly options?: Options;
}

export interface ChecksConfig {
  readonly definitions: Readonly<Record<string, CheckDefinition<unknown>>>;
  readonly instances: readonly CheckInstanceConfig[];
  /**
   * Canonical collection rows for CheckScope only (legacy host
   * `evalCollections`). Must not be written onto the form's offForm shelf.
   */
  readonly collections?: Readonly<
    Record<string, ReadonlyArray<Record<string, unknown>>>
  >;
}

export interface FormulaOptions {
  readonly formula: string;
  readonly message?: string;
  readonly name?: string;
  readonly targetFieldKeys?: readonly string[];
}
