<script lang="ts">
	import { defOutLine, outLine, statusKey, teamOutLine } from '#lib/broadcast.ts';
	import type { Board } from '#lib/matchups.ts';
	import type { Team } from '#lib/meta.ts';
	import Tag from './Tag.svelte';

	// Who's out for one team, defense and offense together: viewers think in teams, not
	// possessions, so a banged-up team's story sits in one place under its own color.
	// Defense first: the offense's absences partly show on the boards already, the defense's nowhere else.
	let { board, team, season }: { board: Board; team: Team; season: number } = $props();

	const defense = $derived(board.def_out ?? []);
	const line = $derived(teamOutLine(board, team.nick));
</script>

<section class="team-out card" style:--team={team.color}>
	<h2>
		<img src={team.logo} alt="" width="24" height="24" />
		{team.nick}: who's out
	</h2>
	{#if line}<p class="line">{line}</p>{/if}

	{#if defense.length}
		<h3>Defense</h3>
		<ul class="out">
			{#each defense as o (o.id)}
				<li>
					<Tag key={statusKey(o.status)} text={o.status} tone="warn" fresh={o.new} />
					<strong>#{o.jersey ?? '–'} {o.name}</strong>
					<span class="pos">{o.pos}</span>
					<span class="muted">{defOutLine(o, season)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if board.out.length}
		<h3>Offense</h3>
		<ul class="out">
			{#each board.out as o (o.id)}
				<li>
					<Tag key={statusKey(o.status)} text={o.status} tone="warn" fresh={o.new} />
					<strong>#{o.jersey ?? '–'} {o.name}</strong>
					<span class="pos">{o.pos}</span>
					<span class="muted">{outLine(o)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if !board.out.length && !defense.length}
		<p class="muted">No regulars on the injury report or injured reserve.</p>
	{/if}

	{#if board.report_pending}
		<p class="pending muted">Final injury report not out yet.</p>
	{/if}
</section>

<style>
	.team-out {
		border-top: 4px solid var(--team);
		break-inside: avoid;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1rem;
	}
	h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 0.85rem 0 0.25rem;
	}
	.line {
		margin: 0.35rem 0 0;
		color: var(--muted-strong);
		font-size: 0.9rem;
	}
	.pos {
		font-size: 0.75rem;
		color: var(--muted);
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
</style>
