import { Popover as PopoverPrimitive } from "bits-ui";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

export { Popover, PopoverTrigger, PopoverClose };
export { default as PopoverContent } from "./popover-content.svelte";
