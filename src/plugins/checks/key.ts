import { PluginKey } from "../../core/plugin/key";
import type { ReadonlySignal, Signal } from "../../core/signal";
import type { Finding } from "./types";

export interface ChecksState {
  readonly findings: ReadonlySignal<readonly Finding[]>;
  readonly hasBlockingFinding: ReadonlySignal<boolean>;
  /**
   * Per-instance finding computeds. `replaceCheckInstances` swaps this
   * signal's value so live admin edits rebind without remounting the form.
   */
  readonly instances: Signal<readonly ReadonlySignal<Finding[]>[]>;
  /**
   * Canonical collection rows for CheckScope (legacy `evalCollections`).
   * Reactive so replace can refresh them with the instances.
   */
  readonly collections: Signal<
    Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>
  >;
}

export const checksKey = new PluginKey<ChecksState>("checks");
