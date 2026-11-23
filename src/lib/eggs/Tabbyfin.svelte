<script lang="ts">
	import {
		Slider,
		SliderControl,
		SliderIndicator,
		SliderThumb,
		SliderTrack
	} from '@ui-sdk/svelte/slider';
	import { Button } from '@ui-sdk/svelte/button';
	import { slide } from 'svelte/transition';
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import { bounce } from '#lib/bounce.js';
	import type { Project } from '#lib/projects.js';

	let { project }: { project: Project } = $props();

	// Sintel, the Blender open movie in Tabbyfin's screenshots.
	const RUNTIME = 14 * 60 + 48;
	const PRESSES = 5;

	let presses = $state(0);
	let open = $derived(presses >= PRESSES);
	let playing = $state(true);
	let time = $state(132);
	let upNext = $derived(RUNTIME - time <= 15);

	$effect(() => {
		if (!open || !playing) return;
		const id = setInterval(() => (time = time >= RUNTIME ? 0 : time + 1), 1000);
		return () => clearInterval(id);
	});

	function clock(seconds: number) {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	function press(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		bounce(event.currentTarget.firstElementChild);
		presses += 1;
	}
</script>

<ProjectRow {project}>
	{#snippet icon()}
		<button class="mascot" type="button" aria-label="Tabbyfin's jelly cat" onclick={press}>
			<img src="/mascots/jelly.svg" alt="" width="44" height="44" />
		</button>
	{/snippet}

	{#if open}
		<div class="egg" transition:slide={{ duration: 250 }}>
			<div class="head">
				<Button
					data-variant="solid"
					aria-label={playing ? 'Pause' : 'Play'}
					onclick={() => (playing = !playing)}
				>
					{#if playing}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
					{:else}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19 12z" /></svg>
					{/if}
				</Button>
				<span class="title">Sintel <span class="muted">(2010)</span></span>
				{#if upNext}
					<span class="next mono" transition:slide={{ axis: 'x', duration: 200 }}>up next: Spring</span>
				{/if}
			</div>
			<Slider bind:value={time} min={0} max={RUNTIME} step={1}>
				<SliderControl>
					<SliderTrack>
						<SliderIndicator />
						<SliderThumb aria-label="Seek" />
						<img
							class={['rider', { still: !playing }]}
							src="/mascots/jelly.svg"
							alt=""
							width="34"
							height="34"
							style:left="{(time / RUNTIME) * 100}%"
						/>
					</SliderTrack>
				</SliderControl>
			</Slider>
			<div class="times mono">
				<span>{clock(time)}</span>
				<span>−{clock(RUNTIME - time)}</span>
			</div>
		</div>
	{/if}
</ProjectRow>

<style>
	.egg {
		padding-top: 12px;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		margin-bottom: 46px;
	}

	.head :global([data-slot='button'] svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}

	.muted {
		color: var(--ui-muted-foreground);
	}

	.next {
		margin-inline-start: auto;
		font-size: 11px;
		color: var(--accent);
		white-space: nowrap;
	}

	.egg :global([data-slot='slider-indicator']) {
		background: var(--accent);
	}

	.rider {
		position: absolute;
		bottom: 10px;
		translate: -50% 0;
		pointer-events: none;
		animation: bob 1.6s ease-in-out infinite;
	}

	.rider.still {
		animation-play-state: paused;
	}

	@keyframes bob {
		50% {
			transform: translateY(-3px) rotate(-4deg);
		}
	}

	.times {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--ui-muted-foreground);
		margin-top: 6px;
	}

	@media (prefers-reduced-motion: reduce) {
		.rider {
			animation: none;
		}
	}
</style>
