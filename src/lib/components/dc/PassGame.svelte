<script lang="ts">
	import { compare, M, teamQuery, type Compared } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import Loader from '../Loader.svelte';

	let { filters }: { filters: Filters } = $props();

	const DEPTHS = ['deep', 'intermediate', 'short', 'behind LOS'] as const;
	const DIRS = ['left', 'middle', 'right'] as const;
	const depthHint: Record<string, string> = {
		deep: '20+ air yards',
		intermediate: '10–19',
		short: '0–9',
		'behind LOS': 'screens, swings'
	};

	// Targeted passes only (no sacks, scrambles or throwaways without a direction).
	const targeted = ['is_pass', 'pass_depth IS NOT NULL', 'pass_dir IS NOT NULL'];

	const loadGrid = (f: Filters) =>
		compare({ epa: M.epa, comp: 'avg(is_complete::INT)' }, f, 'offense', {
			groupBy: `pass_depth || '|' || pass_dir`,
			extra: targeted
		});

	type Receiver = {
		id: string;
		name: string;
		targets: number;
		share: number;
		share3: number | null;
		shareRz: number | null;
		adot: number;
		shareAy: number | null;
		yards: number;
		epa: number;
	};
	const loadReceivers = (f: Filters) =>
		teamQuery<Receiver>(
			f,
			'offense',
			['is_pass', 'receiver_player_id IS NOT NULL'],
			(w) => `
			WITH r AS (
				SELECT receiver_player_id AS id, any_value(receiver_player_name) AS name,
				       count(*) AS targets,
				       count(*) FILTER (WHERE down = 3) AS t3,
				       count(*) FILTER (WHERE field_zone IN ('red zone', 'goal to go')) AS trz,
				       avg(air_yards) AS adot, coalesce(sum(air_yards), 0) AS ay,
				       sum(yards_gained)::INTEGER AS yards, avg(epa) AS epa
				FROM plays ${w} GROUP BY receiver_player_id)
			SELECT id, name, targets, adot, yards, epa,
			       targets / sum(targets) OVER () AS share,
			       t3 / nullif(sum(t3) OVER (), 0) AS share3,
			       trz / nullif(sum(trz) OVER (), 0) AS shareRz,
			       ay / nullif(sum(ay) OVER (), 0) AS shareAy
			FROM r ORDER BY targets DESC LIMIT 10`
		);

	function cells(res: Map<unknown, Record<string, Compared>>) {
		const all = [...res.values()];
		const total = all.reduce((s, r) => s + r.epa.n, 0);
		const leagueTotal = all.reduce((s, r) => s + r.epa.leagueN, 0);
		return (depth: string, dir: string) => {
			const r = res.get(`${depth}|${dir}`);
			const share = r && total ? r.epa.n / total : 0;
			const lshare = r && leagueTotal ? r.epa.leagueN / leagueTotal : 0;
			return { r, share, lshare };
		};
	}

	// Heat by target share relative to the league share in the same cell.
	function shade(share: number, lshare: number, n: number): string {
		if (!lshare || n < 10) return 'transparent';
		const d = Math.max(-1, Math.min(1, (share - lshare) / Math.max(lshare, 0.04)));
		return `rgb(${d >= 0 ? 'var(--more)' : 'var(--less)'} / ${(Math.abs(d) * 0.4).toFixed(2)})`;
	}
</script>

<section class="card view">
	<h2>Pass game</h2>
	<p class="muted">
		Where the ball goes. Each cell is its share of targets (league in grey); orange means they throw
		there more than the league.
	</p>
	<Loader {filters} load={loadGrid}>
		{#snippet children(res)}
			{@const cell = cells(res)}
			<div class="field">
				<div></div>
				{#each DIRS as dir (dir)}
					<div class="colhead">{dir}</div>
				{/each}
				{#each DEPTHS as depth (depth)}
					<div class="rowhead">{depth}<span>{depthHint[depth]}</span></div>
					{#each DIRS as dir (dir)}
						{@const c = cell(depth, dir)}
						<div
							class="cell"
							class:small-sample={!c.r || c.r.epa.n < 10}
							style:background={shade(c.share, c.lshare, c.r?.epa.n ?? 0)}
						>
							<div class="v">{pct(c.share)}<span class="league">{pct(c.lshare)}</span></div>
							<div class="l">
								{epa(c.r?.epa.value ?? null)} EPA · {pct(c.r?.comp.value ?? null)} comp · n={c.r
									?.epa.n ?? 0}
							</div>
						</div>
					{/each}
				{/each}
			</div>
		{/snippet}
	</Loader>

	<h3>Targets</h3>
	<Loader {filters} load={loadReceivers}>
		{#snippet children(receivers)}
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>Player</th>
							<th class="num">Targets</th>
							<th class="num">Share</th>
							<th class="num">3rd down</th>
							<th class="num">Red zone</th>
							<th class="num">aDOT</th>
							<th
								class="num"
								title="Share of the team's air yards: how far downfield the targets go"
								>Air yards</th
							>
							<th class="num">Yards</th>
							<th class="num">EPA / target</th>
						</tr>
					</thead>
					<tbody>
						{#each receivers as r (r.id)}
							<tr class:small-sample={r.targets < SMALL_SAMPLE / 2}>
								<td>{r.name}</td>
								<td class="num">{r.targets}</td>
								<td class="num">{pct(r.share)}</td>
								<td class="num">{pct(r.share3)}</td>
								<td class="num">{pct(r.shareRz)}</td>
								<td class="num">{num(r.adot)}</td>
								<td class="num">{pct(r.shareAy)}</td>
								<td class="num">{r.yards}</td>
								<td class="num">{epa(r.epa)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="foot">
				Shares are of all team targets in that situation, including players not shown. Air yards is
				the share of the team's air yards (how far past the line each target was thrown, caught or
				not); screens count negative, so a back can sit near 0%.
			</p>
		{/snippet}
	</Loader>
</section>

<style>
	.field {
		display: grid;
		grid-template-columns: 8rem repeat(3, minmax(0, 1fr));
		gap: 3px;
		margin-top: 0.75rem;
	}
	.colhead {
		text-align: center;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.rowhead {
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.rowhead span {
		font-size: 0.7rem;
		color: var(--muted);
	}
	.cell {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.5rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.v {
		font-size: 1.1rem;
		font-weight: 650;
	}
	.l {
		font-size: 0.72rem;
		color: var(--muted-strong);
	}
	.cell .league {
		color: var(--muted-strong);
	}
</style>
