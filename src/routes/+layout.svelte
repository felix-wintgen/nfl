<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { weekLabel } from '#lib/format.ts';
	import { loadMeta, type SeasonInfo } from '#lib/meta.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// "Data as of" line; stays empty if the data files are missing.
	let asOf = $state<{ latest: SeasonInfo; builtAt: Date } | null>(null);
	onMount(() => {
		loadMeta()
			.then((m) => {
				const latest = m.manifest.seasons.at(-1);
				if (latest) asOf = { latest, builtAt: new Date(m.manifest.built_at) };
			})
			.catch(() => {});
	});

	const links = [
		{ href: resolve('/dc'), label: 'DC helper' },
		{ href: resolve('/oc'), label: 'OC helper' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<nav>
		<a class="brand" href={resolve('/')}>NFL Scout</a>
		{#each links as l (l.href)}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a
			>
		{/each}
	</nav>
</header>
{#if asOf}
	<div class="asof">
		Data through {asOf.latest.season}
		{weekLabel(asOf.latest.last_week)} · updated {asOf.builtAt.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})}
	</div>
{/if}

<main>
	{@render children()}
</main>

<footer>
	Data: <a href="https://github.com/nflverse">nflverse</a> (play-by-play, NGS participation, FTN charting).
	NFL data belongs to its respective owners.
</footer>

<style>
	header {
		border-bottom: 1px solid var(--line);
		background: var(--card);
	}
	nav,
	main,
	footer {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 1rem;
	}
	nav {
		display: flex;
		gap: 1.25rem;
		align-items: center;
		height: 3rem;
	}
	nav a {
		color: var(--fg);
		text-decoration: none;
	}
	nav a[aria-current='page'] {
		color: var(--accent);
		font-weight: 600;
	}
	.brand {
		font-weight: 700;
		margin-right: auto;
	}
	.asof {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0.4rem 1rem 0;
		font-size: 0.78rem;
		color: var(--muted);
		text-align: right;
	}
	main {
		padding-top: 1.5rem;
		padding-bottom: 2rem;
	}
	footer {
		color: var(--muted);
		font-size: 0.85rem;
		padding-bottom: 2rem;
	}
</style>
