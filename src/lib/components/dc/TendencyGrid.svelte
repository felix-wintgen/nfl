<script lang="ts">
	import { compare, M, type Compared } from '#lib/baseline.ts';
	import { DIST_BUCKETS, DOWNS, FIELD_ZONES, type Filters } from '#lib/filters.ts';
	import { epa, ordinal, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from '../Loader.svelte';

	let { filters }: { filters: Filters } = $props();

	const metrics = [
		{ key: 'pass', label: 'Pass rate', expr: M.passRate },
		{ key: 'pa', label: 'Play action', expr: M.playAction },
		{ key: 'screen', label: 'Screen', expr: M.screen },
		{ key: 'rpo', label: 'RPO', expr: M.rpo },
		{ key: 'motion', label: 'Motion', expr: M.motion },
		{ key: 'epa', label: 'EPA / play', expr: M.epa }
	] as const;
	type Key = (typeof metrics)[number]['key'];

	const layouts = {
		dist: {
			label: 'Down × distance',
			rowExpr: 'down',
			colExpr: 'dist_bucket',
			rows: DOWNS.map((d) => [String(d), `${ordinal(d)} down`]),
			cols: DIST_BUCKETS.map((d) => [d, `${d} yds`])
		},
		zone: {
			label: 'Field zone × down',
			rowExpr: 'field_zone',
			colExpr: 'down',
			rows: FIELD_ZONES.map((z) => [z, z]),
			cols: DOWNS.map((d) => [String(d), `${ordinal(d)} down`])
		}
	} as const;

	let metric = $state<Key>('pass');
	let layout = $state<keyof typeof layouts>('dist');
	const L = $derived(layouts[layout]);

	const load = (f: Filters) =>
		compare(Object.fromEntries(metrics.map((m) => [m.key, m.expr])), f, 'offense', {
			groupBy: `${L.rowExpr}::VARCHAR || '|' || ${L.colExpr}::VARCHAR`
		});

	const fmt = (v: number | null) => (metric === 'epa' ? epa(v) : pct(v));

	// Cell color: above (orange) or below (blue) league, strength by distance.
	function shade(c: Compared | undefined): string {
		if (!c || c.value === null || c.league === null || c.n < SMALL_SAMPLE) return 'transparent';
		const scale = metric === 'epa' ? 0.4 : 0.25;
		const d = Math.max(-1, Math.min(1, (c.value - c.league) / scale));
		const rgb = d >= 0 ? 'var(--more)' : 'var(--less)';
		return `rgb(${rgb} / ${(Math.abs(d) * 0.4).toFixed(2)})`;
	}
</script>

<section class="card view">
	<h2>Situational tendencies</h2>
	<p class="muted">
		Orange is more than the league in the same cell, blue is less. Play action and screen are shares
		of dropbacks.
	</p>
	<div class="controls">
		<div class="toggle" role="group" aria-label="Metric">
			{#each metrics as m (m.key)}
				<button type="button" aria-pressed={metric === m.key} onclick={() => (metric = m.key)}
					>{m.label}</button
				>
			{/each}
		</div>
		<div class="toggle" role="group" aria-label="Layout">
			{#each Object.entries(layouts) as [k, l] (k)}
				<button
					type="button"
					aria-pressed={layout === k}
					onclick={() => (layout = k as keyof typeof layouts)}>{l.label}</button
				>
			{/each}
		</div>
	</div>

	{#key layout}
		<Loader {filters} {load}>
			{#snippet children(res)}
				<div class="scroll">
					<table class="grid">
						<thead>
							<tr>
								<th></th>
								{#each L.cols as [, colLabel] (colLabel)}
									<th class="num">{colLabel}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each L.rows as [row, rowLabel] (row)}
								<tr>
									<th scope="row">{rowLabel}</th>
									{#each L.cols as [col] (col)}
										{@const c = res.get(`${row}|${col}`)?.[metric]}
										<td
											class="num"
											class:small-sample={!c || c.n < SMALL_SAMPLE}
											style:background={shade(c)}
										>
											{#if c && c.n > 0}
												<div class="v">{fmt(c.value)}</div>
												<div class="l">lg {fmt(c.league)} · n={c.n}</div>
											{:else}
												<div class="l">–</div>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/snippet}
		</Loader>
	{/key}
</section>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		margin: 0.75rem 0;
	}
	.grid td {
		border: 1px solid var(--line);
		min-width: 6rem;
	}
	.grid th[scope='row'] {
		white-space: nowrap;
	}
	.v {
		font-size: 1.05rem;
		font-weight: 600;
	}
	.l {
		font-size: 0.72rem;
		color: var(--muted-strong);
	}
</style>
