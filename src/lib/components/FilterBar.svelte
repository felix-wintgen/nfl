<script lang="ts">
	import {
		CLOCKS,
		DIST_BUCKETS,
		DOWNS,
		FIELD_ZONES,
		GAME_WINDOWS,
		SCORE_STATES,
		SEASON_TYPES,
		VENUES,
		describeFilters,
		type Filters
	} from '#lib/filters.ts';

	let {
		filters = $bindable(),
		seasons,
		onreset
	}: { filters: Filters; seasons: number[]; onreset: () => void } = $props();

	// On narrow screens the filters collapse behind a summary line.
	let open = $state(false);

	function toggle<T>(values: T[], v: T, keepOne = false): T[] {
		if (!values.includes(v)) return [...values, v];
		return keepOne && values.length === 1 ? values : values.filter((x) => x !== v);
	}

	const labels: Record<string, string> = {
		all: 'All',
		last4: 'Last 4 games',
		last8: 'Last 8 games',
		REG: 'Regular season',
		POST: 'Playoffs',
		two_min: 'Two-minute',
		not_two_min: 'Outside two-minute',
		home: 'Home',
		away: 'Away'
	};
	const label = (v: string) => labels[v] ?? v;
</script>

{#snippet chips<T extends string | number>(
	name: string,
	options: readonly T[],
	selected: T[],
	set: (v: T[]) => void,
	keepOne = false
)}
	<fieldset>
		<legend>{name}</legend>
		{#each options as o (o)}
			<button
				type="button"
				class="chip"
				aria-pressed={selected.includes(o)}
				onclick={() => set(toggle(selected, o, keepOne))}>{o}</button
			>
		{/each}
	</fieldset>
{/snippet}

{#snippet select<T extends string>(
	name: string,
	options: readonly T[],
	value: T,
	set: (v: T) => void
)}
	<label>
		<span>{name}</span>
		<select {value} onchange={(e) => set(e.currentTarget.value as T)}>
			{#each options as o (o)}
				<option value={o}>{label(o)}</option>
			{/each}
		</select>
	</label>
{/snippet}

<div class="bar card" class:open>
	<button type="button" class="summary" aria-expanded={open} onclick={() => (open = !open)}>
		<span>Filters: {describeFilters(filters)}</span>
		<span aria-hidden="true">{open ? '▴' : '▾'}</span>
	</button>
	<div class="row">
		{@render chips('Seasons', seasons, filters.seasons, (v) => (filters.seasons = v.sort()), true)}
		{@render select('Games', GAME_WINDOWS, filters.games, (v) => (filters.games = v))}
		{@render select(
			'Season type',
			SEASON_TYPES,
			filters.seasonType,
			(v) => (filters.seasonType = v)
		)}
		{@render select('Venue', VENUES, filters.venue, (v) => (filters.venue = v))}
		{@render select('Clock', CLOCKS, filters.clock, (v) => (filters.clock = v))}
	</div>
	<div class="row">
		{@render chips('Down', DOWNS, filters.downs, (v) => (filters.downs = v))}
		{@render chips('Distance', DIST_BUCKETS, filters.dist, (v) => (filters.dist = v))}
		{@render chips('Field zone', FIELD_ZONES, filters.zones, (v) => (filters.zones = v))}
		{@render chips('Score', SCORE_STATES, filters.score, (v) => (filters.score = v))}
		<button type="button" class="reset" onclick={onreset}>Reset situation</button>
	</div>
</div>

<style>
	.summary {
		display: none;
	}
	@media (max-width: 640px) {
		.summary {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
			padding: 0;
			border: none;
			background: none;
			color: inherit;
			font: inherit;
			font-size: 0.85rem;
			text-align: left;
			cursor: pointer;
		}
		.bar:not(.open) .row {
			display: none;
		}
	}
	.bar {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		align-items: flex-end;
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	legend,
	label span {
		display: block;
		font-size: 0.75rem;
		color: var(--muted);
		margin-bottom: 0.25rem;
	}
	.chip,
	select,
	.reset {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--bg);
		color: inherit;
		cursor: pointer;
	}
	select {
		border-radius: 6px;
	}
	.chip[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.reset {
		margin-left: auto;
		border-radius: 6px;
	}
</style>
