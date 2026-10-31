<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { setMeta } from '#lib/context.ts';
	import {
		defaultFilters,
		describeFilters,
		parseFilters,
		serializeFilters,
		type Filters,
		type Side
	} from '#lib/filters.ts';
	import { warmUp } from '#lib/db.ts';
	import { finished, gameFor, kickoff, loadMatchups, type Matchups } from '#lib/matchups.ts';
	import { loadMeta, type Meta } from '#lib/meta.ts';
	import EngineNotice from './EngineNotice.svelte';
	import FilterBar from './FilterBar.svelte';
	import TeamPicker from './TeamPicker.svelte';

	let {
		side,
		title,
		question,
		children
	}: { side: Side; title: string; question: string; children: Snippet<[Filters]> } = $props();

	let meta = $state<Meta | null>(null);
	let filters = $state<Filters | null>(null);
	let error = $state<string | null>(null);
	let matchups = $state<Matchups | null>(null);
	setMeta(() => meta!);

	onMount(async () => {
		loadMatchups().then((m) => (matchups = m));
		try {
			meta = await loadMeta();
			const defaults = defaultFilters(meta.defaultSeasons);
			filters = parseFilters(new URLSearchParams(location.search), meta.seasons, defaults);
			// Start the engine download once the page's own small files are in, so
			// it doesn't compete with them for bandwidth on first paint.
			warmUp();
		} catch (e) {
			error = `No data found (${e}). Run \`npm run data\` first.`;
		}
	});

	// Keep the URL in sync so every view is a shareable link.
	$effect(() => {
		if (!filters || !meta) return;
		const params = serializeFilters(filters, defaultFilters(meta.defaultSeasons)).toString();
		const url = `${location.pathname}${params ? `?${params}` : ''}`;
		untrack(() => {
			if (url !== `${location.pathname}${location.search}`) replaceState(url, {});
		});
	});

	const team = $derived(
		meta && filters?.team ? meta.teams.find((t) => t.abbr === filters!.team) : undefined
	);

	// This team's game this week, until it's played: a way over to the Game day board.
	const next = $derived.by(() => {
		const g = team && gameFor(matchups, team.abbr);
		if (!g || finished(g) || !meta) return null;
		const nick = (abbr: string) => meta!.teams.find((t) => t.abbr === abbr)?.nick ?? abbr;
		// Eastern time, as broadcasts list it; the Game day page adds the viewer's own.
		const at = kickoff(g).toLocaleString('en-US', {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/New_York'
		});
		return {
			text: `${nick(g.away)} at ${nick(g.home)}, ${at} ET`,
			href: `${resolve('/matchup')}?game=${g.game_id}`
		};
	});

	function resetSituation() {
		if (!filters || !meta) return;
		const d = defaultFilters(meta.defaultSeasons);
		filters = { ...d, team: filters.team, seasons: filters.seasons };
	}
</script>

<svelte:head>
	<title>{team ? `${team.abbr} · ` : ''}{title} · NFL Scout</title>
</svelte:head>

{#if error}
	<p class="error">{error}</p>
{:else if !meta || !filters}
	<p class="muted">Loading…</p>
{:else if !filters.team || !team}
	<h1>{title}</h1>
	<p class="muted">{question} Pick the opponent:</p>
	<TeamPicker teams={meta.teams} onpick={(abbr) => (filters!.team = abbr)} />
{:else}
	<div class="head" style:--team={team.color}>
		<img src={team.logo} alt="" width="48" height="48" />
		<div>
			<h1>{team.name} <span class="muted">{side}</span></h1>
			<p class="muted screen-only">{title}: {question}</p>
			{#if next}
				<p class="next screen-only">
					Next game: {next.text} · <a href={next.href}>Game day board</a>
				</p>
			{/if}
			<p class="print-only">{title} game sheet · {describeFilters(filters)}</p>
		</div>
		<button type="button" class="print screen-only" onclick={() => window.print()}>
			Print game sheet
		</button>
		<label class="switch screen-only">
			<span class="muted">Opponent</span>
			<select bind:value={filters.team}>
				{#each meta.teams as t (t.abbr)}
					<option value={t.abbr}>{t.name}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="screen-only">
		<FilterBar bind:filters seasons={meta.seasons} onreset={resetSituation} />
		<EngineNotice />
	</div>

	{@render children(filters)}
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		border-left: 4px solid var(--team);
		padding-left: 1rem;
		margin-bottom: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	h1 span {
		font-weight: 400;
		font-size: 1rem;
	}
	.head > div {
		flex: 1 1 14rem;
		min-width: 0;
	}
	.head p {
		margin: 0.2rem 0 0;
	}
	.next {
		font-size: 0.85rem;
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
	.switch {
		display: grid;
		font-size: 0.75rem;
	}
	.switch select {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.3rem;
	}
	.error {
		color: var(--bad);
	}
</style>
