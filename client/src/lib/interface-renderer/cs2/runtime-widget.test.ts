import { describe, expect, it } from "vitest";

import { createDynamicWidget } from "./runtime-widget";

describe("createDynamicWidget", () => {
  it("uses client Widget constructor defaults for CC_CREATE children", () => {
    const widget = createDynamicWidget(0x12340056, 4, 3);

    expect(widget.v3).toBe(true);
    expect(widget.type).toBe(4);
    expect(widget.id).toBe(0x12340056);
    expect(widget.packedId).toBe(0x12340056);
    expect(widget.layer).toBe(0x12340056);
    expect(widget.childIndex).toBe(3);
    expect(widget.__dynamicCreated).toBe(true);

    expect(widget.x).toBe(0);
    expect(widget.y).toBe(0);
    expect(widget.width).toBe(0);
    expect(widget.height).toBe(0);
    expect(widget.tempWidth).toBe(0);
    expect(widget.tempHeight).toBe(0);

    expect(widget.text).toBe("");
    expect(widget.secondaryText).toBe("");
    expect(widget.textFont).toBe(-1);
    expect(widget.textLineHeight).toBe(0);
    expect(widget.textAlignH).toBe(0);
    expect(widget.textAlignV).toBe(0);
    expect(widget.textShadow).toBe(false);

    expect(widget.graphic).toBe(-1);
    expect(widget.secondaryGraphic).toBe(-1);
    expect(widget.model).toBe(-1);
    expect(widget.secondaryModel).toBe(-1);
    expect(widget.modelAnim).toBe(-1);
    expect(widget.secondaryModelAnim).toBe(-1);
    expect(widget.modelZoom).toBe(100);

    expect(widget.lineWid).toBe(1);
    expect(widget.mouseOverRedirect).toBe(-1);
    expect(widget.buttonText).toBe("Ok");
    expect(widget.op).toEqual([]);
    expect(widget.children).toBeNull();
  });

  it("creates independent mutable state for each runtime widget", () => {
    const first = createDynamicWidget(100, 4, 0);
    const second = createDynamicWidget(100, 4, 1);

    first.op.push("Use");
    first.text = "first";

    expect(second.op).toEqual([]);
    expect(second.text).toBe("");
  });
});
