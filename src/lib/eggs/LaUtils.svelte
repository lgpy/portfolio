<script lang="ts">
	import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from '@ui-sdk/svelte/meter';
	import { Button } from '@ui-sdk/svelte/button';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import ProjectRow from '#lib/components/ProjectRow.svelte';
	import { bounce } from '#lib/bounce.js';
	import type { Project } from '#lib/projects.js';

	let { project }: { project: Project } = $props();

	const MAX = 25;
	const KEY = 'la-utils-honing';
	const POSES = { idle: 0, success: 1, fail: 2 } as const;
	type Pose = keyof typeof POSES;
	type Honing = { level: number; bonus: number; energy: number };

	// Success chance per level, in percent, loosely after Lost Ark's honing table.
	function base(level: number) {
		if (level < 4) return 100;
		if (level < 7) return 60;
		if (level < 10) return 45;
		if (level < 13) return 30;
		if (level < 16) return 15;
		if (level < 19) return 10;
		if (level < 22) return 5;
		return 3;
	}

	function load(): Honing {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) ?? '');
			if (typeof saved?.level === 'number') return saved;
		} catch {}
		return { level: 0, bonus: 0, energy: 0 };
	}

	let open = $state(false);
	let honing = $state<Honing>({ level: 0, bonus: 0, energy: 0 });
	let pose = $state<Pose>('idle');
	let message = $state('');

	let maxed = $derived(honing.level >= MAX);
	let pity = $derived(honing.energy >= 100);
	let chance = $derived(pity ? 100 : Math.min(base(honing.level) + honing.bonus, base(honing.level) * 2));

	onMount(() => {
		honing = load();
	});

	function start(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		bounce(event.currentTarget.firstElementChild);
		if (!open) {
			open = true;
			message = 'Double-click me again to hone.';
			return;
		}
		hone();
	}

	function hone() {
		if (maxed) return;
		const b = base(honing.level);
		const carried = pity;
		if (Math.random() * 100 < chance) {
			honing = { level: honing.level + 1, bonus: 0, energy: 0 };
			pose = 'success';
			message = carried ? "Artisan's energy carried it. Success." : 'Success!';
			if (honing.level >= MAX) message = 'Max level. Go outside.';
		} else {
			honing = {
				level: honing.level,
				bonus: Math.min(honing.bonus + b * 0.1, b),
				energy: Math.min(honing.energy + chance * 0.465, 100)
			};
			pose = 'fail';
			message = 'Failed.';
		}
		localStorage.setItem(KEY, JSON.stringify(honing));
	}

	function reset() {
		honing = { level: 0, bonus: 0, energy: 0 };
		pose = 'idle';
		message = 'Back to +0. The bunny forgives you.';
		localStorage.removeItem(KEY);
	}

	const percent = (n: number) => `${Number(n.toFixed(2))}%`;
</script>

<ProjectRow {project}>
	{#snippet icon()}
		<button
			class="mascot"
			type="button"
			aria-label="LA Utils' bunny"
			ondblclick={start}
		>
			<img src="/mascots/bunny-{POSES[pose]}.webp" alt="" width="44" height="44" />
		</button>
	{/snippet}

	{#snippet badge()}
		{#if honing.level > 0}
			<span class="plus mono">+{honing.level}</span>
		{/if}
	{/snippet}

	{#if open}
		<div class="egg" transition:slide={{ duration: 250 }}>
			<img class="pose" src="/mascots/bunny-{POSES[pose]}.webp" alt="" width="88" height="80" />
			<div class="stats mono">
				<div class="level">
					+{honing.level}
					{#if !maxed}<span class="muted">→ +{honing.level + 1} · {percent(chance)}</span>{/if}
				</div>
				<Meter value={honing.energy} format={(v: number) => percent(v)}>
					<div class="row">
						<MeterLabel>Artisan's energy</MeterLabel>
						<MeterValue />
					</div>
					<MeterTrack>
						<MeterIndicator />
					</MeterTrack>
				</Meter>
				<p class={['message', { fail: pose === 'fail' }]} aria-live="polite">{message}</p>
				<div class="actions">
					<Button data-variant="solid" onclick={hone} disabled={maxed}>Hone</Button>
					{#if honing.level > 0}
						<Button onclick={reset}>Reset</Button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</ProjectRow>

<style>
	.plus {
		font-size: 13px;
		color: var(--accent);
	}

	.egg {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}

	.pose {
		flex: none;
		object-fit: contain;
	}

	.stats {
		flex: 1;
		min-width: 0;
		font-size: 12px;
	}

	.level {
		font-size: 20px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.muted {
		font-size: 13px;
		font-weight: 400;
		color: var(--ui-muted-foreground);
	}

	.row {
		display: flex;
		justify-content: space-between;
		color: var(--ui-muted-foreground);
		margin-bottom: 4px;
	}

	.stats :global([data-slot='meter']) {
		min-width: 0;
	}

	.stats :global([data-slot='meter-track']) {
		height: 6px;
		background: var(--ui-muted);
	}

	.stats :global([data-slot='meter-indicator']) {
		background: var(--gold);
	}

	.message {
		margin: 8px 0 0;
		min-height: 1.5em;
		color: var(--ui-muted-foreground);
	}

	.message.fail {
		color: var(--danger);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}

</style>
