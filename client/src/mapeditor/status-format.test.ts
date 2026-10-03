import { describe, expect, it } from "vitest";

import { describeFlags, formatCount, formatMegabytes, regionIdFor, tileTelemetry } from "./status-format";

describe("status formatting", () => {
    it("computes the map square id like the cache does", () => {
        expect(regionIdFor(3100, 3512)).toBe((48 << 8) | 54);
        expect(regionIdFor(3105, 3503)).toBe((48 << 8) | 54);
    });

    it("shortens counts and sizes", () => {
        expect(formatCount(950)).toBe("950");
        expect(formatCount(1234)).toBe("1.2k");
        expect(formatCount(48_200)).toBe("48k");
        expect(formatCount(2_500_000)).toBe("2.5M");
        expect(formatMegabytes(512 * 1048576)).toBe("512 MB");
    });

    it("names flag bits", () => {
        expect(describeFlags(0)).toBe("none");
        expect(describeFlags(3)).toBe("blocked, bridge");
        expect(describeFlags(64)).toBe("64");
    });

    it("lists cursor segments and the tile's contents", () => {
        const segments = tileTelemetry({ worldX: 3100, worldY: 3512 }, 1, { h: -240, u: 35, o: 13, s: 4, r: 2, f: 1 });
        const byLabel = Object.fromEntries(segments.map((segment) => [segment.label, segment.value]));
        expect(byLabel.Region).toBe("12342 (48, 54)");
        expect(byLabel.Local).toBe("28, 56");
        expect(byLabel.Plane).toBe("1");
        expect(byLabel.Height).toBe("-240");
        expect(byLabel.Underlay).toBe("#34");
        expect(byLabel.Overlay).toBe("#12 (shape 4, rot 2)");
        expect(byLabel.Flags).toBe("blocked");
        expect(tileTelemetry({ worldX: 0, worldY: 0 }, 0, undefined)).toHaveLength(4);
        expect(tileTelemetry({ worldX: 0, worldY: 0 }, 0, { u: 0, o: 0 }).find((s) => s.label === "Overlay")?.value).toBe("none");
    });
});
