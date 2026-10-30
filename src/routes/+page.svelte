<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { loadMeta, type Manifest } from '#lib/meta.ts';

	let manifest = $state<Manifest | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			manifest = (await loadMeta()).manifest;
		} catch (e) {
			error = `No data found (${e}). Run \`npm run data\` first.`;
		}
	});
</script>

<svelte:head>
	<title>NFL Scout</title>
</svelte:head>

<h1>NFL Scout</h1>
<p class="muted">Opponent scouting built on nflverse data.</p>

<div class="tools">
	<a class="card" href={resolve('/dc')}>
		<h2>DC helper</h2>
		<p>Scout the opposing offense: <em>what am I facing?</em></p>
	</a>
	<a class="card" href={resolve('/oc')}>
		<h2>OC helper</h2>
		<p>Scout the opposing defense: <em>what am I expecting?</em></p>
	</a>
</div>

<h2>Data</h2>
{#if error}
	<p class="error">{error}</p>
{:else if manifest}
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th>Season</th>
					<th class="num">Plays</th>
					<th class="num">Through week</th>
					<th>Personnel / coverage</th>
					<th>FTN charting</th>
				</tr>
			</thead>
			<tbody>
				{#each manifest.seasons as s (s.season)}
					<tr>
						<td>{s.season}</td>
						<td class="num">{s.rows.toLocaleString()}</td>
						<td class="num">{s.last_week}</td>
						<td>{s.has_participation ? 'yes' : 'not published yet'}</td>
						<td>{s.has_ftn ? 'yes' : 'no'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="muted">Built {new Date(manifest.built_at).toLocaleString()}</p>
{:else}
	<p>Loading…</p>
{/if}

<style>
	.tools {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
		margin: 1.5rem 0 2rem;
	}
	.tools a {
		color: inherit;
		text-decoration: none;
	}
	.tools a:hover {
		border-color: var(--accent);
	}
	.error {
		color: var(--bad);
	}
</style>
