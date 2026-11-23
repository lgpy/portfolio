<script lang="ts">
	import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/svelte/dialog';
	import { tick } from 'svelte';
	import { projects } from '#lib/projects.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const KONAMI = [
		'ArrowUp',
		'ArrowUp',
		'ArrowDown',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'ArrowLeft',
		'ArrowRight',
		'b',
		'a'
	];
	const HELP = [
		'help              this list',
		'ls                list projects',
		'cat <project>     read about one',
		'open <project>    open its site or code',
		'whoami            who made this',
		'clear             clear the screen',
		'exit              close the terminal'
	];

	type Line = { id: number; kind: 'in' | 'out' | 'err'; text: string };

	let progress = 0;
	let nextId = 2;
	let lines = $state<Line[]>([
		{ id: 0, kind: 'out', text: 'lgpy.dev shell. Type help.' },
		{ id: 1, kind: 'out', text: projects.map((p) => `${p.id}/`).join('  ') }
	]);
	let input = $state('');
	let screen = $state<HTMLElement>();

	function out(text: string, kind: Line['kind'] = 'out') {
		lines.push({ id: nextId++, kind, text });
	}

	function find(name: string) {
		const q = name.replace(/\/$/, '').toLowerCase();
		return projects.find((p) => p.id === q || p.name.toLowerCase() === q);
	}

	function run(raw: string) {
		const [cmd = '', ...args] = raw.trim().split(/\s+/);
		const arg = args.join(' ');
		switch (cmd) {
			case '':
				return;
			case 'help':
				return HELP.forEach((l) => out(l));
			case 'ls':
				return out(projects.map((p) => `${p.id}/`).join('  '));
			case 'cat':
			case 'open': {
				const p = find(arg);
				if (!p) return out(`${cmd}: ${arg || 'missing project'}: No such file or directory`, 'err');
				if (cmd === 'cat') return out(`${p.name}: ${p.blurb}`);
				window.open(p.site ?? p.code, '_blank', 'noopener');
				return out(`opening ${p.site ?? p.code}`);
			}
			case 'whoami':
				return out('lgpy. builds native apps, game tools and things for family.');
			case 'sudo':
				return out('lgpy is not in the sudoers file. This incident will be reported.', 'err');
			case 'rm':
				return out('rm: nice try.', 'err');
			case 'clear':
				lines = [];
				return;
			case 'exit':
				open = false;
				return;
			default:
				return out(`${cmd}: command not found. Try help.`, 'err');
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		out(input, 'in');
		run(input);
		input = '';
		await tick();
		screen?.scrollTo({ top: screen.scrollHeight });
	}

	function onkeydown(event: KeyboardEvent) {
		if (open || event.target instanceof HTMLInputElement) return;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		progress = key === KONAMI[progress] ? progress + 1 : key === KONAMI[0] ? 1 : 0;
		if (progress === KONAMI.length) {
			progress = 0;
			open = true;
		}
	}

</script>

<svelte:window {onkeydown} />

<Dialog bind:open>
	<DialogBackdrop />
	<DialogContent class="terminal" initialFocus="#terminal-input">
		<div class="bar">
			<DialogTitle class="mono">lgpy@dev: ~</DialogTitle>
		</div>
		<div class="screen mono" bind:this={screen}>
			{#each lines as line (line.id)}
				<div class={line.kind}>
					{#if line.kind === 'in'}<span class="prompt">$</span>{/if}{line.text}
				</div>
			{/each}
			<form onsubmit={submit}>
				<label class="prompt" for="terminal-input">$</label>
				<input
					id="terminal-input"
					bind:value={input}
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					aria-label="Command"
				/>
			</form>
		</div>
	</DialogContent>
</Dialog>

<style>
	:global([data-slot='dialog-content'].terminal) {
		width: min(640px, calc(100vw - 32px));
		max-width: none;
		padding: 0;
		gap: 0;
		background: oklch(0.12 0 0);
		border: 1px solid var(--ui-border);
	}

	.bar {
		padding: 8px 14px;
		border-bottom: 1px solid var(--ui-border);
	}

	.bar :global([data-slot='dialog-title']) {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--ui-muted-foreground);
	}

	.screen {
		height: min(360px, 60vh);
		overflow-y: auto;
		padding: 12px 14px;
		font-size: 13px;
		line-height: 1.6;
		word-break: break-word;
	}

	.screen > div {
		white-space: pre-wrap;
	}

	.out {
		color: var(--ui-muted-foreground);
	}

	.err {
		color: var(--danger);
	}

	.prompt {
		color: oklch(0.8 0.15 150);
		margin-inline-end: 8px;
	}

	form {
		display: flex;
	}

	input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		padding: 0;
		background: none;
		color: var(--ui-foreground);
		font: inherit;
		caret-color: var(--ui-foreground);
	}
</style>
