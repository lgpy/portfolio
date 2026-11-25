<script lang="ts">
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import LaUtils from '#lib/eggs/LaUtils.svelte';
	import Tabbyfin from '#lib/eggs/Tabbyfin.svelte';
	import { GOLD, hone, vandal } from '#lib/eggs/state.svelte.js';
	import { projects } from '#lib/projects.js';

	const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
</script>

<svelte:head>
	<title>lgpy</title>
	<meta
		name="description"
		content="Things lgpy has made: Tabbyfin, a native Jellyfin client; Family Care, an Android app for family caregivers; and LA Utils, a Lost Ark companion."
	/>
</svelte:head>

<div class="page">
	<header>
		<div class="who">
			<span class="name mono">lgpy</span>
			{#if hone.level > 0}<span class="honed mono">+{hone.level}</span>{/if}
			<span class="tagline"
				>{vandal['header .tagline'] ?? (hone.level >= GOLD ? 'I build stuff. Fully honed.' : 'I build stuff')}</span
			>
		</div>
		<nav aria-label="Elsewhere">
			<a href="https://github.com/lgpy">github</a>
		</nav>
	</header>

	<main>
		<h2 class="label mono">Projects</h2>
		<Tabbyfin project={byId['tabbyfin']} />
		<ProjectRow project={byId['family-care']}>
			{#snippet icon()}
				<svg class="pill" viewBox="0 0 24 24" aria-hidden="true">
					<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
					<path d="m8.5 8.5 7 7" />
				</svg>
			{/snippet}
		</ProjectRow>
		<LaUtils project={byId['la-utils']} />
	</main>

	<footer class="mono">
		<span>lgpy.dev</span>
	</footer>
</div>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 32px 24px 48px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 40px;
	}

	.name {
		font-weight: 600;
		font-size: 16px;
	}

	nav {
		font-size: 14px;
		color: var(--muted);
	}

	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		line-height: 1;
	}

	.honed {
		margin-inline-start: -8px;
		font-size: 12px;
		color: var(--gold);
	}

	.pill {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
	}

	.tagline {
		font-size: 13px;
		color: var(--faint);
	}

	.label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	footer {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--faint);
	}

	@media (max-width: 560px) {
		.page {
			padding: 20px 16px 32px;
		}
	}
</style>
