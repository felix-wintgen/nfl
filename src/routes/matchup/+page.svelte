<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ABOUT, boardTags, LABELS } from '#lib/broadcast.ts';
	import OffenseBoard from '#lib/components/matchup/OffenseBoard.svelte';
	import { weekLabel } from '#lib/format.ts';
	import {
		favorite,
		finished,
		kickoff,
		loadMatchups,
		nextGame,
		type Game,
		type Matchups
	} from '#lib/matchups.ts';
	import { loadMeta, type Meta, type Team } from '#lib/meta.ts';

	let meta = $state<Meta | null>(null);
	let data = $state<Matchups | null | undefined>(undefined);
	let gameId = $state<string | null>(null);

	onMount(async () => {
		[meta, data] = await Promise.all([loadMeta().catch(() => null), loadMatchups()]);
		const wanted = new URLSearchParams(location.search).get('game');
		gameId =
			data?.games.find((g) => g.game_id === wanted)?.game_id ??
			nextGame(data?.games ?? [])?.game_id ??
			null;
	});

	$effect(() => {
		if (!gameId) return;
		const url = `${location.pathname}?game=${gameId}`;
		if (url !== `${location.pathname}${location.search}`) replaceState(url, {});
	});

	const game = $derived(data?.games.find((g) => g.game_id === gameId));
	const teamOf = (abbr: string): Team =>
		meta?.teams.find((t) => t.abbr === abbr) ??
		({ abbr, name: abbr, nick: abbr, color: '#888', color2: '#888', logo: '' } as Team);
	const builtAt = $derived(meta ? new Date(meta.manifest.built_at) : null);
	// The tags on this game's boards, for the legend.
	const legend = $derived.by(() => {
		if (!game) return [];
		const used = new Set([...boardTags(game.boards.away), ...boardTags(game.boards.home)]);
		return Object.keys(ABOUT).filter((k) => used.has(k));
	});

	function when(g: Game): string {
		return kickoff(g).toLocaleString(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	/** "Monday 8:15 PM ET", plus the viewer's own time when it differs. */
	function kickoffText(g: Game): string {
		const at = kickoff(g);
		const fmt = (timeZone?: string) =>
			at.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone });
		const et = `${fmt('America/New_York')} ET`;
		const local = fmt();
		return local === fmt('America/New_York') ? et : `${et} (${local} your time)`;
	}

	function lineText(g: Game): string | null {
		const fav = favorite(g);
		if (!fav) return null;
		return fav.by === 0 ? "Pick'em" : `${teamOf(fav.team).nick} by ${fav.by}`;
	}

	function weather(g: Game): string | null {
		if (g.roof === 'dome' || g.roof === 'closed') return 'Indoors';
		const parts = [g.temp !== null ? `${g.temp}°F` : null, g.wind ? `wind ${g.wind} mph` : null];
		return parts.filter(Boolean).join(', ') || null;
	}
</script>

<svelte:head>
	<title>{game ? `${game.away} @ ${game.home} · ` : ''}Game day · NFL Scout</title>
</svelte:head>

