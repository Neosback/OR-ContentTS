import { describe, expect, it } from "vitest";

import type { GameVals } from "../rs/config/gameval/GameVals";
import { GameValGroupType } from "../rs/config/gameval/GameValGroupType";
import { Interface, InterfaceComponent } from "../rs/config/gameval/impl/Interface";
import {
    buildGameValRegistry,
} from "../project/gameval-registry";
import { buildGameValDatIndex } from "../project/gameval-dat-index";
import {
    buildGameValTomlIndex,
    parseGameValToml,
} from "../project/gameval-toml-index";
import {
    buildRscmIndex,
    parseRscmFile,
} from "../project/rscm-index";
import { createInterfaceMetadataSource } from "./interface-metadata-source";

function fakeGameVals(ifaces: Interface[]): GameVals {
    const map = new Map(ifaces.map((iface) => [iface.id, iface]));
    return {
        get(type: GameValGroupType) {
            return type === GameValGroupType.IFTYPES ? ifaces : [];
        },
        getFastAs<T>(_type: GameValGroupType, id: number): T | undefined {
            return map.get(id) as T | undefined;
        },
    } as unknown as GameVals;
}

function emptyDat() {
    return buildGameValDatIndex([]);
}

describe("InterfaceMetadataSource", () => {
    it("uses selected-cache GameVals when no OpenRune project metadata is active", () => {
        const gameVals = fakeGameVals([
            new Interface("chatbox", 548, [
                new InterfaceComponent("input", 12, 548),
            ]),
        ]);
        const source = createInterfaceMetadataSource(gameVals, null);

        expect(source.getInterface(548)).toMatchObject({
            id: 548,
            cacheName: "chatbox",
            displayName: "chatbox",
            projectAlternates: [],
            diagnostics: [],
        });
        expect(source.getComponent(548, 12)).toMatchObject({
            interfaceId: 548,
            componentId: 12,
            cacheName: "input",
            displayName: "input",
            projectAlternates: [],
            diagnostics: [],
        });
    });

    it("adds OpenRune component symbols and source provenance without replacing numeric identity", () => {
        const packed = (548 << 16) | 12;
        const registry = buildGameValRegistry({
            dat: emptyDat(),
            toml: buildGameValTomlIndex([
                parseGameValToml(
                    "content/ui/gamevals.toml",
                    `[gamevals.component]\nchatbox:input = ${packed}`,
                    "content/ui",
                ),
            ]),
            rscm: buildRscmIndex([]),
        });
        const source = createInterfaceMetadataSource(null, registry);

        expect(source.getComponent(548, 12)).toMatchObject({
            componentId: 12,
            packedId: packed,
            projectSymbol: "component.chatbox:input",
            projectKey: "chatbox:input",
            displayName: "chatbox:input",
            provenance: {
                sourceKind: "module-toml",
                sourcePath: "content/ui/gamevals.toml",
                modulePath: "content/ui",
            },
        });
    });

    it("supports plural component RSCM namespaces used by existing OpenRune mapping files", () => {
        const packed = (760 << 16) | 7;
        const registry = buildGameValRegistry({
            dat: emptyDat(),
            toml: buildGameValTomlIndex([]),
            rscm: buildRscmIndex([
                parseRscmFile(
                    ".data/gamevals/components.rscm",
                    `toplevel_move_events:some_component=${packed}`,
                ),
            ]),
        });
        const source = createInterfaceMetadataSource(null, registry);

        expect(source.getComponent(760, 7)).toMatchObject({
            projectSymbol: "components.toplevel_move_events:some_component",
            displayName: "toplevel_move_events:some_component",
            provenance: {
                sourceKind: "rscm",
                sourcePath: ".data/gamevals/components.rscm",
                line: 1,
            },
        });
    });

    it("retains alternate names and diagnostics when component/component(s) disagree", () => {
        const packed = (548 << 16) | 12;
        const registry = buildGameValRegistry({
            dat: emptyDat(),
            toml: buildGameValTomlIndex([
                parseGameValToml(
                    "content/ui/gamevals.toml",
                    `[gamevals.component]\nchatbox:input = ${packed}`,
                ),
            ]),
            rscm: buildRscmIndex([
                parseRscmFile(
                    ".data/gamevals/components.rscm",
                    `chatbox:different_name=${packed}`,
                ),
            ]),
        });
        const source = createInterfaceMetadataSource(null, registry);
        const metadata = source.getComponent(548, 12);

        expect(metadata.projectSymbol).toBe("component.chatbox:input");
        expect(metadata.projectAlternates).toEqual([
            "components.chatbox:different_name",
        ]);
        expect(metadata.diagnostics).toEqual([
            expect.stringContaining("Multiple OpenRune symbols map to id"),
        ]);
    });

    it("reflects a newly supplied project registry instead of retaining stale project names", () => {
        const packed = (548 << 16) | 12;
        const first = buildGameValRegistry({
            dat: emptyDat(),
            toml: buildGameValTomlIndex([
                parseGameValToml(
                    "content/a/gamevals.toml",
                    `[gamevals.component]\nchatbox:first = ${packed}`,
                ),
            ]),
            rscm: buildRscmIndex([]),
        });
        const second = buildGameValRegistry({
            dat: emptyDat(),
            toml: buildGameValTomlIndex([
                parseGameValToml(
                    "content/b/gamevals.toml",
                    `[gamevals.component]\nchatbox:second = ${packed}`,
                ),
            ]),
            rscm: buildRscmIndex([]),
        });

        expect(createInterfaceMetadataSource(null, first).getComponent(548, 12).displayName)
            .toBe("chatbox:first");
        expect(createInterfaceMetadataSource(null, second).getComponent(548, 12).displayName)
            .toBe("chatbox:second");
    });
});
