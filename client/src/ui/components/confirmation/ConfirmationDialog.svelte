<script lang="ts">
    import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
    import { cn } from "../../lib/utils";

    let {
        open = $bindable(false),
        title,
        description,
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
        destructive = false,
        onConfirm,
        onCancel,
    }: {
        open?: boolean;
        title: string;
        description: string;
        confirmLabel?: string;
        cancelLabel?: string;
        destructive?: boolean;
        onConfirm: () => void;
        onCancel?: () => void;
    } = $props();

    function cancel(): void {
        open = false;
        onCancel?.();
    }

    function confirm(): void {
        open = false;
        onConfirm();
    }
</script>

<Dialog
    bind:open
    onOpenChangeComplete={(value) => {
        if (!value) onCancel?.();
    }}
>
    <DialogContent showClose={false} class="w-[20vw] min-w-[320px] max-w-[420px] gap-0 bg-card p-0 shadow-xl sm:rounded-lg">
        <div class="border-b border-border px-5 py-4">
            <DialogTitle class="text-base leading-normal">{title}</DialogTitle>
            <DialogDescription class="mt-1">{description}</DialogDescription>
        </div>
        <div class="flex justify-end gap-2 px-5 py-4">
            <button type="button" class="rounded-md border border-input bg-background px-3 py-2 text-sm" onclick={cancel}>
                {cancelLabel}
            </button>
            <button
                type="button"
                class={cn(
                    "rounded-md px-3 py-2 text-sm",
                    destructive
                        ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                        : "bg-primary text-primary-foreground hover:opacity-90",
                )}
                onclick={confirm}
            >
                {confirmLabel}
            </button>
        </div>
    </DialogContent>
</Dialog>
