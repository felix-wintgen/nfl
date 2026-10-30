<script lang="ts">
	import { compare, M, type Compared } from '#lib/baseline.ts';
	import type { Filters, Side } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from './Loader.svelte';

	let { filters, side }: { filters: Filters; side: Side } = $props();

	const metrics = { epa: M.epa, success: M.success, ypp: M.ypp, explosive: M.explosive };
	const load = (f: Filters) => compare(metrics, f, side, { groupBy: 'is_pass' });

	// For a defense, lower is better on every metric here.
	function tone(c: Compared): string {
		if (c.rank === null) return '';
		const r = side === 'offense' ? c.rank : c.of - c.rank + 1;
		return r <= 8 ? 'good' : r > c.of - 8 ? 'bad' : '';
	}

	const cols = [
		['epa', 'EPA / play', epa],
		['success', 'Success', (v: number | null) => pct(v, 1)],
		['ypp', 'Yards / play', num],
		['explosive', 'Explosive', (v: number | null) => pct(v, 1)]
	] as const;

	const sum = (split: Map<unknown, Record<string, Compared>>, k: 'n' | 'leagueN') =>
		[...split.values()].reduce((s, r) => s + r.epa[k], 0);
</script>

<section class="card view">
	<h2>Run / pass split</h2>
	<p class="muted">
		{side === 'offense' ? 'Offense' : 'Defense, allowed'}; grey numbers are the league, colors mark
		top/bottom 8.
	</p>
	<Loader {filters} {load}>
		{#snippet children(split)}
			<table>
				<thead>
					<tr>
						<th>Play type</th>
						<th class="num">Plays</th>
						<th class="num">Share</th>
						{#each cols as [key, label] (key)}
							<th class="num">{label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each [[true, 'Pass'], [false, 'Run']] as const as [isPass, name] (name)}
						{@const r = split.get(isPass)}
						{#if r}
							<tr class:small-sample={r.epa.n < SMALL_SAMPLE}>
								<td>{name}</td>
								<td class="num">{r.epa.n}</td>
								<td class="num">
									{pct(r.epa.n / sum(split, 'n'))}<span class="league"
										>{pct(r.epa.leagueN / sum(split, 'leagueN'))}</span
									>
								</td>
								{#each cols as [key, , fmt] (key)}
									<td class="num">
										<span class={tone(r[key])}>{fmt(r[key].value)}</span><span class="league"
											>{fmt(r[key].league)}</span
										>
									</td>
								{/each}
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		{/snippet}
	</Loader>
</section>
