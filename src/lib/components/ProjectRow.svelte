<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Project } from '#lib/projects.js';

	let {
		project,
		icon,
		badge,
		children
	}: { project: Project; icon: Snippet; badge?: Snippet; children?: Snippet } = $props();
</script>

<article class="project" style:--accent={project.accent}>
	<div class="icon">{@render icon()}</div>
	<div class="body">
		<h3>{project.name}{@render badge?.()}</h3>
		<p>{project.blurb}</p>
		<ul class="tags" aria-label="Built with">
			{#each project.tags as tag (tag)}
				<li>{tag}</li>
			{/each}
		</ul>
		{@render children?.()}
	</div>
	<nav class="links" aria-label="{project.name} links">
		{#if project.site}<a href={project.site}>site</a>{/if}
		<a href={project.code}>code</a>
	</nav>
</article>

<style>
	.project {
		display: grid;
		grid-template-columns: 44px 1fr auto;
		gap: 16px;
		padding: 18px 0 18px 14px;
		border-top: 1px solid var(--border);
		box-shadow: inset 2px 0 0 var(--accent);
	}

	.icon {
		width: 44px;
		height: 44px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 40%, transparent);
		background: color-mix(in oklch, var(--accent) 12%, transparent);
	}

	h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	p {
		margin: 4px 0 0;
		font-size: 14px;
		color: var(--muted);
		max-width: 60ch;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		font-family: var(--font-mono);
		font-size: 11px;
		padding: 1px 6px;
		border: 1px solid var(--border);
		color: var(--muted);
	}

	.links {
		display: flex;
		align-items: flex-start;
		align-self: start;
		gap: 14px;
		font-size: 13px;
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		.project {
			grid-template-columns: 40px 1fr;
			gap: 14px;
		}

		.icon {
			width: 40px;
			height: 40px;
		}

		.links {
			grid-column: 2;
		}
	}
</style>
