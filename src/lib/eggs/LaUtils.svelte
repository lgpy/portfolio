<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import { bounce } from '#lib/bounce.js';
	import { GOLD, hone, reducedMotion, type Honer, type Outcome } from '#lib/eggs/state.svelte.js';
	import { getStored, setStored } from '#lib/eggs/storage.js';
	import type { Project } from '#lib/projects.js';

	let { project }: { project: Project } = $props();

	// Each click on the bunny is a honing attempt, and each tier of success upgrades the whole
	// page. Nothing shows at first: the jelly cat finds the game by honing her itself, and from
	// then on the level sits next to her name.
	const MAX = GOLD;
	const KEY = 'la-utils-hone';
	const POSES = { idle: 0, success: 1, fail: 2 } as const;
	/** Page upgrades by level. app.css styles each `hone-N` class on <html>. */
	const TIERS = [
		[3, 'the rows glow'],
		[6, 'headings reforged'],
		[9, 'gilded tiles'],
		[12, 'golden borders'],
		[15, 'gilded tags'],
		[18, 'a shimmering name'],
		[21, 'stardust'],
		[GOLD, 'fully honed']
	] as const;

	type Pose = keyof typeof POSES;
	type Tone = 'good' | 'bad' | 'tier';

	// Success chance per level, in percent, loosely after Lost Ark's honing table.
	function chance(level: number) {
		if (level < 4) return 100;
		if (level < 7) return 60;
		if (level < 10) return 45;
		if (level < 13) return 30;
		if (level < 16) return 15;
		if (level < 19) return 10;
		if (level < 22) return 5;
		return 3;
	}

	let energy = $state(0);
	let pose = $state<Pose>('idle');
	let result = $state<{ id: number; text: string; tone: Tone }>();
	let flash = $state(0);
	let row = $state<HTMLElement>();
	let nextId = 0;
	let rest: ReturnType<typeof setTimeout> | undefined;
	/** Which save is the latest; an older deferred save must not land after a newer one. */
	let saveToken = 0;
	/** The save waiting for its task, written straight away if the page goes before it lands. */
	let pending: Saved | undefined;

	type Saved = { level?: number; energy?: number; found?: boolean };

	function loadSaved(): Saved | null {
		try {
			const saved = JSON.parse(getStored(KEY) ?? 'null');
			return saved && typeof saved === 'object' ? (saved as Saved) : null;
		} catch {
			return null;
		}
	}

	/** Take on what is stored, whoever wrote it last. */
	function adopt(saved: Saved | null) {
		if (typeof saved?.level !== 'number') return;
		hone.level = Math.min(MAX, Math.max(0, saved.level));
		energy = Math.min(100, Math.max(0, saved.energy ?? 0));
		hone.found = saved.found === true || hone.level > 0;
	}

	onMount(() => {
		adopt(loadSaved());

		// Another tab honed: adopt its level rather than saving a stale one back over it.
		const onStorage = (event: StorageEvent) => {
			if (event.key !== KEY || !event.newValue) return;
			try {
				adopt(JSON.parse(event.newValue));
			} catch {}
		};
		// Leaving right after a hone: write it now, the deferred task may never run.
		const flush = () => {
			if (!pending) return;
			const mine = pending;
			pending = undefined;
			saveToken += 1;
			const stored = loadSaved();
			if (!(typeof stored?.level === 'number' && stored.level > (mine.level ?? 0))) setStored(KEY, JSON.stringify(mine));
		};
		const onHidden = () => document.visibilityState === 'hidden' && flush();
		window.addEventListener('storage', onStorage);
		window.addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', onHidden);
		return () => {
			flush();
			window.removeEventListener('storage', onStorage);
			window.removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onHidden);
		};
	});

	// Mirror the level onto <html>, where the page-wide upgrades hang off.
	$effect(() => {
		const html = document.documentElement;
		for (const [level] of TIERS) html.classList.toggle(`hone-${level}`, hone.level >= level);
	});

	function save(reset = false) {
		const token = ++saveToken;
		const mine = { level: hone.level, energy, found: hone.found };
		if (reset) {
			pending = undefined;
			setStored(KEY, JSON.stringify(mine));
			return;
		}
		pending = mine;
		// A tab whose renderer was busy can still hold the level from before another tab honed;
		// its localStorage read is stale until the queued storage update lands. Save a task later,
		// re-read, and adopt a higher stored level instead of writing this stale one back.
		setTimeout(() => {
			if (token !== saveToken) return;
			pending = undefined;
			const stored = loadSaved();
			if (typeof stored?.level === 'number' && stored.level > mine.level) {
				adopt(stored);
				return;
			}
			setStored(KEY, JSON.stringify(mine));
		}, 0);
	}

	/** The attempt's outcome, shown for a moment next to the level in the heading. */
	function report(text: string, tone: Tone) {
		result = { id: nextId++, text, tone };
	}

	function setPose(next: Pose) {
		pose = next;
		clearTimeout(rest);
		rest = setTimeout(() => (pose = 'idle'), 1000);
	}

	let bunny = $state<HTMLButtonElement>();
	let attempts = 0;

	function announce(outcome: Outcome, by: Honer, tier?: number) {
		hone.last = { id: attempts++, outcome, tier, by };
		return outcome;
	}

	function attempt(by: Honer = 'you'): Outcome {
		if (by === 'cat') {
			bounce(bunny?.firstElementChild ?? null);
			hone.found = true;
		} else hone.honedByYou = true;
		if (hone.level >= MAX) {
			report('max. go outside', 'tier');
			return announce('max', by);
		}
		const pity = energy >= 100;
		const odds = pity ? 100 : chance(hone.level);
		if (Math.random() * 100 < odds) {
			hone.level += 1;
			energy = 0;
			setPose('success');
			const tier = TIERS.find(([level]) => level === hone.level);
			if (tier) {
				report(tier[1], 'tier');
				flash += 1;
				save();
				return announce('tier', by, tier[0]);
			}
			report(pity ? 'energy carried it' : 'success', 'good');
			save();
			return announce('success', by);
		} else {
			energy = Math.min(100, energy + odds * 0.465);
			setPose('fail');
			report(`failed · ${Math.floor(energy)}% energy`, 'bad');
			if (!reducedMotion()) {
				row?.animate(
					[
						{ translate: '0 0' },
						{ translate: '-4px 0' },
						{ translate: '3px 0' },
						{ translate: '-2px 0' },
						{ translate: '0 0' }
					],
					{ duration: 260 }
				);
			}
		}
		save();
		return announce('fail', by);
	}

	onMount(() => {
		hone.attempt = attempt;
		return () => (hone.attempt = undefined);
	});

	function reset() {
		hone.level = 0;
		energy = 0;
		save(true);
		report('the bunny forgives you', 'good');
		announce('reset', 'you');
	}

	function onclick(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		bounce(event.currentTarget.firstElementChild);
		// Until the cat has shown you, she's just a bunny.
		if (hone.found) attempt();
	}
