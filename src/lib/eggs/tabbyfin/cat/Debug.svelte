<script lang="ts">
	import { onMount } from 'svelte';
	import { METERS, type Brain } from './brain';
	import type { Probe } from './context';

	// Development only: what the cat is feeling and thinking. Tabbyfin renders it with the
	// backquote key; the brain's meters are plain numbers, so sample them a few times a second.
	let { brain, probe }: { brain: Brain; probe: Probe } = $props();

	let pulse = $state(0);
	onMount(() => {
		const id = setInterval(() => (pulse += 1), 250);
		return () => clearInterval(id);
	});

	// The meters are plain numbers, so tick the sampler and read it again a few times a second.
	// `void pulse` is what makes each derived depend on the tick: they must refresh on their own.
	const meters = $derived.by(() => {
		void pulse;
		return METERS.map((name) => ({ name, value: Math.round(brain.meters[name]) }));
	});
	const scores = $derived.by(() => {
		void pulse;
		return (Object.entries(probe.scores) as [string, number][])
			.map(([name, value]) => `${name} ${value.toFixed(2)}`)
			.join('  ');
	});
	const evil = $derived.by(() => {
		void pulse;
		return { on: probe.evil ?? false, for: Math.round(brain.evilFor), at: Math.round(brain.evilAt) };
	});
</script>

<div class="debug mono" aria-hidden="true">
	{#each meters as meter (meter.name)}
		<div class="row">
			<span class="name">{meter.name}</span>
			<span class="bar"><span class="fill" style:width="{meter.value}%"></span></span>
			<span class="value">{meter.value}</span>
		</div>
	{/each}
	<div class="row"><span class="name">mood</span><span class="wide">{probe.mood}</span></div>
	<div class="row"><span class="name">mode</span><span class="wide">{probe.mode}</span></div>
	<div class="row"><span class="name">last</span><span class="wide">{probe.pastime ?? 'none'}</span></div>
	<div class="row"><span class="name">evil</span><span class="wide">{evil.on ? 'yes' : 'no'}</span></div>
	<div class="row"><span class="name">evil for</span><span class="wide">{evil.for}s</span></div>
	<div class="row"><span class="name">evil at</span><span class="wide">{evil.at}</span></div>
	<div class="row"><span class="name">act</span><span class="wide">{probe.act ?? 'none'}</span></div>
	<div class="row"><span class="name">scores</span><span class="wide">{scores}</span></div>
</div>

<style>
	.debug {
		position: fixed;
		left: 8px;
		bottom: 8px;
		z-index: 80;
		width: 250px;
		padding: 8px 10px;
		font-size: 10px;
		line-height: 1.5;
		color: #d9c6ee;
		background: rgb(12 8 18 / 0.88);
		border: 1px solid #4a3a5a;
		border-radius: 6px;
		pointer-events: none;
		user-select: none;
	}

	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.name {
		width: 62px;
		opacity: 0.7;
	}

	.bar {
		flex: 1;
		height: 5px;
		overflow: hidden;
		background: #2a2134;
		border-radius: 3px;
	}

	.fill {
		display: block;
		height: 100%;
		background: #c396e7;
	}

	.value {
		width: 22px;
		text-align: right;
	}

	.wide {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
