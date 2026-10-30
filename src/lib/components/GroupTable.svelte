<script lang="ts" module>
	export interface Column {
		key: string;
		label: string;
		expr: string;
		format: 'pct' | 'epa' | 'num';
		/** 'none' colors by above/below league instead of good/bad. */
		better: 'high' | 'low' | 'none';
	}
</script>

<script lang="ts">
	import { compare, type Compared } from '#lib/baseline.ts';
	import type { Filters, Side } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from './Loader.svelte';

	// One row per group with usage share and per-group metrics, each next to
	// the league value for the same group.
	let {
		filters,
		side,
		groupBy,
		groupLabel,
		columns,
		extra = [],
		order,
		limit = 10,
		label = (g: string) => g
	}: {
		filters: Filters;
		side: Side;
		groupBy: string;
		groupLabel: string;
		columns: Column[];
		extra?: string[];
		/** Fixed row order; default is by team usage. */
		order?: readonly string[];
		limit?: number;
		label?: (g: string) => string;
	} = $props();

	const load = (f: Filters) =>
		compare(Object.fromEntries(columns.map((c) => [c.key, c.expr])), f, side, {
			groupBy,
			extra: [...extra, `(${groupBy}) IS NOT NULL`]
		});

	function rows(res: Map<unknown, Record<string, Compared>>) {
		const all = [...res.entries()].map(([g, r]) => ({ g: String(g), r, n: r[columns[0].key].n }));
		const teamTotal = all.reduce((s, x) => s + x.n, 0);
		const leagueTotal = all.reduce((s, x) => s + x.r[columns[0].key].leagueN, 0);
		const sorted = order
			? order.map((o) => all.find((x) => x.g === o)).filter((x) => x !== undefined)
			: all.filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
		return {
			teamTotal,
			list: sorted.slice(0, limit).map((x) => ({
				...x,
				share: teamTotal ? x.n / teamTotal : null,
				leagueShare: leagueTotal ? x.r[columns[0].key].leagueN / leagueTotal : null
			}))
		};
	}

	const fmt = (c: Column, v: number | null) =>
		c.format === 'pct' ? pct(v, 1) : c.format === 'epa' ? epa(v) : num(v);

	function tone(c: Column, r: Compared): string {
		if (r.value === null || r.league === null || r.n < SMALL_SAMPLE) return '';
		const d = r.value - r.league;
		if (c.better === 'none') return '';
		const good = c.better === 'high' ? d > 0 : d < 0;
		const big = Math.abs(d) >= (c.format === 'pct' ? 0.05 : c.format === 'epa' ? 0.1 : 0.5);
		return big ? (good ? 'good' : 'bad') : '';
	}

	// Usage bar: team share, with a tick at the league share.
	const W = 120;
</script>

<Loader {filters} {load}>
	{#snippet children(res)}
		{@const t = rows(res)}
		{#if t.list.length === 0}
			<p class="muted">No plays.</p>
		{:else}
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>{groupLabel}</th>
							<th class="num">Plays</th>
							<th>Usage <span class="muted">(tick = league)</span></th>
							{#each columns as c (c.key)}
								<th class="num">{c.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each t.list as row (row.g)}
							<tr class:small-sample={row.n < SMALL_SAMPLE}>
								<td>{label(row.g)}</td>
								<td class="num">{row.n}</td>
								<td>
									<span class="usage">
										<svg width={W} height="12" aria-hidden="true">
											<rect width={W} height="12" rx="2" class="track" />
											<rect width={(row.share ?? 0) * W} height="12" rx="2" class="bar" />
											{#if row.leagueShare !== null}
												<rect x={row.leagueShare * W - 1} width="2" height="12" class="tick" />
											{/if}
										</svg>
										{pct(row.share)}<span class="league">{pct(row.leagueShare)}</span>
									</span>
								</td>
								{#each columns as c (c.key)}
									{@const r = row.r[c.key]}
									<td class="num">
										<span class={tone(c, r)}>{fmt(c, r.value)}</span><span class="league"
											>{fmt(c, r.league)}</span
										>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/snippet}
</Loader>

<style>
	.usage {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
	}
	.track {
		fill: var(--line);
	}
	.bar {
		fill: var(--accent);
	}
	.tick {
		fill: var(--fg);
	}
</style>
