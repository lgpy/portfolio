/**
 * The guided tour: on a first visit, a little while after it comes out, it shows you round the
 * page a stop at a time; on a later visit it now and then offers it again. The body's statechart
 * (../machine.ts) runs it as a branch of what the cat is doing: planned and ready are a guard
 * while it keeps you company, and announcing, visiting and done are states of their own.
 *
 *   company, due --announcing (0.9s)--> visiting (one stop) --> company/seek
 *
 * The first tour is given once per browser, finished or not.
 */
import { hone } from '#lib/eggs/state.svelte.js';
import { getStored, setStored } from '#lib/eggs/storage.js';
import type { Moment } from '../lines';
import type { Mood } from '../brain';
import type { Cat, Spot } from '../context';
import { clampToView } from '../view';

const TOURED = 'tabbyfin-toured';
/** How long after it comes out the tour starts. */
export const DELAY = 10_000;
/** How long it says it's setting off before it does. */
export const ANNOUNCE = 900;
/** How likely a later let-out offers the tour again, at most once per page load. */
const AGAIN = 0.15;
/** How long after the last tour before it may offer one again: nothing's changed in a day. */
const AGAIN_AFTER = 7 * 86_400_000;
/** How long it stays at a stop once it has finished talking there. */
export const DWELL = 1500;
/** Moods it would rather not give a tour in. */
export const NOT_NOW: Mood[] = ['grumpy', 'dizzy', 'sleepy', 'sheepish', 'evil'];

type Stop = {
	find: () => Element | null | undefined;
	say: () => Moment[];
	/** The explore spot this stop covers, so it isn't visited again afterwards. */
	key?: string;
};

const project = (i: number) => document.querySelectorAll('.project h3')[i];
const tag = (name: string) => [...document.querySelectorAll('.tags li')].find((li) => li.textContent?.trim() === name);

const STOPS: Stop[] = [
	{ find: () => document.querySelector('main .label'), say: () => ['tourProjects', 'tourHardDrive'] },
	{ find: () => project(0), say: () => ['tourTabbyfin'] },
	{ find: () => tag('rust'), say: () => ['tourRust'], key: 'tag-rust' },
	{ find: () => project(1), say: () => ['tourFamily'] },
	{ find: () => project(2), say: () => [hone.found ? 'tourBunnyMet' : 'tourBunny'] },
	{ find: () => document.querySelector('header nav a'), say: () => ['tourGithub'], key: 'github' },
	{ find: () => document.querySelector('footer span'), say: () => ['tourEnd'], key: 'footer' }
];

/** Whether the tour was offered again already on this page load. */
let offered = false;

/** Whether this let-out gets a tour, and whether it has been given before. */
export function planTour(): { again: boolean } | undefined {
	const stored = getStored(TOURED);
	if (!stored) return { again: false };
	// When it was last given; an old "1" counts as long ago.
	const last = Number(stored) || 0;
	if (offered || Date.now() - last < AGAIN_AFTER || Math.random() >= AGAIN) return undefined;
	offered = true;
	return { again: true };
}

/** The first tour has been given: a later visit only gets one by chance. */
export function markToured() {
	setStored(TOURED, String(Date.now()));
}

/** Swim to the first stop from `from` that is on screen: where it is, and its index, or -1 if none is. */
export function goTo(cat: Cat, from: number): { at: number; spot?: Spot } {
	for (let i = from; i < STOPS.length; i++) {
		const stop = STOPS[i];
		const el = stop.find();
		if (!el) continue;
		const r = el.getBoundingClientRect();
		if (r.bottom <= 0 || r.top >= innerHeight) continue;
		const [first, then] = stop.say().map((m) => cat.script.next(m, cat.mood(), cat.bond()));
		// Near the start of the text: a heading's box spans the row, but its words are on the left.
		const at = clampToView({ x: r.left + Math.min(r.width / 2, 60), y: r.top - 36 }, innerWidth, innerHeight, 40);
		return {
			at: i,
			spot: {
				x: at.x,
				y: Math.max(50, at.y),
				line: first,
				key: stop.key ?? `tour-${i}`,
				tour: i,
				// Said after the first, not on a timer: the first may still be waiting its turn when it gets there.
				more: then
			}
		};
	}
	return { at: -1 };
}

/** How many stops the tour has. */
export const STOPS_TOTAL = STOPS.length;
