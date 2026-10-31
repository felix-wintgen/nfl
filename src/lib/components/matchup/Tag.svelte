<script lang="ts">
	import { ABOUT, LABELS } from '#lib/broadcast.ts';

	// A board tag; tap it to see what it means. The browser's popover does the
	// opening and closing (tap outside, Escape), no script needed.
	let {
		key,
		text = LABELS[key] ?? key,
		tone,
		fresh = false
	}: { key: string; text?: string; tone?: 'back' | 'warn'; fresh?: boolean } = $props();

	const id = $props.id();
	const about = $derived(ABOUT[key]);
</script>

{#if about}
	<button
		type="button"
		class="tag {tone}"
		class:new={fresh}
		popovertarget="about-{id}"
		style:anchor-name="--tag-{id}"
	>
		{#if fresh}<b>New:</b>{/if}
		{text}
	</button>
	<div id="about-{id}" class="about" popover style:position-anchor="--tag-{id}">
		<strong>{text}</strong>
		{about}{#if fresh}
			New since last week.{/if}
	</div>
{:else}
	<span class="tag {tone}" class:new={fresh}>{text}</span>
{/if}

<style>
	.tag {
		font: inherit;
		font-size: 0.7rem;
		line-height: inherit;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: none;
		color: var(--muted-strong);
		white-space: nowrap;
	}
	button.tag {
		cursor: help;
	}
	button.tag:hover {
		border-color: var(--muted);
	}
	.tag.new,
	.tag.back {
		border-color: var(--accent);
		color: var(--accent);
	}
	.tag.warn {
		border-color: var(--bad);
		color: var(--bad);
	}
	.tag b {
		font-weight: 600;
	}
	.about {
		max-width: min(18rem, calc(100vw - 2rem));
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		color: var(--fg);
		font-size: 0.85rem;
		line-height: 1.4;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
	}
	.about strong {
		display: block;
	}
	/* Under the tag where the browser can anchor it; centered on screen otherwise. */
	@supports (position-area: bottom) {
		.about {
			inset: auto;
			margin: 0.3rem 0;
			position-area: bottom span-right;
			position-try-fallbacks:
				flip-block,
				flip-inline,
				flip-block flip-inline;
		}
	}
</style>
