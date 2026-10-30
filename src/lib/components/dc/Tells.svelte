<script lang="ts">
	import { getMeta } from '#lib/context.ts';
	import type { Filters } from '#lib/filters.ts';
	import { pct } from '#lib/format.ts';
	import { withoutParticipation } from '#lib/meta.ts';
	import { describe, loadTells, MIN_GAP, SHRINK_PLAYS } from '#lib/tells.ts';
	import DataNote from '../DataNote.svelte';
	import Loader from '../Loader.svelte';

	let { filters }: { filters: Filters } = $props();

	const meta = getMeta();
	const load = (f: Filters) => loadTells(f, withoutParticipation(meta, f.seasons).length === 0);
</script>

<section class="card view">
	<h2>Tells</h2>
	<p class="muted">
		Where their run/pass mix is most predictable compared to the league in the same situation. Each
		rate is blended with {SHRINK_PLAYS} league-average plays, so a short streak can't pass for a habit.
		Shown when at least {Math.round(MIN_GAP * 100)} points from the league.
	</p>
	<DataNote seasons={filters.seasons} what="Personnel tells" />
	<Loader {filters} {load}>
		{#snippet children(tells)}
			{#if tells.length === 0}
				<p class="muted">
					Nothing stands out under these filters. Small samples rarely do: try adding the previous
					season.
				</p>
			{:else}
				<ol>
					{#each tells as t (describe(t))}
						<!-- Phrase each tell in the direction it leans compared to the league. -->
						{@const pass = t.expected > t.leaguePassRate}
						<li>
							<span class="when">{describe(t)}</span>
							<span class="arrow">→</span>
							<strong class:pass class:run={!pass}>
								expect {pass ? 'pass' : 'run'}
								{pct(pass ? t.expected : 1 - t.expected)}
							</strong>
							<span class="muted">
								league {pct(pass ? t.leaguePassRate : 1 - t.leaguePassRate)} · raw
								{pct(pass ? t.passRate : 1 - t.passRate)} on n={t.n}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		{/snippet}
	</Loader>
</section>

<style>
	ol {
		margin: 0.75rem 0 0;
		padding-left: 1.5rem;
		display: grid;
		gap: 0.4rem;
	}
	.when {
		font-weight: 500;
	}
	.arrow {
		color: var(--muted);
		margin: 0 0.3rem;
	}
	strong {
		font-variant-numeric: tabular-nums;
		margin-right: 0.4rem;
	}
	.pass {
		color: var(--more-text);
	}
	.run {
		color: var(--less-text);
	}
</style>
