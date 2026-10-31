<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		backfieldLine,
		backLine,
		outLine,
		qbLine,
		qbSecondLine,
		statusKey,
		healthTags,
		tags,
		targetLine,
		teamLine
	} from '#lib/broadcast.ts';
	import type { Board } from '#lib/matchups.ts';
	import type { Team } from '#lib/meta.ts';
	import Tag from './Tag.svelte';

	// One half of the spotting board: when this team has the ball.
	let {
		board,
		team,
		opponent,
		season
	}: { board: Board; team: Team; opponent: Team; season: number } = $props();

	// Worded once per page load: a reload may phrase things differently, the facts stay put.
	const lines = $derived({
		team: teamLine(board, team.nick),
		qb: board.qb ? [qbLine(board.qb), qbSecondLine(board.qb)].filter((l) => l) : [],
		targets: board.targets.map((t) => targetLine(t)),
		backs: board.backs.map((b, i) => backLine(b, i === 0 && board.backfield === 'lead')),
		backfield: backfieldLine(board)
	});

	const isNew = (tag: string, fresh: string[]) =>
		fresh.includes(tag) ||
		(tag === 'three_down' && fresh.some((l) => l === 'workhorse' || l === 'passing_down'));

	const scout = (path: '/dc' | '/oc', abbr: string) =>
		`${resolve(path)}?team=${abbr}&seasons=${season}`;
</script>

<section class="board card" style:--team={team.color}>
	<h2>
		<img src={team.logo} alt="" width="28" height="28" />
		When the {team.nick} have the ball
	</h2>
	<p class="team-line">{lines.team}</p>

	{#if board.qb}
		{@const q = board.qb}
		<div class="row qb">
			<div class="num">#{q.jersey ?? '–'}</div>
			<div>
				<div class="who">
					<strong>{q.name}</strong> <span class="pos">QB</span>
					{#if q.rookie}<Tag key="rookie" />{/if}
					{#each healthTags(q) as h (h.key)}<Tag key={h.key} tone={h.tone} />{/each}
					{#if q.returning}<Tag key="returning" tone="back" />
					{:else if q.changed}<Tag key="changed" tone="back" />{/if}
					{#each tags(q.labels) as l (l)}
						<Tag key={l} fresh={isNew(l, q.new)} />
					{/each}
				</div>
				{#each lines.qb as line, i (i)}<p class="line">{line}</p>{/each}
				<p class="facts">
					{q.stats.completions}/{q.stats.attempts} · {q.stats.pass_yards} yds · {q.stats.pass_td} TD ·
					{q.stats.ints} INT · {q.stats.sacks} sacks
				</p>
			</div>
		</div>
	{/if}

	<h3>Targets</h3>
	{#each board.targets as t, i (t.id)}
		<div class="row">
			<div class="num">#{t.jersey ?? '–'}</div>
			<div>
				<div class="who">
					<strong>{t.name}</strong> <span class="pos">{t.pos}</span>
					{#if t.rookie}<Tag key="rookie" />{/if}
					{#each healthTags(t) as h (h.key)}<Tag key={h.key} tone={h.tone} />{/each}
					{#each tags(t.labels) as l (l)}
						<Tag key={l} fresh={isNew(l, t.new)} />
					{/each}
				</div>
				{#if lines.targets[i]}<p class="line">{lines.targets[i]}</p>{/if}
				<p class="facts">
					{t.stats.targets} targets · {t.stats.rec} rec · {t.stats.rec_yards} yds · {t.stats.rec_td} TD
				</p>
			</div>
		</div>
	{/each}

	<h3>Backfield</h3>
	{#if lines.backfield}<p class="line">{lines.backfield}</p>{/if}
	{#each board.backs as b, i (b.id)}
		<div class="row">
			<div class="num">#{b.jersey ?? '–'}</div>
			<div>
				<div class="who">
					<strong>{b.name}</strong> <span class="pos">{b.pos}</span>
					{#if b.rookie}<Tag key="rookie" />{/if}
					{#each healthTags(b) as h (h.key)}<Tag key={h.key} tone={h.tone} />{/each}
					{#each tags(b.labels, i === 0 && board.backfield === 'lead') as l (l)}
						<Tag key={l} fresh={isNew(l, b.new)} />
					{/each}
				</div>
				{#if lines.backs[i]}<p class="line">{lines.backs[i]}</p>{/if}
				<p class="facts">
					{b.stats.carries} car · {b.stats.rush_yards} yds · {b.stats.rush_td} TD · {b.stats
						.targets}
					targets
				</p>
			</div>
		</div>
	{/each}

	{#if board.out.length}
		<h3>Who's out</h3>
		<ul class="out">
			{#each board.out as o (o.id)}
				<li>
					<Tag
						key={statusKey(o.status)}
						text={o.status}
						tone={o.status === 'Questionable' ? undefined : 'warn'}
					/>
					<strong>#{o.jersey ?? '–'} {o.name}</strong>
					<span class="pos">{o.pos}</span>
					<span class="muted">{outLine(o)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if board.report_pending}
		<p class="pending muted">
			Final injury report not out yet: tags show last game and this week's practice.
		</p>
	{/if}

	<p class="links screen-only">
		Dig deeper: <a href={scout('/dc', team.abbr)}>{team.nick} offense in the DC helper</a> ·
		<a href={scout('/oc', opponent.abbr)}>{opponent.nick} defense in the OC helper</a>
	</p>
</section>

<style>
	.board {
		border-top: 4px solid var(--team);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1.1rem;
	}
	h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 1rem 0 0.25rem;
	}
	.team-line {
		margin: 0.35rem 0 0.75rem;
		color: var(--muted-strong);
		font-size: 0.9rem;
	}
	.row {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
		break-inside: avoid;
	}
	.row:last-of-type {
		border-bottom: 0;
	}
	.num {
		font-size: 1.35rem;
		font-weight: 750;
		color: var(--team);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	/* Some team colors are too dark on a dark background. */
	@media (prefers-color-scheme: dark) {
		.num {
			color: var(--fg);
		}
	}
	.qb .num {
		font-size: 1.6rem;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.4rem;
	}
	.pos {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.line {
		margin: 0.15rem 0 0;
	}
	.facts {
		margin: 0.1rem 0 0;
		font-size: 0.78rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.out {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.88rem;
	}
	.out li {
		padding: 0.3rem 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.4rem;
		align-items: baseline;
	}
	.pending {
		margin: 0.75rem 0 0;
		font-size: 0.8rem;
	}
	.links {
		margin: 1rem 0 0;
		font-size: 0.85rem;
	}
</style>
