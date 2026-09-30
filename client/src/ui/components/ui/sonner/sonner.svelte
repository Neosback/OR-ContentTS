<script lang="ts">
    import { Toaster as Sonner, type ToasterProps } from "svelte-sonner";

    import { settings } from "../../../lib/settings.svelte";

    let { ...restProps }: ToasterProps = $props();
</script>

<Sonner
    position="top-center"
    richColors
    closeButton
    theme={settings.value.themeMode}
    toastOptions={{ duration: 3500 }}
    {...restProps}
/>
