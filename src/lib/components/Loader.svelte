<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { Filters } from '#lib/filters.ts';

	// Re-runs `load` whenever any filter changes; drops results of outdated runs.
	// The previous result stays visible (dimmed) while the next one loads.
	let {
		filters,
		load,
		children
	}: { filters: Filters; load: (f: Filters) => Promise<T>; children: Snippet<[T]> } = $props();

	let data = $state<{ value: T } | null>(null);
	let error = $state<string | null>(null);
	let updating = $state(false);

	$effect(() => {
		const f = $state.snapshot(filters) as Filters;
		let stale = false;
		error = null;
		updating = true;
		load(f)
			.then((value) => {
				if (!stale) data = { value };
			})
			.catch((e) => {
				if (!stale) error = String(e);
			})
			.finally(() => {
				if (!stale) updating = false;
			});
		return () => (stale = true);
	});
</script>

{#if error}
	<p class="error">{error}</p>
{:else if !data}
	<p class="muted">Loading…</p>
{:else}
	<div class="loaded" class:updating aria-busy={updating}>
		{@render children(data.value)}
	</div>
{/if}

<style>
	.loaded {
		transition: opacity 0.15s;
	}
	.updating {
		opacity: 0.5;
	}
</style>
