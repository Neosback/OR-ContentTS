import { bundledWorldSource } from "./bundled-world-source";
import type { WorldSource } from "./world-source";

/**
 * Runtime default for local/offline Studio world data.
 *
 * Future backend/config selection belongs here (or behind a resolver), not in
 * Svelte viewer/editor components.
 */
export const defaultWorldSource: WorldSource = bundledWorldSource;