</script>

<div bind:this={row}>
	<ProjectRow {project}>
		{#snippet icon()}
			<button
				bind:this={bunny}
				class="mascot roll"
				type="button"
				aria-label="LA Utils' bunny"
				{onclick}
			>
				<img src="/mascots/bunny-{POSES[pose]}.webp" alt="" width="44" height="44" />
			</button>
		{/snippet}

		{#snippet badge()}
			{#if !hone.found}
				<!-- Nothing to see yet. -->
			{:else if hone.level === 0}
				<span class="plus mono zero">+0</span>
			{:else}
				<button
					class="plus mono"
					type="button"
					title="Reset honing"
					aria-label="Honed to +{hone.level}. Reset honing"
					onclick={reset}>+{hone.level}</button
				>
			{/if}
			<span class="result" aria-live="polite">
				{#key result?.id}
					{#if result}<span class={['mono', result.tone]}>{result.text}</span>{/if}
				{/key}
			</span>
		{/snippet}
	</ProjectRow>
</div>

{#key flash}
	{#if flash}<div class="flash" aria-hidden="true"></div>{/if}
{/key}

<style>
	.roll {
		touch-action: manipulation;
	}

	.plus {
		all: unset;
		font-size: 13px;
		color: var(--accent);
		cursor: pointer;
	}

	.plus.zero {
		color: var(--faint);
		cursor: default;
	}

	.plus:not(.zero):hover {
		text-decoration: line-through;
	}

	.plus:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.result span {
		font-size: 12px;
		font-weight: 400;
		color: var(--muted);
		animation: report 2200ms ease-out forwards;
	}

	.result .bad {
		color: var(--faint);
	}

	.result .tier {
		color: var(--gold);
	}

	@keyframes report {
		from {
			opacity: 0;
			translate: -4px 0;
		}
		10%,
		75% {
			opacity: 1;
			translate: 0 0;
		}
		to {
			opacity: 0;
		}
	}

	@keyframes fade {
		to {
			opacity: 0;
		}
	}

	.flash {
		position: fixed;
		inset: 0;
		z-index: 60;
		pointer-events: none;
		background: radial-gradient(circle at 50% 40%, oklch(0.8 0.14 80 / 0.22), transparent 70%);
		animation: fade 900ms ease-out forwards;
	}

	@media (prefers-reduced-motion: reduce) {
		.result span {
			animation-name: fade;
			animation-timing-function: steps(1, end);
		}
	}
</style>
