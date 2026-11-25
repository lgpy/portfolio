/**
 * The cat's voice: one line at a time, typed a letter at a time, with a small queue.
 *
 * `talk` waits for the current sentence and keeps only the newest waiting line; `blurt`
 * interrupts, for being grabbed or poked. A blurt can be held: it must not be cut off for a
 * while, so anything that would have interrupted it queues instead, and while it waits its own
 * turn nothing less important can take its place in the queue. The bubble reads `line`
 * reactively, and `onSaid` gets each line once it has finished typing (for the screen reader).
 */
import { reducedMotion } from '#lib/eggs/state.svelte.js';

export type Utterance = { text: string; id: number; shown: number };
type Waiting = { text: string; then?: () => void; hold: number };

export function createSpeech(onSaid?: (text: string) => void) {
	let line = $state<Utterance>();
	let pending: Waiting | undefined;
	let marks = new Map<string, number>();
	let ids = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** The line that must not be cut off before `holdUntil`, if any. */
	let holdId: number | undefined;
	let holdUntil = 0;

	/** Rate-limits a kind of remark: false if `key` was said less than `every` ms ago. */
	function allowed(key?: string, every = 0) {
		if (!key) return true;
		const now = performance.now();
		if (now - (marks.get(key) ?? -1e9) < every) return false;
		marks.set(key, now);
		return true;
	}

	/** Whether the line that is up is one that is being held. */
	function holding() {
		return !!line && line.id === holdId && performance.now() < holdUntil;
	}

	/** Say something when done with the current sentence. Only the latest waiting line is kept. */
	function talk(text: string, key?: string, every = 0, then?: () => void) {
		if (!allowed(key, every)) return;
		if (!line) speak(text, then);
		else if (!pending?.hold) pending = { text, then, hold: 0 };
	}

	/**
	 * Say something right now, cutting off whatever it was saying, unless that line is held.
	 * `hold`: ms this line must stay up before anything may cut it off (a warning, a tantrum).
	 */
	function blurt(text: string, key?: string, every = 0, then?: () => void, hold = 0) {
		if (!allowed(key, every)) return;
		// A held line has to be readable: what would have interrupted it waits its turn instead.
		// The queue keeps one line, and a held line waiting there isn't replaced by a lesser one.
		// A held line waiting there also keeps its turn just after the one before it was let go,
		// until the speech gets round to saying it.
		if (holding() || pending?.hold) {
			if (hold || !pending?.hold) pending = { text, then, hold };
			return;
		}
		pending = undefined;
		speak(text, then, hold);
	}

	/** Let the current line go, and say anything that is waiting. */
	function clear(id: number) {
		if (line?.id !== id) return;
		// A held line stays up for its whole hold, even once it has finished being said.
		if (holding()) {
			timer = setTimeout(() => clear(id), holdUntil - performance.now() + 20);
			return;
		}
		line = undefined;
		const next = pending;
		pending = undefined;
		if (next) speak(next.text, next.then, next.hold);
	}

	/** `then` runs once the line is fully said, if nothing has interrupted it; either way the line clears. */
	function speak(text: string, then?: () => void, hold = 0) {
		const id = ids++;
		line = { text, id, shown: reducedMotion() ? text.length : 0 };
		clearTimeout(timer);
		if (hold) {
			holdId = id;
			holdUntil = performance.now() + hold;
		}
		// It talks a letter at a time, pausing at punctuation, then either does its thing or sits
		// a moment. Both paths run through `clear`, so a line can never keep the bubble for good.
		const step = () => {
			if (line?.id !== id) return;
			if (line.shown < text.length) {
				line.shown += 1;
				const ch = text[line.shown - 1];
				timer = setTimeout(step, /[.!?]/.test(ch) ? 220 : ch === ',' ? 120 : 28);
				return;
			}
			onSaid?.(text);
			timer = setTimeout(
				() => {
					if (line?.id !== id) return;
					// Even if its business throws, the line must not stay up for good.
					try {
						then?.();
					} finally {
						clear(id);
					}
				},
				then ? 600 : pending ? 900 : 1400 + text.length * 35
			);
		};
		timer = setTimeout(step, 80);
	}

	return {
		get line() {
			return line;
		},
		get talking() {
			return !!line && line.shown < line.text.length;
		},
		talk,
		blurt,
		/** Whether a rate-limited kind of remark has ever been made this visit. */
		has: (key: string) => marks.has(key),
		/** Pretend a kind of remark was just made, to hold it back for a while. */
		mark: (key: string) => void marks.set(key, performance.now()),
		/**
		 * Drop any hold and anything waiting, so the next blurt is said at once: for a line that
		 * closes a moment (sent home, calmed down), which must not wait behind one that is over.
		 */
		cut() {
			holdId = undefined;
			holdUntil = 0;
			pending = undefined;
		},
		stop() {
			clearTimeout(timer);
			line = undefined;
			pending = undefined;
			holdId = undefined;
			holdUntil = 0;
		}
	};
}

export type Speech = ReturnType<typeof createSpeech>;
