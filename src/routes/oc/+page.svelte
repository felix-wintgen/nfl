<script lang="ts">
	import { D, M } from '#lib/baseline.ts';
	import IdentityCard, { type IdentityItem } from '#lib/components/IdentityCard.svelte';
	import RunPassSplit from '#lib/components/RunPassSplit.svelte';
	import Scout from '#lib/components/Scout.svelte';
	import Coverage from '#lib/components/oc/Coverage.svelte';
	import Packages from '#lib/components/oc/Packages.svelte';
	import Pressure from '#lib/components/oc/Pressure.svelte';
	import WhatWorks from '#lib/components/oc/WhatWorks.svelte';

	// Ranked from the defense's point of view: "3rd of 32" is a strong unit.
	const identity: IdentityItem[] = [
		{ key: 'epa', label: 'EPA / play allowed', expr: M.epa, format: 'epa', better: 'low' },
		{ key: 'success', label: 'Success allowed', expr: M.success, format: 'pct', better: 'low' },
		{
			key: 'explosive',
			label: 'Explosive allowed',
			expr: M.explosive,
			format: 'pct',
			better: 'low',
			hint: 'Passes of 20+ and runs of 12+ yards'
		},
		{ key: 'pressure', label: 'Pressure rate', expr: D.pressure, format: 'pct', better: 'high' },
		{ key: 'sack', label: 'Sack rate', expr: D.sack, format: 'pct', better: 'high' },
		{ key: 'int', label: 'INT rate', expr: D.int, format: 'pct', better: 'high' },
		{
			key: 'blitz',
			label: 'Blitz rate',
			expr: D.blitz,
			format: 'pct',
			better: 'none',
			hint: '5 or more pass rushers'
		},
		{ key: 'man', label: 'Man coverage', expr: D.man, format: 'pct', better: 'none' },
		{
			key: 'boxRun',
			label: 'Box vs. the run',
			expr: D.boxRun,
			format: 'num',
			better: 'none',
			hint: 'Average defenders in the box on designed runs'
		},
		{ key: 'passRate', label: 'Pass rate faced', expr: M.passRate, format: 'pct', better: 'none' }
	];

	const third: IdentityItem[] = [
		{
			key: 'conv',
			label: 'Conversion allowed',
			expr: D.firstDown,
			format: 'pct',
			better: 'low',
			hint: 'First downs or touchdowns on 3rd down'
		},
		{ key: 'epa', label: 'EPA / play allowed', expr: M.epa, format: 'epa', better: 'low' },
		{ key: 'pressure', label: 'Pressure rate', expr: D.pressure, format: 'pct', better: 'high' },
		{ key: 'blitz', label: 'Blitz rate', expr: D.blitz, format: 'pct', better: 'none' },
		{ key: 'man', label: 'Man coverage', expr: D.man, format: 'pct', better: 'none' },
		{ key: 'rushers', label: 'Avg. rushers', expr: D.rushers, format: 'num', better: 'none' }
	].map((i) => ({ ...i, opts: { extra: ['down = 3'] } })) as IdentityItem[];

	const redZone: IdentityItem[] = [
		{
			key: 'td',
			label: 'TD rate allowed',
			expr: D.td,
			format: 'pct',
			better: 'low',
			hint: 'Per play'
		},
		{ key: 'epa', label: 'EPA / play allowed', expr: M.epa, format: 'epa', better: 'low' },
		{ key: 'success', label: 'Success allowed', expr: M.success, format: 'pct', better: 'low' },
		{ key: 'blitz', label: 'Blitz rate', expr: D.blitz, format: 'pct', better: 'none' },
		{ key: 'man', label: 'Man coverage', expr: D.man, format: 'pct', better: 'none' },
		{ key: 'passRate', label: 'Pass rate faced', expr: M.passRate, format: 'pct', better: 'none' }
	].map((i) => ({
		...i,
		opts: { extra: ["field_zone IN ('red zone', 'goal to go')"] }
	})) as IdentityItem[];
</script>

<Scout side="defense" title="OC helper" question="What am I expecting?">
	{#snippet children(filters)}
		<IdentityCard {filters} side="defense" items={identity} />
		<Packages {filters} />
		<Coverage {filters} />
		<Pressure {filters} />
		<div class="pair">
			<IdentityCard
				{filters}
				side="defense"
				items={third}
				title="On 3rd down"
				subtitle="3rd downs only, ranked among all defenses."
			/>
			<IdentityCard
				{filters}
				side="defense"
				items={redZone}
				title="In the red zone"
				subtitle="Inside their 20, ranked among all defenses."
			/>
		</div>
		<!-- Left off the printed game sheet to keep it to about two pages. -->
		<div class="no-print">
			<WhatWorks {filters} />
			<RunPassSplit {filters} side="defense" />
		</div>
	{/snippet}
</Scout>

<style>
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
		gap: 0 1.25rem;
	}
</style>
