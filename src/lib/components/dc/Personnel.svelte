<script lang="ts">
	import { ALIGNMENT, M } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
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
		groupBy={ALIGNMENT}
		groupLabel="Alignment"
		order={['shotgun', 'pistol', 'under center']}
		{columns}
	/>
	<p class="foot">Pistol is folded into shotgun for seasons without participation data.</p>
</section>
