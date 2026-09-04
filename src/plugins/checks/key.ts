import { PluginKey } from "../../core/plugin/key";
import type { ReadonlySignal } from "../../core/signal";
import type { Finding } from "./types";

export interface ChecksState {
  readonly findings: ReadonlySignal<readonly Finding[]>;
  readonly hasBlockingFinding: ReadonlySignal<boolean>;
}

export const checksKey = new PluginKey<ChecksState>("checks");
