import { toast } from "svelte-sonner";

const base = "border border-border border-l-4 bg-card text-foreground";

/** Toasts styled like the React shell's (accent stripe on the left). */
export function notifySuccess(message: string): void {
    toast.success(message, { class: `${base} border-l-emerald-500` });
}

export function notifyError(message: string): void {
    toast.error(message, { class: `${base} border-l-destructive` });
}

export function notifyMessage(message: string): void {
    toast.message(message);
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
