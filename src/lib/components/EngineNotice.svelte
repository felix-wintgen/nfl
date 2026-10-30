<script lang="ts">
	import { engine } from '#lib/db.ts';

	// Shown only while the query engine downloads (first visit) or if it failed.
	const mb = (bytes: number) => (bytes / 1e6).toFixed(0);
</script>

{#if $engine.phase === 'loading'}
	<div class="notice" role="status">
		<div class="bar"><span></span></div>
		Loading the query engine{$engine.bytes ? ` · ${mb($engine.bytes)} MB` : ''}. This is a one-time
		download; later visits load from your browser's cache.
	</div>
{:else if $engine.phase === 'error'}
	<div class="notice error" role="alert">
		Couldn't start the query engine ({$engine.message}). Reload the page to try again.
	</div>
{/if}

<style>
	.notice {
		font-size: 0.85rem;
		color: var(--muted);
		margin-bottom: 1rem;
	}
	.bar {
		height: 3px;
		background: var(--line);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 0.4rem;
	}
	.bar span {
		display: block;
		height: 100%;
		width: 30%;
		background: var(--accent);
		animation: slide 1.2s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(340%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar span {
			animation: none;
			width: 100%;
			opacity: 0.4;
		}
	}
</style>
