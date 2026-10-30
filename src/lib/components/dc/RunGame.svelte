<script lang="ts">
	import { compare, M, RUN_LANE, RUN_LANES, teamQuery } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from '../Loader.svelte';

	let { filters }: { filters: Filters } = $props();

	const runs = ['NOT is_pass'];

	const loadLanes = (f: Filters) =>
		compare({ ypc: M.ypp, success: M.success, epa: M.epa }, f, 'offense', {
			groupBy: RUN_LANE,
			extra: [...runs, `(${RUN_LANE}) IS NOT NULL`]
		});

	type Rusher = {
		id: string;
		name: string;
		carries: number;
		share: number;
		ypc: number;
		success: number;
		epa: number;
	};
	const loadRushers = (f: Filters) =>
		teamQuery<Rusher>(
			f,
			'offense',
			[...runs, 'rusher_player_id IS NOT NULL'],
			(w) => `
			SELECT rusher_player_id AS id, any_value(rusher_player_name) AS name, count(*) AS carries,
			       count(*) / sum(count(*)) OVER () AS share, avg(yards_gained) AS ypc,
			       avg(success::INT) AS success, avg(epa) AS epa
			FROM plays ${w} GROUP BY rusher_player_id ORDER BY carries DESC LIMIT 6`
		);

	const H = 70;
</script>

<section class="card view">
	<h2>Run game</h2>
	<p class="muted">
		Where designed runs go (scrambles excluded), left to right from the offense's view. Bars are
		their share of runs; the tick is the league.
	</p>
	<Loader {filters} load={loadLanes}>
		{#snippet children(res)}
			{@const lanes = RUN_LANES.map((l) => ({ lane: l, r: res.get(l) }))}
			{@const total = lanes.reduce((s, x) => s + (x.r?.ypc.n ?? 0), 0)}
			{@const leagueTotal = lanes.reduce((s, x) => s + (x.r?.ypc.leagueN ?? 0), 0)}
			{@const max = Math.max(
				0.01,
				...lanes.map((x) =>
					Math.max((x.r?.ypc.n ?? 0) / (total || 1), (x.r?.ypc.leagueN ?? 0) / (leagueTotal || 1))
				)
			)}
			<div class="lanes">
				{#each lanes as { lane, r } (lane)}
					{@const share = total && r ? r.ypc.n / total : 0}
					{@const lshare = leagueTotal && r ? r.ypc.leagueN / leagueTotal : 0}
					<div class="lane" class:small-sample={!r || r.ypc.n < SMALL_SAMPLE / 2}>
						<svg
							width="100%"
							height={H}
							viewBox="0 0 40 {H}"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<rect
								x="8"
								y={H - (share / max) * H}
								width="24"
								height={(share / max) * H}
								class="bar"
							/>
							<rect x="4" y={H - (lshare / max) * H - 1} width="32" height="2" class="tick" />
						</svg>
						<div class="share">{pct(share)}</div>
						<div class="name">{lane}</div>
						<div class="stat">{num(r?.ypc.value ?? null)} ypc</div>
						<div class="stat">{pct(r?.success.value ?? null)} succ</div>
						<div class="stat">{epa(r?.epa.value ?? null)} EPA</div>
						<div class="stat muted">n={r?.ypc.n ?? 0}</div>
					</div>
				{/each}
			</div>
		{/snippet}
	</Loader>

	<h3>Ball carriers</h3>
	<Loader {filters} load={loadRushers}>
		{#snippet children(rushers)}
			<table>
				<thead>
					<tr>
						<th>Player</th>
						<th class="num">Carries</th>
						<th class="num">Share</th>
						<th class="num">Yards / carry</th>
						<th class="num">Success</th>
						<th class="num">EPA / carry</th>
					</tr>
				</thead>
				<tbody>
					{#each rushers as r (r.id)}
						<tr class:small-sample={r.carries < SMALL_SAMPLE / 2}>
							<td>{r.name}</td>
							<td class="num">{r.carries}</td>
							<td class="num">{pct(r.share)}</td>
							<td class="num">{num(r.ypc)}</td>
							<td class="num">{pct(r.success, 1)}</td>
							<td class="num">{epa(r.epa)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/snippet}
	</Loader>
</section>

<style>
	.lanes {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.4rem;
		margin-top: 0.75rem;
		text-align: center;
	}
	.lane {
		border-bottom: 3px solid var(--line);
		padding-bottom: 0.4rem;
	}
	.bar {
		fill: var(--accent);
	}
	.tick {
		fill: var(--fg);
	}
	.share {
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.name {
		font-size: 0.78rem;
		font-weight: 600;
		margin-bottom: 0.2rem;
	}
	.stat {
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 600px) {
		.stat {
			display: none;
		}
	}
</style>
