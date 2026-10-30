<script lang="ts">
	import { coverageLabel, D, M } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import DataNote from '../DataNote.svelte';
	import type { Column } from '../GroupTable.svelte';
	import SituationMix from '../SituationMix.svelte';

	let { filters }: { filters: Filters } = $props();

	const SHOWN = ['COVER_0', 'COVER_1', '2_MAN', 'COVER_2', 'COVER_3', 'COVER_4', 'COVER_6'];
	const categories = SHOWN.map((c) => ({ key: c, label: coverageLabel(c) }));

	const metrics: Column[] = [
		{ key: 'man', label: 'Man', expr: D.man, format: 'pct', better: 'none' },
		{ key: 'epa', label: 'EPA allowed', expr: M.epa, format: 'epa', better: 'low' }
	];
</script>

<section class="card view">
	<h2>Coverage mix</h2>
	<p class="muted">
		Share of dropbacks in each coverage by situation (league in grey; orange = more than the
		league). Cover 9, combo and blown coverages count toward the totals but aren't shown.
	</p>
	<DataNote seasons={filters.seasons} what="Coverage" />
	<SituationMix
		{filters}
		side="defense"
		category="coverage"
		{categories}
		{metrics}
		extra={['is_pass', 'coverage IS NOT NULL']}
	/>
</section>
