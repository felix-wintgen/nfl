<script lang="ts">
	import { M } from '#lib/baseline.ts';
	import IdentityCard, { type IdentityItem } from '#lib/components/IdentityCard.svelte';
	import RunPassSplit from '#lib/components/RunPassSplit.svelte';
	import Scout from '#lib/components/Scout.svelte';
	import PassGame from '#lib/components/dc/PassGame.svelte';
	import Personnel from '#lib/components/dc/Personnel.svelte';
	import RunGame from '#lib/components/dc/RunGame.svelte';
	import Tells from '#lib/components/dc/Tells.svelte';
	import TendencyGrid from '#lib/components/dc/TendencyGrid.svelte';

	const identity: IdentityItem[] = [
		{ key: 'epa', label: 'EPA / play', expr: M.epa, format: 'epa', better: 'high' },
		{ key: 'success', label: 'Success rate', expr: M.success, format: 'pct', better: 'high' },
		{
			key: 'explosive',
			label: 'Explosive rate',
			expr: M.explosive,
			format: 'pct',
			better: 'high',
			hint: 'Passes of 20+ and runs of 12+ yards'
		},
		{
			key: 'passOe',
			label: 'Pass rate over expected',
			expr: M.passOe,
			format: 'pp',
			better: 'none',
			hint: 'Actual pass rate minus the nflfastR expected pass rate for the situation'
		},
		{
			key: 'earlyPass',
			label: 'Early-down pass rate',
			expr: M.earlyPass,
			format: 'pct',
			better: 'none',
			hint: '1st and 2nd down, win probability 20–80%, outside the two-minute drill'
		},
		{ key: 'motion', label: 'Motion rate', expr: M.motion, format: 'pct', better: 'none' },
		{
			key: 'playAction',
			label: 'Play action (of dropbacks)',
			expr: M.playAction,
			format: 'pct',
			better: 'none'
		},
		{ key: 'noHuddle', label: 'No-huddle rate', expr: M.noHuddle, format: 'pct', better: 'none' },
		{
			key: 'goRate',
			label: '4th & ≤2 go rate',
			expr: 'avg(went_for_it::INT)',
			format: 'pct',
			better: 'none',
			opts: { table: 'fourth_downs', extra: ['ydstogo <= 2', 'yardline_100 < 70'] },
			hint: '4th and 2 or less, outside their own 30'
		}
	];
</script>

<Scout side="offense" title="DC helper" question="What am I facing?">
	{#snippet children(filters)}
		<IdentityCard {filters} side="offense" items={identity} />
		<Tells {filters} />
		<Personnel {filters} />
		<TendencyGrid {filters} />
		<!-- Left off the printed game sheet to keep it to about two pages. -->
		<div class="no-print">
			<RunPassSplit {filters} side="offense" />
			<RunGame {filters} />
			<PassGame {filters} />
		</div>
	{/snippet}
</Scout>
