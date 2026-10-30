<script lang="ts">
	import { compare, M, type Compared } from '#lib/baseline.ts';
	import type { Filters, Side } from '#lib/filters.ts';
	import { epa, num, ordinal, pct, pp, SMALL_SAMPLE } from '#lib/format.ts';

	let { filters, side }: { filters: Filters; side: Side } = $props();

	const overallMetrics = { passRate: M.passRate, passOe: M.passOe, epa: M.epa, success: M.success };
	const splitMetrics = { epa: M.epa, success: M.success, ypp: M.ypp, explosive: M.explosive };

	type Result = {
		overall: Record<string, Compared>;
		split: Map<unknown, Record<string, Compared>>;
	};
	let result = $state<Result | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		const f = $state.snapshot(filters) as Filters;
		let stale = false;
		error = null;
		Promise.all([compare(overallMetrics, f, side), compare(splitMetrics, f, side, 'is_pass')])
			.then(([o, split]) => {
				if (!stale) result = { overall: o.get(null)!, split };
			})
			.catch((e) => {
				if (!stale) error = String(e);
			});
		return () => (stale = true);
	});

	// For a defense, lower EPA/success/yards allowed is better.
	const higherIsBetter = (metric: string) =>
		metric === 'passRate' || metric === 'passOe' ? null : side === 'offense';

	function rankLabel(c: Compared, metric: string): string {
		const hib = higherIsBetter(metric);
		if (c.rank === null) return '';
		const rank = hib === false ? c.of - c.rank + 1 : c.rank;
		return hib === null ? `${ordinal(rank)} highest` : `${ordinal(rank)} of ${c.of}`;
	}

	function tone(c: Compared, metric: string): string {
		const hib = higherIsBetter(metric);
		if (hib === null || c.rank === null) return '';
		const rank = hib ? c.rank : c.of - c.rank + 1;
		return rank <= 8 ? 'good' : rank > c.of - 8 ? 'bad' : '';
	}

	const unit = $derived(side === 'offense' ? 'offense' : 'defense (allowed)');
</script>

<section class="card">
	<h2>Run / pass split <span class="muted">· {unit}</span></h2>

	{#if error}
		<p class="error">{error}</p>
	{:else if !result}
		<p class="muted">Loading…</p>
	{:else}
		{@const o = result.overall}
		<div class="tiles" class:small-sample={o.epa.n < SMALL_SAMPLE}>
			{#each [['passRate', 'Pass rate', pct(o.passRate.value, 1), pct(o.passRate.league, 1)], ['passOe', 'Pass rate over expected', pp(o.passOe.value), pp(o.passOe.league)], ['epa', 'EPA / play', epa(o.epa.value), epa(o.epa.league)], ['success', 'Success rate', pct(o.success.value, 1), pct(o.success.league, 1)]] as [key, title, value, league] (key)}
				<div class="tile">
					<div class="title">{title}</div>
					<div class="value">{value}</div>
					<div class="sub">
						<span class={tone(o[key], key)}>{rankLabel(o[key], key)}</span>
						<span class="muted">· league {league}</span>
					</div>
				</div>
			{/each}
		</div>

		<table>
			<thead>
				<tr>
					<th>Play type</th>
					<th class="num">Plays</th>
					<th class="num">Share</th>
					<th class="num">EPA / play</th>
					<th class="num">Success</th>
					<th class="num">Yards / play</th>
					<th class="num">Explosive</th>
				</tr>
			</thead>
			<tbody>
				{#each [[true, 'Pass'], [false, 'Run']] as const as [isPass, name] (name)}
					{@const r = result.split.get(isPass)}
					{#if r}
						<tr class:small-sample={r.epa.n < SMALL_SAMPLE}>
							<td>{name}</td>
							<td class="num">{r.epa.n}</td>
							<td class="num">{pct(r.epa.n / o.epa.n)}</td>
							{#each [['epa', epa], ['success', (v: number | null) => pct(v, 1)], ['ypp', num], ['explosive', (v: number | null) => pct(v, 1)]] as const as [key, fmt] (key)}
								<td class="num">
									<span class={tone(r[key], key)}>{fmt(r[key].value)}</span>
									<span class="muted league">{fmt(r[key].league)}</span>
								</td>
							{/each}
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
		<p class="muted note">
			{o.epa.n} plays. Grey second numbers are the league under the same situation filters; colors mark
			top/bottom 8.
		</p>
	{/if}
</section>

<style>
	h2 {
		margin-top: 0;
		font-size: 1.1rem;
	}
	h2 span {
		font-weight: 400;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.tile {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
	}
	.title {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.value {
		font-size: 1.5rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.sub {
		font-size: 0.8rem;
	}
	.league {
		font-size: 0.8rem;
		margin-left: 0.35rem;
	}
	.good {
		color: var(--good);
	}
	.bad {
		color: var(--bad);
	}
	.note {
		font-size: 0.8rem;
	}
	.error {
		color: var(--bad);
	}
</style>
