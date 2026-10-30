<script lang="ts">
	import { M } from '#lib/baseline.ts';
	import IdentityCard, { type IdentityItem } from '#lib/components/IdentityCard.svelte';
	import RunPassSplit from '#lib/components/RunPassSplit.svelte';
	import Scout from '#lib/components/Scout.svelte';

	// M4 adds packages, coverage and pressure; lower is better for a defense.
	const identity: IdentityItem[] = [
		{ key: 'epa', label: 'EPA / play allowed', expr: M.epa, format: 'epa', better: 'low' },
		{ key: 'success', label: 'Success allowed', expr: M.success, format: 'pct', better: 'low' },
		{
			key: 'explosive',
			label: 'Explosive allowed',
			expr: M.explosive,
			format: 'pct',
			better: 'low'
		},
		{ key: 'passRate', label: 'Pass rate faced', expr: M.passRate, format: 'pct', better: 'none' }
	];
</script>

<Scout side="defense" title="OC helper" question="What am I expecting?">
	{#snippet children(filters)}
		<IdentityCard {filters} side="defense" items={identity} />
		<RunPassSplit {filters} side="defense" />
	{/snippet}
</Scout>
