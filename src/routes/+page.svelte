<script lang="ts">
	import { asset } from '$app/paths';
	import { onMount } from 'svelte';

	type SeasonInfo = {
		season: number;
		rows: number;
		last_week: number;
		has_participation: boolean;
		has_ftn: boolean;
	};
	type Manifest = { built_at: string; seasons: SeasonInfo[] };

	let manifest = $state<Manifest | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch(asset('data/manifest.json'));
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			manifest = await res.json();
		} catch (e) {
			error = `No data found (${e}). Run \`npm run data\` first.`;
		}
	});
</script>

<svelte:head>
	<title>NFL Scout</title>
</svelte:head>

<main>
	<h1>NFL Scout</h1>
	<p class="lede">Opponent scouting built on nflverse data.</p>

	<div class="tools">
		<section>
			<h2>DC helper</h2>
			<p>Scout the opposing offense: <em>what am I facing?</em></p>
			<p class="soon">Coming in M3</p>
		</section>
		<section>
			<h2>OC helper</h2>
			<p>Scout the opposing defense: <em>what am I expecting?</em></p>
			<p class="soon">Coming in M4</p>
		</section>
	</div>

	<h2>Data</h2>
	{#if error}
		<p class="error">{error}</p>
	{:else if manifest}
		<table>
			<thead>
				<tr>
					<th>Season</th>
					<th>Plays</th>
					<th>Through week</th>
					<th>Personnel / coverage</th>
					<th>FTN charting</th>
				</tr>
			</thead>
			<tbody>
				{#each manifest.seasons as s (s.season)}
					<tr>
						<td>{s.season}</td>
						<td>{s.rows.toLocaleString()}</td>
						<td>{s.last_week}</td>
						<td>{s.has_participation ? 'yes' : 'not published yet'}</td>
						<td>{s.has_ftn ? 'yes' : 'no'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="meta">Built {new Date(manifest.built_at).toLocaleString()}</p>
	{:else}
		<p>Loading…</p>
	{/if}

	<footer>
		Data: <a href="https://github.com/nflverse">nflverse</a> (play-by-play, NGS participation, FTN charting).
		NFL data belongs to its respective owners.
	</footer>
</main>

<style>
	:root {
		--bg: #fafaf9;
		--fg: #1c1917;
		--muted: #78716c;
		--card: #ffffff;
		--line: #e7e5e4;
		--accent: #b45309;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--bg: #1c1917;
			--fg: #f5f5f4;
			--muted: #a8a29e;
			--card: #292524;
			--line: #44403c;
			--accent: #f59e0b;
		}
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font-family: system-ui, sans-serif;
	}
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
	.lede,
	.meta,
	footer {
		color: var(--muted);
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
		margin: 2rem 0;
	}
	section {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 1.25rem;
	}
	.soon {
		color: var(--accent);
		font-size: 0.875rem;
	}
	.error {
		color: var(--accent);
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	footer {
		margin-top: 3rem;
		font-size: 0.875rem;
	}
	a {
		color: var(--accent);
	}
</style>
