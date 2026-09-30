import { Tooltip as TooltipPrimitive } from "bits-ui";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

export { Tooltip, TooltipTrigger, TooltipProvider };
export { default as TooltipContent } from "./tooltip-content.svelte";
