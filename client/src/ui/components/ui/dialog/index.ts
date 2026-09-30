import { Dialog as DialogPrimitive } from "bits-ui";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

export { Dialog, DialogTrigger, DialogClose, DialogPortal };
export { default as DialogOverlay } from "./dialog-overlay.svelte";
export { default as DialogContent } from "./dialog-content.svelte";
export { default as DialogHeader } from "./dialog-header.svelte";
export { default as DialogFooter } from "./dialog-footer.svelte";
export { default as DialogTitle } from "./dialog-title.svelte";
export { default as DialogDescription } from "./dialog-description.svelte";
