<script lang="ts">
    let { title, note }: { title: string; note: string } = $props();
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
    <div class="shrink-0 border-b px-3 py-2 text-sm font-semibold">{title}</div>
    <div class="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">{note}</div>
</div>