{#if data === undefined}
	<p class="muted">Loading…</p>
{:else if data === null}
	<h1>Game day</h1>
	<p class="muted">
		No upcoming games in the data right now. Check back when the schedule resumes.
	</p>
{:else}
	<div class="top">
		<h1>Game day <span class="muted">· {data.season} {weekLabel(data.week)}</span></h1>
		<button type="button" class="print screen-only" onclick={() => window.print()}>
			Print spotting board
		</button>
	</div>

	<nav class="games screen-only" aria-label="Games this week">
		{#each data.games as g (g.game_id)}
			<button
				type="button"
				class:active={g.game_id === gameId}
				aria-pressed={g.game_id === gameId}
				onclick={() => (gameId = g.game_id)}
			>
				<span>{g.away} @ {g.home}</span>
				<small>
					{#if finished(g)}Final {g.away_score}–{g.home_score}{:else}{when(g)}{/if}
				</small>
			</button>
		{/each}
	</nav>

	{#if game}
		{@const away = teamOf(game.away)}
		{@const home = teamOf(game.home)}
		<header class="game card">
			<div class="teams">
				<img src={away.logo} alt="" width="44" height="44" />
				<div>
					<h2>{away.name} <span class="muted">at</span> {home.name}</h2>
					<p class="muted">
						{kickoffText(game)}
						{#if game.stadium}· {game.stadium}{/if}
						{#if weather(game)}· {weather(game)}{/if}
						{#if game.div_game}· Division game{/if}
					</p>
				</div>
				<img src={home.logo} alt="" width="44" height="44" />
			</div>

			{#if finished(game)}
				<p class="final">
					Final: {away.nick}
					{game.away_score}, {home.nick}
					{game.home_score}
				</p>
			{/if}

			<dl class="line">
				{#if lineText(game)}
					<div>
						<dt>Spread</dt>
						<dd>{lineText(game)}</dd>
					</div>
				{/if}
				{#if game.total !== null}
					<div>
						<dt>Over/under</dt>
						<dd>{game.total}</dd>
					</div>
				{/if}
				{#if game.implied}
					<div>
						<dt>The line says</dt>
						<dd>
							{away.nick}
							{Math.round(game.implied.away)}, {home.nick}
							{Math.round(game.implied.home)}
						</dd>
					</div>
				{/if}
				{#if game.home_win_prob !== null}
					{@const homeFav = game.home_win_prob >= 0.5}
					<div>
						<dt>Win chance</dt>
						<dd>
							{homeFav ? home.nick : away.nick}
							{Math.round((homeFav ? game.home_win_prob : 1 - game.home_win_prob) * 100)}%
						</dd>
					</div>
				{/if}
			</dl>
			<p class="fine muted">
				Lines from nflverse as of {builtAt?.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric'
				})}; they move during the week. Head coaches: {game.away_coach ?? '–'} ({away.abbr}),
				{game.home_coach ?? '–'} ({home.abbr}).
			</p>
		</header>

		<div class="boards">
			<OffenseBoard board={game.boards.away} team={away} opponent={home} season={data.season} />
			<OffenseBoard board={game.boards.home} team={home} opponent={away} season={data.season} />
		</div>

		{#if legend.length}
			<section class="legend">
				<h3>What the tags mean <span class="screen-only">· tap a tag on the board</span></h3>
				<dl>
					{#each legend as k (k)}
						<div>
							<dt>{LABELS[k]}</dt>
							<dd>{ABOUT[k]}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}

		<p class="fine muted">
			Roles come from this season's usage (targets, air yards, carries) before this week, which
			carries over from game to game. Shares count only the games a player was active for, so an
			injury doesn't shrink his role; a role sticks until he falls clearly below it. Injury report
			and rosters: nflverse.
		</p>
	{/if}
{/if}

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	h1 span {
		font-weight: 400;
		font-size: 1rem;
	}
	.print {
		margin-left: auto;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--card);
		color: inherit;
		cursor: pointer;
	}
	.games {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding: 0.75rem 0;
		margin-bottom: 0.5rem;
	}
	.games button {
		flex: none;
		display: grid;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--card);
		color: inherit;
		cursor: pointer;
		text-align: left;
	}
	.games button small {
		color: var(--muted);
		font-size: 0.72rem;
	}
	.games button.active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.game {
		margin-bottom: 1rem;
	}
	.teams {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.75rem;
		align-items: center;
	}
	.teams h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.teams p {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
	}
	.final {
		font-weight: 650;
		margin: 0.75rem 0 0;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 2rem;
		margin: 0.9rem 0 0.25rem;
	}
	.line dt {
		font-size: 0.72rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.line dd {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 650;
	}
	.fine {
		font-size: 0.78rem;
		margin: 0.4rem 0 0;
	}
	.legend {
		margin-top: 1rem;
		font-size: 0.82rem;
	}
	.legend h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 0 0 0.35rem;
	}
	.legend h3 span {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	.legend dl {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(20rem, 100%), 1fr));
		gap: 0.25rem 1.5rem;
		margin: 0;
	}
	.legend dt {
		display: inline;
		font-weight: 650;
	}
	.legend dt::after {
		content: ': ';
	}
	.legend dd {
		display: inline;
		margin: 0;
		color: var(--muted-strong);
	}
	.boards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
		gap: 1rem;
	}
	@media print {
		.top h1 {
			font-size: 1.1rem;
		}
		.boards {
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem;
			font-size: 0.78rem;
		}
		.game {
			margin-bottom: 0.4rem;
		}
		.legend {
			margin-top: 0.4rem;
			font-size: 0.68rem;
		}
		.legend dl {
			grid-template-columns: 1fr 1fr 1fr;
			gap: 0 0.75rem;
		}
	}
</style>
