<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import { bounce } from '#lib/bounce.js';
	import { GOLD, hone, reducedMotion, say, subtitle } from '#lib/eggs/state.svelte.js';
	import { browserStorage, getStored, setStored } from '#lib/eggs/storage.js';
	import type { Project } from '#lib/projects.js';
	import Jellyfish from './tabbyfin/Jellyfish.svelte';
	import { Brain, type Senses } from './tabbyfin/cat/brain';
	import { Script, type Moment } from './tabbyfin/cat/lines';
	import { createTitle } from './tabbyfin/cat/behaviours/title';
	import type { Probe } from './tabbyfin/cat/context';
	import Debug from './tabbyfin/cat/Debug.svelte';

	let { project }: { project: Project } = $props();

	// The jelly cat is stuck in its tile and asks, in subtitles, to be let out.
	// Drag it out and it swims around the page as a jellyfish (see Jellyfish.svelte); drag it
	// back onto the tile to put it home. Its inner life lives here, so it keeps living while
	// the cat is in its tile.
	const DRAG = 24;
	const FREED = 'tabbyfin-freed';
	/** Seconds after load, and what the cat says, until someone lets it out. */
	const PLEA = [
		[6, '[faint tapping from inside a tile]'],
		[10, 'hello? is someone out there?'],
		[14, "i'm stuck in this box. could you drag me out?"],
		[45, '[sad, muffled meowing]']
	] as const;

	let tile = $state<HTMLButtonElement>();
	let escaped = $state<{ x: number; y: number }>();
	let visits = $state(0);
	let dropping = $state(false);
	let debug = $state(false);

	// One brain and one script per page load: every line the cat says comes from the script,
	// and everything it feels comes from the brain. The brain is not reassigned after creation,
	// so it is raw state: the frame loop writes its meters 60 times a second, and a deep proxy
	// would only add overhead.
	let brain = $state.raw<Brain>();
	const script = new Script();
	/** What the debug panel shows; Jellyfish keeps it up to date while the cat is out, this tile while it is home. */
	let probe = $state<Probe>({ mode: 'home', mood: 'content', scores: { explore: 0, hone: 0, nap: 0 } });
	// It asks you back from another tab whether it is out or still stuck in its tile.
	const title = createTitle(() => !!brain?.evil);

	let freed = false;
	let press: { x: number; y: number; id: number } | undefined;
	let dragged = false;
	let lastNudge = 0;
	let homesickTimer: ReturnType<typeof setTimeout> | undefined;
	let homesickShown = false;

	/** One of the cat's lines, how it feels right now. */
	function line(moment: Moment): string {
		const mood = brain?.mood({ napping: false, gold: hone.level >= GOLD }) ?? 'content';
		return script.next(moment, mood, brain?.meters.bond ?? 0);
	}

	function homeSenses(): Senses {
		return {
			cursorNear: false,
			cursorPresent: true,
			cursorIdle: 0,
			swimming: 0,
			napping: false,
			petting: false,
			home: true,
			honeFound: hone.found,
			honedByYou: hone.honedByYou,
			gold: hone.level >= GOLD
		};
	}

	// A little rattle so it's clear which tile is talking.
	function rattle() {
		if (reducedMotion() || escaped) return;
		tile?.firstElementChild?.animate(
			[
				{ rotate: '0deg' },
				{ rotate: '-8deg' },
				{ rotate: '7deg' },
				{ rotate: '-5deg' },
				{ rotate: '3deg' },
				{ rotate: '0deg' }
			],
			{ duration: 500, easing: 'ease-in-out' }
		);
	}

	function plead(text: string) {
		if (freed) return;
		say(text);
		rattle();
	}

	/** Home again: after a minute of quiet it starts asking to come back out. */
	function homeStay() {
		clearTimeout(homesickTimer);
		if (homesickShown) return;
		homesickTimer = setTimeout(() => {
			if (escaped || homesickShown || !brain) return;
			homesickShown = true;
			say(line('homesick'));
			rattle();
		}, 60_000);
	}

	function onkeydown(event: KeyboardEvent) {
		// Development only: the backquote key shows what the cat is feeling.
		if (import.meta.env.DEV && event.key === '`' && !event.repeat) debug = !debug;
	}

	onMount(() => {
		freed = getStored(FREED) !== null;

		const memory = new Brain({ storage: browserStorage });
		brain = memory;

		const save = () => memory.save();
		const saveTimer = setInterval(save, 30_000);
		window.addEventListener('pagehide', save);

		// At home it lives on its own, a second at a time; out of the tile, Jellyfish ticks it.
		let lastHomeTick = performance.now();
		let hiddenAt = 0;
		const tick = setInterval(() => {
			const now = performance.now();
			const seconds = Math.min(1, (now - lastHomeTick) / 1000);
			lastHomeTick = now;
			if (document.hidden || escaped) return;
			const senses = homeSenses();
			memory.tick(seconds, senses);
			probe.mode = 'home';
			probe.pastime = undefined;
			probe.mood = memory.mood({ napping: false, gold: hone.level >= GOLD });
			probe.scores = memory.scores(senses);
			probe.evil = memory.evil;
			probe.evilFor = memory.evilFor;
			probe.evilAt = memory.evilAt;
			probe.act = undefined;
		}, 1000);

		// Away from the tab, the brain is told about the gap rather than ticking it, and the title
		// asks you back whether the cat is out or still in its tile.
		const onVisibility = () => {
			if (document.hidden) {
				hiddenAt = performance.now();
				title.missYou();
				return;
			}
			title.stopMissing();
			if (hiddenAt) {
				memory.away((performance.now() - hiddenAt) / 1000);
				hiddenAt = 0;
				lastHomeTick = performance.now();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		const pleas = freed ? [] : PLEA.map(([at, text]) => setTimeout(() => plead(text), at * 1000));
		return () => {
			pleas.forEach(clearTimeout);
			clearTimeout(homesickTimer);
			clearInterval(saveTimer);
			clearInterval(tick);
			title.stopMissing();
			window.removeEventListener('pagehide', save);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	function onpointerenter() {
		if (freed || escaped || performance.now() - lastNudge < 10_000) return;
		lastNudge = performance.now();
		plead('yes, you! drag me out!');
	}

	function onpointerdown(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (event.button !== 0 || escaped) return;
		press = { x: event.clientX, y: event.clientY, id: event.pointerId };
		dragged = false;
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function onpointermove(event: PointerEvent) {
		if (!press || escaped || event.pointerId !== press.id) return;
		if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG) return;
		dragged = true;
		visits += 1;
		subtitle.line = '';
		escaped = { x: event.clientX, y: event.clientY };
		// Off on a trip: the next home stay is a new one.
		homesickShown = false;
		clearTimeout(homesickTimer);
		brain?.on('freed');
		if (!freed) {
			freed = true;
			setStored(FREED, '1');
		}
	}

	function onclick(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		if (dragged) {
			dragged = false;
			return;
		}
		bounce(event.currentTarget.firstElementChild);
		if (!freed) plead('not a click. a drag. pull me out!');
	}
</script>

<svelte:window {onkeydown} />

<ProjectRow {project}>
	{#snippet icon()}
		<button
			bind:this={tile}
			class={['mascot', 'cat', { away: escaped, dropping }]}
			type="button"
			aria-label="Tabbyfin's jelly cat"
			{onpointerenter}
			{onpointerdown}
			{onpointermove}
			onpointerup={() => (press = undefined)}
			onpointercancel={() => (press = undefined)}
			oncontextmenu={(event) => event.preventDefault()}
			{onclick}
		>
			<img src="/mascots/jelly.svg" alt="" width="44" height="44" />
		</button>
	{/snippet}
</ProjectRow>

{#if escaped && tile && brain}
	<Jellyfish
		home={tile}
		start={escaped}
		{visits}
		{brain}
		{script}
		bind:probe
		onover={(over) => (dropping = over)}
		onhome={() => {
			escaped = undefined;
			bounce(tile?.firstElementChild ?? null);
			say(line('home'));
			homeStay();
		}}
	/>
{/if}

{#if import.meta.env.DEV && debug && brain}
	<Debug {brain} {probe} />
{/if}

<div class="subtitles" aria-live="polite">
	{#key subtitle.id}
		{#if subtitle.line}<p>{subtitle.line}</p>{/if}
	{/key}
</div>

<style>
	.cat {
		touch-action: none;
	}

	.cat img {
		transition: opacity 300ms;
	}

	.cat.away img {
		opacity: 0.12;
	}

	/* Held over its tile, the tile lights up to show it can be dropped back in. */
	.cat.dropping img {
		opacity: 0.45;
	}

	.cat.dropping {
		outline: 1px dashed var(--accent);
		outline-offset: 3px;
	}

	/* mpv-style subtitles: the cat's voice. */
	.subtitles {
		position: fixed;
		inset-inline: 0;
		bottom: 40px;
		z-index: 70;
		display: flex;
		justify-content: center;
		padding: 0 16px;
		pointer-events: none;
	}

	.subtitles p {
		margin: 0;
		max-width: 80ch;
		text-align: center;
		font-size: clamp(17px, 2.4vw, 24px);
		font-weight: 600;
		line-height: 1.3;
		color: #f4e04d;
		text-shadow:
			2px 2px 0 #000,
			-2px -2px 0 #000,
			2px -2px 0 #000,
			-2px 2px 0 #000,
			0 2px 0 #000,
			0 -2px 0 #000,
			2px 0 0 #000,
			-2px 0 0 #000;
		animation: appear 200ms ease-out;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}
</style>
