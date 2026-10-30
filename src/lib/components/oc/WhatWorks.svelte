<script lang="ts">
	import { COVERAGES, coverageLabel, D, M, RUN_LANE, RUN_LANES } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import DataNote from '../DataNote.svelte';
	import GroupTable, { type Column } from '../GroupTable.svelte';

	let { filters }: { filters: Filters } = $props();

	// Colored from YOUR offense's point of view: green = it works against them.
	const pass: Column[] = [
		{ key: 'epa', label: 'EPA / play', expr: M.epa, format: 'epa', better: 'high' },
		{ key: 'success', label: 'Success', expr: M.success, format: 'pct', better: 'high' },
		{ key: 'comp', label: 'Completion', expr: D.comp, format: 'pct', better: 'high' },
		{ key: 'explosive', label: 'Explosive', expr: M.explosive, format: 'pct', better: 'high' }
	];
	const run: Column[] = [
		{ key: 'ypc', label: 'Yards / carry', expr: M.ypp, format: 'num', better: 'high' },
		{ key: 'success', label: 'Success', expr: M.success, format: 'pct', better: 'high' },
		{ key: 'epa', label: 'EPA / play', expr: M.epa, format: 'epa', better: 'high' }
	];

	const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

	let tab = $state<'coverage' | 'route' | 'concept' | 'depth' | 'run'>('coverage');
	const tabs = [
		['coverage', 'By coverage'],
		['route', 'By route'],
		['concept', 'Play action & motion'],
		['depth', 'By depth'],
		['run', 'Run lanes']
	] as const;
</script>

<section class="card view">
	<h2>What works against them</h2>
	<p class="muted">
		Results against this defense compared to the league. Green means it works for <em>your</em>
		offense (they allow more than the league), red means it doesn't.
	</p>
	<div class="toggle" role="group" aria-label="Breakdown">
		{#each tabs as [k, label] (k)}
			<button type="button" aria-pressed={tab === k} onclick={() => (tab = k)}>{label}</button>
		{/each}
	</div>

	<div class="body">
		{#if tab === 'coverage'}
			<DataNote seasons={filters.seasons} what="Coverage" />
			<GroupTable
				{filters}
				side="defense"
				groupBy="coverage"
				groupLabel="Coverage"
				order={COVERAGES}
				label={coverageLabel}
				columns={pass}
				extra={['is_pass']}
			/>
		{:else if tab === 'route'}
			<DataNote seasons={filters.seasons} what="Routes" />
			<GroupTable
				{filters}
				side="defense"
				groupBy="route"
				groupLabel="Targeted route"
				label={title}
				columns={pass}
				extra={['is_pass']}
				limit={14}
			/>
		{:else if tab === 'concept'}
			<GroupTable
				{filters}
				side="defense"
				groupBy={"CASE WHEN is_play_action THEN 'play action' ELSE 'straight dropback' END"}
				groupLabel="Dropbacks"
				order={['play action', 'straight dropback']}
				columns={pass}
				extra={['is_pass', 'is_play_action IS NOT NULL']}
			/>
			<h3>Motion (all plays)</h3>
			<GroupTable
				{filters}
				side="defense"
				groupBy={"CASE WHEN is_motion THEN 'motion' ELSE 'no motion' END"}
				groupLabel="Pre-snap"
				order={['motion', 'no motion']}
				columns={pass.filter((c) => c.key !== 'comp')}
				extra={['is_motion IS NOT NULL']}
			/>
		{:else if tab === 'depth'}
			<GroupTable
				{filters}
				side="defense"
				groupBy="pass_depth || ' ' || pass_dir"
				groupLabel="Throw"
				columns={pass}
				extra={['is_pass']}
				limit={12}
			/>
		{:else}
			<GroupTable
				{filters}
				side="defense"
				groupBy={RUN_LANE}
				groupLabel="Run lane"
				order={RUN_LANES}
				columns={run}
				extra={['NOT is_pass']}
			/>
		{/if}
	</div>
</section>

<style>
	.body {
		margin-top: 0.75rem;
	}
</style>
