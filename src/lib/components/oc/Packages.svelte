<script lang="ts">
	import { compare, D, M, type Compared } from '#lib/baseline.ts';
	import type { Filters } from '#lib/filters.ts';
	import { epa, num, pct, SMALL_SAMPLE } from '#lib/format.ts';
	import DataNote from '../DataNote.svelte';
	import Loader from '../Loader.svelte';

	let { filters }: { filters: Filters } = $props();

	const PACKAGES = [
		{ key: 'heavy', label: 'Goal line', expr: "avg((def_package = 'goal line')::INT)" },
		{ key: 'base', label: 'Base', expr: "avg((def_package = 'base')::INT)" },
		{ key: 'nickel', label: 'Nickel', expr: "avg((def_package = 'nickel')::INT)" },
		{ key: 'dime', label: 'Dime', expr: "avg((def_package = 'dime')::INT)" },
		{ key: 'quarter', label: 'Quarter', expr: "avg((def_package = 'quarter')::INT)" }
	] as const;

	const metrics = {
		...Object.fromEntries(PACKAGES.map((p) => [p.key, p.expr])),
		box: 'avg(ftn_box)',
		blitz: D.blitz,
		pass: M.passRate,
		epa: M.epa
	};

	const load = (f: Filters) =>
		compare(metrics, f, 'defense', {
			groupBy: 'off_personnel',
			extra: ['off_personnel IS NOT NULL', 'def_package IS NOT NULL']
		});

	function rows(res: Map<unknown, Record<string, Compared>>) {
		return [...res.entries()]
			.map(([g, r]) => ({ g: String(g), r, n: r.epa.n }))
			.filter((x) => x.n > 0)
			.sort((a, b) => b.n - a.n)
			.slice(0, 6);
	}

	// Stacked bar of package shares.
	function segments(r: Record<string, Compared>, which: 'value' | 'league') {
		let x = 0;
		return PACKAGES.map((p) => {
			const w = r[p.key][which] ?? 0;
			const seg = { key: p.key, x, w };
			x += w;
			return seg;
		});
	}
</script>

<section class="card view">
	<h2>Packages vs. your personnel</h2>
	<p class="muted">
		What they put on the field when you come out in each grouping. Top bar is them, thin bar the
		league; EPA is allowed (lower is better for them).
	</p>
	<DataNote seasons={filters.seasons} what="Personnel and packages" />
	<div class="legend">
		{#each PACKAGES as p (p.key)}
			<span><i class="seg-{p.key}"></i>{p.label}</span>
		{/each}
	</div>
	<Loader {filters} {load}>
		{#snippet children(res)}
			{@const list = rows(res)}
			{#if list.length === 0}
				<p class="muted">No plays with personnel data.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>You show</th>
							<th class="num">Plays</th>
							<th>They answer with</th>
							<th class="num">Box</th>
							<th class="num">Blitz</th>
							<th class="num">Pass rate faced</th>
							<th class="num">EPA allowed</th>
						</tr>
					</thead>
					<tbody>
						{#each list as { g, r, n } (g)}
							<tr class:small-sample={n < SMALL_SAMPLE}>
								<td>{g} personnel</td>
								<td class="num">{n}</td>
								<td>
									<svg
										class="stack"
										viewBox="0 0 1 1"
										preserveAspectRatio="none"
										aria-hidden="true"
									>
										{#each segments(r, 'value') as s (s.key)}
											<rect x={s.x} y="0" width={s.w} height="0.68" class="seg-{s.key}" />
										{/each}
										{#each segments(r, 'league') as s (s.key)}
											<rect x={s.x} y="0.78" width={s.w} height="0.22" class="seg-{s.key}" />
										{/each}
									</svg>
									<span class="shares">
										{#each PACKAGES as p (p.key)}
											{#if (r[p.key].value ?? 0) >= 0.05}
												<span>{p.label} {pct(r[p.key].value)}</span>
											{/if}
										{/each}
									</span>
								</td>
								<td class="num"
									>{num(r.box.value)}<span class="league">{num(r.box.league)}</span></td
								>
								<td class="num"
									>{pct(r.blitz.value)}<span class="league">{pct(r.blitz.league)}</span></td
								>
								<td class="num"
									>{pct(r.pass.value)}<span class="league">{pct(r.pass.league)}</span></td
								>
								<td class="num"
									>{epa(r.epa.value)}<span class="league">{epa(r.epa.league)}</span></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/snippet}
	</Loader>
</section>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		font-size: 0.78rem;
		color: var(--muted);
		margin: 0.5rem 0;
	}
	.legend i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 2px;
		margin-right: 0.3rem;
		vertical-align: -1px;
	}
	.stack {
		display: block;
		width: 100%;
		min-width: 180px;
		height: 22px;
	}
	.shares {
		display: flex;
		gap: 0.6rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.seg-heavy {
		fill: #78716c;
		background: #78716c;
	}
	.seg-base {
		fill: #2563eb;
		background: #2563eb;
	}
	.seg-nickel {
		fill: #f59e0b;
		background: #f59e0b;
	}
	.seg-dime {
		fill: #dc2626;
		background: #dc2626;
	}
	.seg-quarter {
		fill: #7c3aed;
		background: #7c3aed;
	}
</style>
