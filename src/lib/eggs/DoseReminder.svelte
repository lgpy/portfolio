<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Toast,
		ToastAction,
		ToastClose,
		ToastDescription,
		ToastRegion,
		ToastTitle,
		createToaster
	} from '@ui-sdk/svelte/toast';

	// Each snooze comes back sooner, and pettier.
	const ROUNDS = [
		{ after: 30_000, text: '1× reading the source code' },
		{ after: 20_000, text: 'Still due: 1× reading the source code. Snoozed once.' },
		{ after: 12_000, text: 'Everyone else in the family took theirs on time.' },
		{ after: 8_000, text: 'This reminder is offline-first. It will find you.' },
		{ after: 5_000, text: 'Missed dose logged. A caregiver has been notified (it was me).' }
	];
	const SEEN = 'family-care-dose';

	const toast = createToaster();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function schedule(round: number) {
		const { after } = ROUNDS[Math.min(round, ROUNDS.length - 1)];
		timer = setTimeout(() => remind(round), after);
	}

	function remind(round: number) {
		const last = round >= ROUNDS.length - 1;
		const hour = new Date().getHours();
		toast(`${String(hour).padStart(2, '0')}:00 dose`, {
			description: ROUNDS[Math.min(round, ROUNDS.length - 1)].text,
			duration: Infinity,
			action: {
				label: 'Given',
				onAction: () =>
					toast.success('Dose logged', { description: 'Stock: 0 left. Refill at github.com/lgpy.' })
			},
			cancel: last ? undefined : { label: 'Snooze', onCancel: () => schedule(round + 1) }
		});
	}

	onMount(() => {
		if (sessionStorage.getItem(SEEN)) return;
		sessionStorage.setItem(SEEN, '1');
		schedule(0);
	});

	onDestroy(() => {
		clearTimeout(timer);
		toast.dismiss();
	});
</script>

<ToastRegion toaster={toast} side="bottom" align="end">
	{#snippet children(item)}
		<Toast>
			<div class="head">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
					<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
				</svg>
				<ToastTitle />
			</div>
			<ToastDescription />
			{#if item.action || item.cancel}
				<div class="actions">
					{#if item.action}<ToastAction data-variant="solid" />{/if}
					{#if item.cancel}
						<ToastClose action={item.cancel.onCancel}>{item.cancel.label}</ToastClose>
					{/if}
				</div>
			{/if}
		</Toast>
	{/snippet}
</ToastRegion>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
	}

	.head svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: #8fd0a8;
		stroke-width: 2;
	}

	:global([data-slot='toast-description']) {
		color: var(--ui-muted-foreground);
		margin-top: 2px;
	}

	.actions {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}

	.actions :global(:is([data-slot='toast-action'], [data-slot='toast-close'])) {
		display: inline-flex;
		align-items: center;
		width: auto;
		min-width: 0;
		height: 28px;
		padding-inline: 10px;
		border: 1px solid var(--ui-input);
		background: none;
		color: var(--ui-foreground);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.actions :global([data-slot='toast-action']) {
		background: var(--ui-foreground);
		border-color: var(--ui-foreground);
		color: var(--ui-background);
	}
</style>
