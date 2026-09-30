<script lang="ts">
    import { Button } from "../components/ui/button";

    let { label, note = "" }: { label: string; note?: string } = $props();
    let count = $state(0);
</script>

<div class="flex h-full flex-col gap-2 overflow-auto p-3 text-sm">
    <div class="font-semibold">{label}</div>
    <div class="text-muted-foreground">{note}</div>
    <div class="flex items-center gap-2">
        <Button size="sm" onclick={() => count++}>Clicked {count}</Button>
    </div>
</div>
