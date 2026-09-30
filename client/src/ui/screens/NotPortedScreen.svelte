<script lang="ts">
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
    import { Badge } from "../components/ui/badge";

    let { name }: { name: string } = $props();

    function openReact(): void {
        const url = new URL(window.location.href);
        url.searchParams.set("ui", "react");
        window.location.assign(url.href);
    }
</script>

<div class="flex h-full min-h-0 w-full items-center justify-center p-4">
    <Card class="max-w-md border-dashed">
        <CardHeader class="pb-2">
            <div class="flex items-center gap-2">
                <CardTitle class="text-base">{name}</CardTitle>
                <Badge variant="secondary">Porting</Badge>
            </div>
            <CardDescription>This screen has not been moved to Svelte yet.</CardDescription>
        </CardHeader>
        <CardContent>
            <button type="button" class="text-sm text-primary underline-offset-4 hover:underline" onclick={openReact}>
                Open the React version
            </button>
        </CardContent>
    </Card>
</div>
