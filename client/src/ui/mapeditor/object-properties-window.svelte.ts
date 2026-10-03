/** Whether the Object properties window is open (it follows the selected object while it is). */
export const objectProperties = $state({ open: false });

export function openObjectProperties(): void {
    objectProperties.open = true;
}

export function closeObjectProperties(): void {
    objectProperties.open = false;
}
