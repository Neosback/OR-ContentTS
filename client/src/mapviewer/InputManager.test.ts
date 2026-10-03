import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InputManager } from "./InputManager";

function press(code: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init }));
}
function release(code: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true, ...init }));
}

describe("InputManager key state", () => {
    let input: InputManager;
    let element: HTMLDivElement;

    beforeEach(() => {
        input = new InputManager();
        element = document.createElement("div");
        document.body.appendChild(element);
        input.init(element);
    });

    afterEach(() => {
        input.cleanUp();
        element.remove();
    });

    it("tracks a held key until its keyup", () => {
        press("KeyQ");
        input.onFrameEnd();
        expect(input.isKeyDown("KeyQ")).toBe(true);
        release("KeyQ");
        expect(input.isKeyDown("KeyQ")).toBe(false);
    });

    it("Escape cancels held keys and is not left down when its keyup never arrives", () => {
        press("KeyQ");
        press("Escape");
        // the frame that sees Escape still sees it pressed
        expect(input.isKeyDown("Escape")).toBe(true);
        expect(input.keysPressedThisFrame.has("Escape")).toBe(true);
        expect(input.isKeyDown("KeyQ")).toBe(false);
        input.onFrameEnd();
        expect(input.isKeyDown("Escape")).toBe(false);
    });

    it("lets go of keys pressed with Cmd held, since macOS never sends their keyup", () => {
        press("MetaLeft", { metaKey: true });
        press("KeyC", { metaKey: true });
        expect(input.isKeyDown("KeyC")).toBe(true);
        input.onFrameEnd();
        expect(input.isKeyDown("KeyC")).toBe(false);
        expect(input.isKeyDown("MetaLeft")).toBe(true);
    });

    it("drops a modifier whose keyup was missed once an event reports it released", () => {
        press("ShiftLeft", { shiftKey: true });
        expect(input.isShiftDown()).toBe(true);
        press("KeyA", { shiftKey: false });
        expect(input.isShiftDown()).toBe(false);
        expect(input.isKeyDown("KeyA")).toBe(true);
    });

    it("releases held keys when pointer lock changes, but keeps modifiers and mouse buttons", () => {
        press("ControlLeft", { ctrlKey: true });
        press("KeyW", { ctrlKey: true });
        input.keys.set("MouseLeft", true);
        document.dispatchEvent(new Event("pointerlockchange"));
        expect(input.isKeyDown("KeyW")).toBe(false);
        expect(input.isKeyDown("ControlLeft")).toBe(true);
        expect(input.isKeyDown("MouseLeft")).toBe(true);
    });
});
