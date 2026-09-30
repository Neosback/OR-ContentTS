import { keybindChordToLabel } from "../../../mapeditor/editor-tool-input";
import type { EditorToolKeyChord } from "../../../mapeditor/plugins/builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";

const MODIFIER_ONLY_CODES = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight"]);

function mouseCodeFromButton(button: number): string | null {
    return button === 0 ? "MouseLeft" : button === 1 ? "MouseMiddle" : button === 2 ? "MouseRight" : null;
}

function captureLabel(codes: string[], modifiers: { ctrl: boolean; alt: boolean; shift: boolean }): string {
    const parts: string[] = [];
    if (modifiers.ctrl) parts.push("Ctrl");
    if (modifiers.alt) parts.push("Alt");
    if (modifiers.shift) parts.push("Shift");
    if (codes.length > 0) {
        const label = keybindChordToLabel({ code: codes.length === 1 ? codes[0]! : codes, ctrlKey: false, altKey: false, shiftKey: false });
        if (label) parts.push(label);
    }
    return parts.join("+") || "Waiting...";
}

/**
 * "Press the keys you want" recorder for the keybind settings rows. While a row is recording, keys and mouse
 * buttons are swallowed at the window (capture phase) so they never reach the editor.
 * Esc cancels; Backspace/Delete clears the override; releasing all keys commits.
 */
export class KeybindCapture {
    capturingKey = $state<string | null>(null);
    preview = $state<EditorToolKeyChord | null>(null);
    previewLabel = $state("Waiting...");

    constructor(private readonly host: IEditorPluginHost) {}

    toggle(key: string): void {
        this.preview = null;
        this.previewLabel = "Waiting...";
        this.capturingKey = this.capturingKey === key ? null : key;
    }

    begin(key: string): void {
        this.preview = null;
        this.capturingKey = key;
    }

    cancel(): void {
        this.preview = null;
        this.capturingKey = null;
    }

    /** Installs the recording listeners for the current `capturingKey`; returns the teardown. Call from an `$effect`. */
    listen(): () => void {
        const key = this.capturingKey;
        if (!key) return () => {};

        const pressed = new Set<string>();
        let pending: EditorToolKeyChord | null = null;
        const label = (event: KeyboardEvent): string =>
            captureLabel(Array.from(pressed).sort(), { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey });

        const onKeyDown = (event: KeyboardEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            if (event.code === "Escape") return this.cancel();
            if (event.code === "Backspace" || event.code === "Delete") {
                this.host.setKeybindOverride(key, null);
                return this.cancel();
            }
            if (!MODIFIER_ONLY_CODES.has(event.code)) pressed.add(event.code);
            this.previewLabel = label(event);
            if (pressed.size === 0) return;
            const codes = Array.from(pressed).sort();
            pending = {
                code: codes.length === 1 ? codes[0]! : codes,
                ctrlKey: event.ctrlKey || undefined,
                altKey: event.altKey || undefined,
                shiftKey: event.shiftKey || undefined,
            };
            this.preview = pending;
        };

        const onKeyUp = (event: KeyboardEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            if (!MODIFIER_ONLY_CODES.has(event.code)) pressed.delete(event.code);
            this.previewLabel = label(event);
            if (pressed.size > 0 || !pending) return;
            this.host.setKeybindOverride(key, pending);
            this.capturingKey = null;
        };

        const onMouseDown = (event: MouseEvent): void => {
            const code = mouseCodeFromButton(event.button);
            if (!code) return;
            event.preventDefault();
            event.stopPropagation();
            const chord: EditorToolKeyChord = { code, ctrlKey: event.ctrlKey || undefined, altKey: event.altKey || undefined, shiftKey: event.shiftKey || undefined };
            this.preview = chord;
            this.previewLabel = keybindChordToLabel(chord);
            this.host.setKeybindOverride(key, chord);
            this.capturingKey = null;
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("mousedown", onMouseDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            window.removeEventListener("mousedown", onMouseDown, true);
        };
    }
}
