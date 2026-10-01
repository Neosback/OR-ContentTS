import type { NpcSpawn } from "../../../world/world-source";
import { AnimationFrames } from "../AnimationFrames";

export type NpcSpawnGroup = {
    idleAnim: AnimationFrames;
    walkAnim: AnimationFrames | undefined;
    spawns: NpcSpawn[];
};
