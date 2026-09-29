<script lang="ts">
    import type { EditModeDefinitionSummary } from "../../game/plugins/editmode/types";

    let { definition }: { definition: EditModeDefinitionSummary } = $props();
</script>

<dl class="fields">
    {#each definition.fields as [label, value] (label)}
        <dt>{label}</dt>
        <dd>{value}</dd>
    {/each}
</dl>

<style>
    .fields {
        display: grid;
        grid-template-columns: minmax(90px, 35%) 1fr;
        margin: 0;
        font-size: 12px;
    }

    dt,
    dd {
        margin: 0;
        padding: 4px 0;
        border-top: 1px solid var(--studio-border);
    }

    dt {
        padding-right: 8px;
        color: var(--studio-muted);
    }

    dd {
        word-break: break-word;
    }
</style>
