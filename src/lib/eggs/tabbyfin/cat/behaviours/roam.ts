/**
 * How the cat swims: for whatever the body's statechart says it is doing, where to head this
 * frame, how hard and how often, and how close counts as there. The frame loop's physics does the
 * swimming; this only picks its target, and what it says while it keeps the cursor company.
 */
import type { Act } from '../lines';
import type { Cat, Spot } from '../context';
import { happened } from '../being';
import { hone } from '#lib/eggs/state.svelte.js';
import * as ram from './ram';
import { clampToView } from '../view';

/** What the cat is doing, as far as swimming is concerned. */
export type Where =
	| 'held'
	| 'company'
	| 'seek'
	| 'trip'
	| 'sleep'
	| 'homing'
	| 'edge-waiting'
	| 'edge-backing-up'
	| 'edge-charging'
	| 'edge-ramming'
	| 'edge-sulking';

/** Where to swim, how hard, how often, and how close counts as there. */
export type Step = {
	target?: { x: number; y: number };
	power: number;
	every: number;
	near: number;
	/** The cursor is on it: it holds still to be petted. */
	settle: boolean;
};

/** Decide where it swims this frame, for the spot the machine says it is going to. */
export function swim(cat: Cat, now: number, where: Where, spot?: Spot): Step {
	const step: Step = { power: 0, every: 1000, near: 30, settle: false };
	// Cross with you, it keeps to itself: it neither follows the cursor nor waits where it left.
	const cross = cat.brain.cross;

	if (where === 'company') {
		// Keep a friendly distance from the cursor, a little above it, unless it's right on top
		// of it: then it holds still and lets you pet it.
		const dx = cat.x - cat.cursor.x || 1;
		const dy = cat.y - cat.cursor.y;
		const d = Math.hypot(dx, dy) || 1;
		step.settle = d < 40 && !cat.flying;
		if (!step.settle && !cross) {
			step.target = { x: cat.cursor.x + (dx / d) * 95, y: cat.cursor.y + (dy / d) * 95 - 10 };
			step.power = 0.9;
			step.every = 1200;
			step.near = 35;
		}
	} else if (where === 'seek') {
		step.target = cat.cursor;
		step.power = 2;
		step.every = 600;
		step.near = 70;
	} else if (where === 'trip') {
		// On the tour the tour says when to move on; the spot itself swims the same either way.
		if (spot) step.target = spot;
		step.power = 1.3;
		step.every = 900;
	} else if (where === 'homing') {
		// Escape: swim back to its tile and go home on arrival, like being dropped there.
		const r = cat.home.getBoundingClientRect();
		step.target = clampToView(
			{ x: r.left + r.width / 2, y: r.top + r.height / 2 },
			innerWidth,
			innerHeight,
			cat.size / 2
		);
		step.power = 2.2;
		step.every = 400;
		step.near = 8;
	} else if (where === 'edge-waiting') {
		// It waits at the edge where the cursor left, until the statechart sends it off instead.
		if (!cat.flying) {
			step.target = cat.left;
			step.power = 2;
			step.every = 600;
			step.near = 16;
		}
	} else if (where === 'edge-backing-up') {
		// Lining up a run at the edge the cursor went through. The charge is the statechart's.
		if (!cat.flying) {
			const { wallX, dir } = ram.edge(cat);
			Object.assign(step, ram.backup(cat, wallX, dir));
		}
	} else if (where === 'edge-charging') {
		if (!cat.flying) ram.charge(cat, ram.edge(cat).dir);
	} else if (where === 'edge-sulking') {
		if (!cat.flying) {
			const { wallX, dir } = ram.edge(cat);
			Object.assign(step, ram.sulk(cat, wallX, dir));
		}
	}

	return step;
}

/** What it decided to say, and when it may say something next. */
export type Chat = { act?: Act; nextChat: number };

/**
 * Small talk while it keeps the cursor company. Picks the line, says it, and notes what its act
 * is so the body can show a trick a moment later. Returns the act, if it has one worth waiting for,
 * and when it should next chat.
 */
export function chat(cat: Cat, now: number, still: boolean): Chat {
	const moodNow = cat.mood();
	let { text, act } = cat.script.pick('chat', moodNow, cat.bond());
	// With reduced motion there is no trick to show, so say something else instead.
	for (let i = 0; still && act === 'trick' && i < 5; i++) {
		({ text, act } = cat.script.pick('chat', moodNow, cat.bond()));
	}
	if (still && act === 'trick')
		({ text, act } = { text: cat.script.next('nothing', moodNow, cat.bond()), act: undefined });
	if (act === 'cursor') {
		if (cat.restyled) cat.speech.talk(cat.script.next('cursorAgain', moodNow, cat.bond()));
		else cat.speech.talk(text, undefined, 0, cat.restyle);
	} else {
		cat.speech.talk(text);
		if (act !== 'trick' && moodNow !== 'grumpy' && Math.random() < 0.4) cat.feel('happy', 1500);
	}
	happened(cat, 'chatted');
	// The mood boost that may have brought this chat forward is spent.
	cat.eagerUntil = -1e9;
	return { act, nextChat: now + cat.brain.chatGap(moodNow) * 1000 };
}

/**
 * It has reached its spot: it says what there is to say about it, and the place is seen. A mischief
 * spot is something to nudge and a fiddle spot is something to mess with, not a place on the page:
 * getting to either is not exploring.
 */
export function arrive(cat: Cat, spot: Spot | undefined, now: number): number {
	if (!spot) return now;
	if (!spot.mischief && !spot.fiddle) {
		happened(cat, 'explored');
		// Seen once it gets there, so a cancelled trip doesn't use the spot up. The bunny stays on
		// the list until it has actually found the game there.
		const key = spot.key;
		if (key !== 'somewhere' && key !== 'errand' && (key !== 'bunny' || hone.found)) cat.seen.add(key);
	}
	const more = spot.more;
	if (spot.line) cat.speech.talk(spot.line, undefined, 0, more ? () => cat.speech.talk(more) : undefined);
	return now;
}
