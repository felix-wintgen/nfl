<script lang="ts">
	import type { Column } from './GroupTable.svelte';
	import type { Filters, Side } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import { loadMix, SITUATIONS, type MetricRow, type MixRow } from '#lib/situations.ts';
	import Loader from './Loader.svelte';

	// Rows: fixed situations. Columns: share of each category (team, league in
	// grey, heat = difference), then per-situation metrics vs. league.
	let {
		filters,
		side,
		category,
		categories,
		metrics = [],
		extra = []
	}: {
		filters: Filters;
		side: Side;
		category: string;
		categories: { key: string; label: string }[];
		metrics?: Column[];
		extra?: string[];
	} = $props();

	const load = (f: Filters) =>
		loadMix(f, side, category, Object.fromEntries(metrics.map((m) => [m.key, m.expr])), extra);

	function table(mix: MixRow[], rows: MetricRow[]) {
		return SITUATIONS.map((s) => {
			const inS = mix.filter((m) => m.sit === s.key);
			const tn = inS.reduce((a, m) => a + m.tn, 0);
			const ln = inS.reduce((a, m) => a + m.ln, 0);
			const shares = categories.map((c) => {
				const m = inS.find((x) => x.cat === c.key);
				return {
					key: c.key,
					team: tn && m ? m.tn / tn : tn ? 0 : null,
					league: ln && m ? m.ln / ln : ln ? 0 : null
				};
			});
			const team = rows.find((r) => r.sit === s.key && r.is_team === true && !r.league);
			const league = rows.find((r) => r.sit === s.key && r.league);
			return { ...s, tn, shares, team, league };
		});
	}

	// Small samples stay unshaded: they're shown muted and shouldn't stand out.
	function shade(team: number | null, league: number | null, n: number): string {
		if (team === null || league === null || n < SMALL_SAMPLE) return 'transparent';
		const d = Math.max(-1, Math.min(1, (team - league) / Math.max(league, 0.08)));
		return `rgb(${d >= 0 ? 'var(--more)' : 'var(--less)'} / ${(Math.abs(d) * 0.4).toFixed(2)})`;
	}

	const fmt = (c: Column, v: number | null | undefined) =>
		v === undefined ? '–' : c.format === 'pct' ? pct(v) : c.format === 'epa' ? epa(v) : num(v);

	function tone(c: Column, t: number | null | undefined, l: number | null | undefined, n: number) {
		if (c.better === 'none' || t == null || l == null || n < SMALL_SAMPLE) return '';
		const d = t - l;
		const big = Math.abs(d) >= (c.format === 'pct' ? 0.05 : c.format === 'epa' ? 0.1 : 0.5);
		return big ? ((c.better === 'high') === d > 0 ? 'good' : 'bad') : '';
	}
</script>

<Loader {filters} {load}>
	{#snippet children(res)}
		<div class="scroll">
			<table class="mix">
				<thead>
					<tr>
						<th>Situation</th>
						<th class="num">Plays</th>
						{#each categories as c (c.key)}
							<th class="num">{c.label}</th>
						{/each}
						{#each metrics as m (m.key)}
							<th class="num metric">{m.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each table(res.mix, res.metrics) as row (row.key)}
						<tr class:small-sample={row.tn < SMALL_SAMPLE}>
							<th scope="row">{row.label}</th>
							<td class="num">{row.tn}</td>
							{#each row.shares as s (s.key)}
								<td class="num cell" style:background={shade(s.team, s.league, row.tn)}>
									{pct(s.team)}<span class="league">{pct(s.league)}</span>
								</td>
							{/each}
							{#each metrics as m (m.key)}
								<td class="num metric">
									<span class={tone(m, row.team?.[m.key], row.league?.[m.key], row.tn)}
										>{fmt(m, row.team?.[m.key])}</span
									><span class="league">{fmt(m, row.league?.[m.key])}</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/snippet}
</Loader>

<style>
	.mix th[scope='row'] {
		white-space: nowrap;
		color: var(--fg);
		font-size: 0.85rem;
		font-weight: 500;
	}
	.cell {
		white-space: nowrap;
	}
	.cell .league {
		color: var(--muted-strong);
	}
	.metric {
		border-left: 1px solid var(--line);
		white-space: nowrap;
	}
</style>
