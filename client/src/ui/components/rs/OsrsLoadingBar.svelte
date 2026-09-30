<script lang="ts">
    import "../../../components/rs/loading/OsrsLoadingBar.css";

    let { text, progress }: { text: string; progress: number } = $props();
</script>

<div class="loading-bar">
    <div class="loading-bar-progress-container">
        <div class="loading-bar-progress" style="width: {progress}%"></div>
    </div>
    <div class="loading-bar-text">{text} - {progress}%</div>
</div>
