<script lang="ts" module>
	import type { CompareOptions } from '#lib/baseline.ts';

	export interface IdentityItem {
		key: string;
		label: string;
		expr: string;
		format: 'pct' | 'pp' | 'epa' | 'num';
		/** Which direction is good for the scouted unit; 'none' for pure tendencies. */
		better: 'high' | 'low' | 'none';
		/** Query options (e.g. the fourth_downs table); items sharing them run in one query. */
		opts?: CompareOptions;
		hint?: string;
	}
</script>

<script lang="ts">
	import { compare, type Compared } from '#lib/baseline.ts';
	import type { Filters, Side } from '#lib/filters.ts';
	import { epa, num, ordinal, pct, pp, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from './Loader.svelte';

	let {
		filters,
		side,
		items,
		title = 'Identity',
		subtitle = 'Ranks are among all 32 teams under the same filters.'
	}: {
		filters: Filters;
		side: Side;
		items: IdentityItem[];
		title?: string;
		subtitle?: string;
	} = $props();

	async function load(f: Filters): Promise<Record<string, Compared>> {
		const groups = new Map<string, IdentityItem[]>();
		for (const it of items) {
			const k = JSON.stringify(it.opts ?? {});
			groups.set(k, [...(groups.get(k) ?? []), it]);
		}
		const results = await Promise.all(
			[...groups.values()].map((its) =>
				compare(Object.fromEntries(its.map((i) => [i.key, i.expr])), f, side, its[0].opts)
			)
		);
		return Object.assign({}, ...results.map((r) => r.get(null) ?? {}));
	}

	const fmt = (i: IdentityItem, v: number | null) =>
		i.format === 'pct'
			? pct(v, 1)
			: i.format === 'pp'
				? pp(v)
				: i.format === 'num'
					? num(v, 2)
					: epa(v);

	function rank(i: IdentityItem, c: Compared): { label: string; tone: string } {
		if (c.rank === null) return { label: '', tone: '' };
		if (i.better === 'none') return { label: `${ordinal(c.rank)} highest`, tone: '' };
		const r = i.better === 'high' ? c.rank : c.of - c.rank + 1;
		return {
			label: `${ordinal(r)} of ${c.of}`,
			tone: r <= 8 ? 'good' : r > c.of - 8 ? 'bad' : ''
		};
	}
</script>

<section class="card view">
	<h2>{title}</h2>
	<p class="muted">{subtitle}</p>
	<Loader {filters} {load}>
		{#snippet children(res)}
			<div class="tiles">
				{#each items as i (i.key)}
					{@const c = res[i.key]}
					{#if c}
						{@const r = rank(i, c)}
						<div class="tile" class:small-sample={c.n < SMALL_SAMPLE} title={i.hint}>
							<div class="title">{i.label}</div>
							<div class="value">{fmt(i, c.value)}</div>
							<div class="sub">
								<span class={r.tone}>{r.label}</span>
								<span class="muted">· league {fmt(i, c.league)}</span>
							</div>
						</div>
					{/if}
				{/each}
			</div>
			{#if items.some((i) => res[i.key]?.value === null)}
				<p class="foot">
					– means no data under these filters. Pressure and coverage come from NGS participation
					data, which nflverse hasn't published for every season yet.
				</p>
			{/if}
		{/snippet}
	</Loader>
</section>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
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
		font-size: 1.4rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.sub {
		font-size: 0.78rem;
	}
</style>
