<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { setMeta } from '#lib/context.ts';
	import {
		defaultFilters,
		parseFilters,
		serializeFilters,
		type Filters,
		type Side
	} from '#lib/filters.ts';
	import { loadMeta, type Meta } from '#lib/meta.ts';
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
	setMeta(() => meta!);

	onMount(async () => {
		try {
			meta = await loadMeta();
			const defaults = defaultFilters(meta.defaultSeasons);
			filters = parseFilters(new URLSearchParams(location.search), meta.seasons, defaults);
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
			<p class="muted">{title}: {question}</p>
		</div>
		<label class="switch">
			<span class="muted">Opponent</span>
			<select bind:value={filters.team}>
				{#each meta.teams as t (t.abbr)}
					<option value={t.abbr}>{t.name}</option>
				{/each}
			</select>
		</label>
	</div>

	<FilterBar bind:filters seasons={meta.seasons} onreset={resetSituation} />

	{@render children(filters)}
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 1rem;
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
	.head p {
		margin: 0.2rem 0 0;
	}
	.switch {
		margin-left: auto;
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
