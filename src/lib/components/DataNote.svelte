<script lang="ts">
	import { getMeta } from '#lib/context.ts';

	// Explains which selected seasons lack NGS participation data
	// (personnel, formation, coverage, routes, pressure).
	let { seasons, what }: { seasons: number[]; what: string } = $props();

	const missing = $derived(
		getMeta().manifest.seasons.filter((s) => seasons.includes(s.season) && !s.has_participation)
	);
	const covered = $derived(seasons.filter((s) => !missing.some((m) => m.season === s)));
</script>

{#if missing.length}
	<p class="note">
		{#if covered.length}
			{what} from {covered.join(', ')} only: {missing.map((m) => m.season).join(', ')} not published by
			nflverse yet.
		{:else}
			{what}: no data for {missing.map((m) => m.season).join(', ')} yet (not published by nflverse). Add
			an earlier season to include it.
		{/if}
	</p>
{/if}

<style>
	.note {
		font-size: 0.8rem;
		color: var(--accent);
		background: var(--accent-soft);
		padding: 0.35rem 0.6rem;
		border-radius: 4px;
	}
</style>
