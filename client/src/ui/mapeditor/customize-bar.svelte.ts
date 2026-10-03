/** Which customizable bar the Customize dialog is open for (undefined = closed). */
export type CustomizableBar = "viewport" | "tools";

export const customizeBar = $state<{ open: CustomizableBar | undefined }>({ open: undefined });

export function openCustomizeBar(bar: CustomizableBar): void {
    customizeBar.open = bar;
}
