<script lang="ts">
	import type { Team } from '#lib/meta.ts';

	let { teams, onpick }: { teams: Team[]; onpick: (abbr: string) => void } = $props();

	const divisions = $derived(
		Object.entries(Object.groupBy(teams, (t) => t.division)).sort(([a], [b]) => a.localeCompare(b))
	);
</script>

<div class="divisions">
	{#each divisions as [division, members] (division)}
		<section>
			<h3>{division}</h3>
			{#each members ?? [] as t (t.abbr)}
				<button type="button" onclick={() => onpick(t.abbr)} style:--team={t.color}>
					<img src={t.logo} alt="" width="28" height="28" loading="lazy" />
					<span>{t.name}</span>
				</button>
			{/each}
		</section>
	{/each}
</div>

<style>
	.divisions {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}
	h3 {
		font-size: 0.8rem;
		color: var(--muted);
		margin: 0 0 0.25rem;
	}
	button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		background: none;
		border: 1px solid transparent;
		border-left: 3px solid var(--team);
		border-radius: 4px;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	button:hover {
		background: var(--card);
		border-color: var(--line);
		border-left-color: var(--team);
	}
</style>
