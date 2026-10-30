<script lang="ts">
	import { D, M } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import type { Column } from '../GroupTable.svelte';
	import SituationMix from '../SituationMix.svelte';

	let { filters }: { filters: Filters } = $props();

	const RUSH = `CASE WHEN ftn_pass_rushers <= 3 THEN 'drop' WHEN ftn_pass_rushers = 4 THEN '4'
		WHEN ftn_pass_rushers = 5 THEN '5' ELSE '6+' END`;
	const categories = [
		{ key: 'drop', label: '≤3 (drop 8)' },
		{ key: '4', label: '4' },
		{ key: '5', label: '5' },
		{ key: '6+', label: '6+' }
	];

	// Colored from the defense's point of view, like the identity card.
	const metrics: Column[] = [
		{ key: 'pressure', label: 'Pressure', expr: D.pressure, format: 'pct', better: 'high' },
		{ key: 'sack', label: 'Sack', expr: D.sack, format: 'pct', better: 'high' },
		{ key: 'epa', label: 'EPA allowed', expr: M.epa, format: 'epa', better: 'low' }
	];
</script>

<section class="card view">
	<h2>Pressure profile</h2>
	<p class="muted">
		How many they rush on dropbacks, by situation (league in grey). 5+ rushers counts as a blitz.
		Pressure comes from NGS participation data, so it is blank for seasons nflverse has not
		published it for yet.
	</p>
	<SituationMix
		{filters}
		side="defense"
		category={RUSH}
		{categories}
		{metrics}
		extra={['is_pass', 'ftn_pass_rushers IS NOT NULL']}
	/>
</section>
