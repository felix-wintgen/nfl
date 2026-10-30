<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { Filters } from '#lib/filters.ts';

	// Re-runs `load` whenever any filter changes; drops results of outdated runs.
	// The previous result stays visible (dimmed) while the next one loads.
	// The first load reserves space (or renders `pending`) so the page doesn't jump.
	let {
		filters,
		load,
		children,
		pending
	}: {
		filters: Filters;
		load: (f: Filters) => Promise<T>;
		children: Snippet<[T]>;
		pending?: Snippet;
	} = $props();

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
	{#if pending}
		<div aria-busy="true">{@render pending()}</div>
	{:else}
		<p class="muted placeholder" aria-busy="true">Loading…</p>
	{/if}
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
	.placeholder {
		min-height: 10rem;
	}
</style>
