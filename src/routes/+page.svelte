<script lang="ts">
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import DoseReminder from '#lib/eggs/DoseReminder.svelte';
	import LaUtils from '#lib/eggs/LaUtils.svelte';
	import Tabbyfin from '#lib/eggs/Tabbyfin.svelte';
	import Terminal from '#lib/eggs/Terminal.svelte';
	import { projects } from '#lib/projects.js';

	const byId = Object.fromEntries(projects.map((p) => [p.id, p]));

	// Phones have no arrow keys: seven taps on the name open the terminal too.
	let terminal = $state(false);
	let taps = 0;
	let tapTimer: ReturnType<typeof setTimeout> | undefined;

	function tapName() {
		clearTimeout(tapTimer);
		tapTimer = setTimeout(() => (taps = 0), 1500);
		if (++taps >= 7) {
			taps = 0;
			terminal = true;
		}
	}
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
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<span class="name mono" onclick={tapName}>lgpy</span>
		<nav aria-label="Elsewhere">
			<a href="https://github.com/lgpy">github</a>
		</nav>
	</header>

	<main>
		<p class="intro">
			<strong>I build small, careful software:</strong> native apps, tools for games, and things for
			my family. Here's what I've made.
		</p>

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
		<span aria-hidden="true">↑↑↓↓←→←→BA</span>
	</footer>
</div>

<DoseReminder />
<Terminal bind:open={terminal} />

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
		border-bottom: 1px solid var(--ui-border);
		margin-bottom: 40px;
	}

	.name {
		font-weight: 600;
		font-size: 16px;
		user-select: none;
	}

	nav {
		font-size: 14px;
		color: var(--ui-muted-foreground);
	}

	.intro {
		font-size: 17px;
		color: var(--ui-muted-foreground);
		max-width: 46ch;
		margin: 0 0 40px;
	}

	.intro strong {
		color: var(--ui-foreground);
		font-weight: 500;
	}

	.label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ui-muted-foreground);
	}

	.pill {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
	}

	footer {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--ui-border);
		font-size: 12px;
		color: var(--faint);
	}

	@media (max-width: 560px) {
		.page {
			padding: 20px 16px 32px;
		}

		.intro {
			font-size: 15px;
		}
	}
</style>
