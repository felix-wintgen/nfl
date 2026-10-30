<script lang="ts">
	import { alignment, ALIGNMENTS, M } from '#lib/baseline.ts';
	import { getMeta } from '#lib/context.ts';
	import type { Filters } from '#lib/filters.ts';
	import { withoutParticipation } from '#lib/meta.ts';
	import DataNote from '../DataNote.svelte';
	import GroupTable, { type Column } from '../GroupTable.svelte';

	let { filters }: { filters: Filters } = $props();

	const columns: Column[] = [
		{ key: 'pass', label: 'Pass rate', expr: M.passRate, format: 'pct', better: 'none' },
		{ key: 'pa', label: 'Play action', expr: M.playAction, format: 'pct', better: 'none' },
		{ key: 'epa', label: 'EPA / play', expr: M.epa, format: 'epa', better: 'high' },
		{ key: 'success', label: 'Success', expr: M.success, format: 'pct', better: 'high' }
	];

	const personnel = (g: string) => `${g} personnel`;

	const meta = getMeta();
	const noFormation = $derived(withoutParticipation(meta, filters.seasons));
</script>

<section class="card view">
	<h2>Personnel & formation</h2>
	<p class="muted">
		What they line up in, and what they do from it. Grey numbers are the league in the same
		grouping.
	</p>
	<DataNote seasons={filters.seasons} what="Personnel" />
	<GroupTable
		{filters}
		side="offense"
		groupBy="off_personnel"
		groupLabel="Personnel"
		label={personnel}
		{columns}
		limit={8}
	/>

	<h3>QB alignment</h3>
	<GroupTable
		{filters}
		side="offense"
		groupBy={alignment(noFormation.length === 0)}
		groupLabel="Alignment"
		order={ALIGNMENTS}
		{columns}
	/>
	{#if noFormation.length}
		<p class="foot">
			Pistol can't be split from shotgun: {noFormation.join(', ')} has no formation data yet. Select only
			earlier seasons to see it on its own.
		</p>
	{/if}
</section>
