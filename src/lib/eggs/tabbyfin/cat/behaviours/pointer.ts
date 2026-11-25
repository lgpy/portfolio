/**
 * Your hands on the cat: poking it, dragging it out and around, shaking it, throwing it, dropping
 * it back on its tile, and stroking it slowly enough that it settles and purrs. What it then does
 * about it is the body's statechart (../machine.ts); this keeps the maths, reports what the cursor
 * and the pointer did, and says the lines that are about the hand itself. What the cat is in the
 * middle of is no business of this file: the statechart decides which of those reports means
 * something.
 */
import type { Cat } from '../context';
import { happened } from '../being';
import { clampToView } from '../view';

/** Which edge of the window the cursor went out of. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

function overHome(cat: Cat, px: number, py: number) {
	const r = cat.home.getBoundingClientRect();
	return px > r.left - 16 && px < r.right + 16 && py > r.top - 16 && py < r.bottom + 16;
}

/** A poke: what it makes of one is the statechart's, down to whether it was asleep. */
function poke(cat: Cat) {
	cat.send({ type: 'POKE', now: performance.now() });
}

export function press(cat: Cat, event: PointerEvent & { currentTarget: HTMLElement }, held: boolean) {
	if (event.button !== 0 || held) return;
	const now = performance.now();
	cat.pressAt = now;
	cat.press = { x: event.clientX, y: event.clientY, id: event.pointerId };
	// A touch does not move the cursor to the finger, so a still press-and-hold would never look
	// like petting; put the cursor where the press landed.
	cat.cursor = { x: event.clientX, y: event.clientY, moved: now, present: true };
	cat.lastMove = { x: event.clientX, y: event.clientY, t: event.timeStamp };
	event.currentTarget.setPointerCapture(event.pointerId);
	cat.captured = { el: event.currentTarget, id: event.pointerId };
}

export function move(cat: Cat, event: PointerEvent, held: boolean) {
	const now = performance.now();
	const wasIdle = now - cat.cursor.moved;
	const wasGone = !cat.cursor.present;
	const cursor = { x: event.clientX, y: event.clientY, moved: now, present: true };
	cat.cursor = cursor;
	const dc = Math.hypot(cursor.x - cat.x, cursor.y - cat.y);
	if (wasGone) {
		// The cursor was off the page and is back: the statechart knows whether that is worth a word.
		cat.send({
			type: 'CURSOR_BACK',
			slow: now - cat.left.at > 1500,
			dc,
			sideways: cat.left.sideways,
			cross: cat.brain.cross
		});
	}
	// How near the cursor is: a sleeping cat wakes when it comes close enough.
	cat.send({ type: 'CURSOR_NEAR', now, dc });
	// Nothing moved for a long time: it may have something to say about that, wherever it is.
	if (wasIdle > 12_000) cat.send({ type: 'STIRRED', now });

	// Flailing the cursor around gets noticed; a slow stroke over it is petting.
	const speed =
		Math.hypot(cursor.x - cat.lastMove.x, cursor.y - cat.lastMove.y) / Math.max(1, event.timeStamp - cat.lastMove.t);
	cat.lastMove = { x: cursor.x, y: cursor.y, t: event.timeStamp };
	if (!held && event.buttons === 0 && dc < 40 && speed >= 0.03 && speed <= 0.8) {
		if (!cat.petFrom) cat.petFrom = now;
		cat.petLast = now;
	}
	cat.flails = speed > 4 ? cat.flails + 1 : Math.max(0, cat.flails - 1);
	if (cat.flails > 14) {
		cat.flails = 0;
		cat.send({ type: 'FLAIL' });
	}

	if (cat.press && event.pointerId === cat.press.id && !held) {
		if (Math.hypot(cursor.x - cat.press.x, cursor.y - cat.press.y) > 6) {
			cat.grab = { x: cursor.x - cat.x, y: cursor.y - cat.y };
			cat.send({ type: 'GRAB' });
			cat.feel('surprised', 600);
			cat.speech.blurt(cat.script.next('grab', cat.mood(), cat.bond()));
			cat.speech.mark('zoom');
		}
	}
	if (!held) return;
	const nx = cursor.x - cat.grab.x;
	const ny = cursor.y - cat.grab.y;
	const dtm = Math.max(1, now - cat.drag.t) / 16.67;
	const next = { vx: (nx - cat.x) / dtm, vy: (ny - cat.y) / dtm, t: now };
	cat.trail = [...cat.trail.filter((p) => now - p.t < 90), { x: nx, y: ny, t: now }];

	// Shaken back and forth: each sharp change of direction counts.
	const reversed = next.vx * cat.drag.vx < 0 || next.vy * cat.drag.vy < 0;
	if (reversed && Math.hypot(next.vx, next.vy) > 8) {
		cat.turns = [...cat.turns.filter((t) => now - t < 1000), now];
	}
	if (cat.turns.length >= 3) {
		cat.turns = [];
		cat.feel('surprised', 900);
		cat.speech.blurt(cat.script.next('shake', cat.mood(), cat.bond()), 'shake', 2500);
		happened(cat, 'shaken');
	} else if (Math.hypot(next.vx, next.vy) > 22) {
		cat.speech.talk(cat.script.next('zoom', cat.mood(), cat.bond()), 'zoom', 4000);
	}
	cat.drag = next;
	cat.x = nx;
	cat.y = ny;
	const onTile = overHome(cat, cursor.x, cursor.y);
	if (!onTile) cat.leftHome = true;
	const nowOver = cat.leftHome && onTile;
	if (nowOver !== cat.over) {
		cat.over = nowOver;
		cat.onover(cat.over);
		if (cat.over) {
			cat.boxAt = now;
			cat.speech.blurt(cat.script.next('box', cat.mood(), cat.bond()), 'box', 6000);
		}
	}
}

export function release(cat: Cat, event: PointerEvent, held: boolean) {
	const wasPress = !!cat.press && cat.press.id === event.pointerId;
	const heldFor = cat.press ? performance.now() - cat.pressAt : 0;
	cat.press = undefined;
	cat.captured = undefined;
	cat.petFrom = 0;
	if (held) {
		if (cat.over) {
			cat.over = false;
			cat.onover(false);
			// Home, or a bounce off the tile: the statechart knows whether a tantrum is on.
			cat.send({ type: 'DROP_HOME', now: performance.now() });
			return;
		}
		// Let go mid-swing and it keeps the momentum, measured over the last few moments.
		const now = performance.now();
		const recent = cat.trail.filter((p) => now - p.t < 90);
		const from = recent[0];
		const to = recent[recent.length - 1];
		const span = from && to && to !== from ? Math.max(1, to.t - from.t) / 16.67 : 0;
		const rvx = span ? (to.x - from.x) / span : 0;
		const rvy = span ? (to.y - from.y) / span : 0;
		cat.trail = [];
		const thrown = Math.hypot(rvx, rvy);
		cat.vx = rvx * 0.6;
		cat.vy = rvy * 0.6;
		const first = !cat.speech.has('freed');
		cat.speech.mark('freed');
		// Let the landing line be heard before any catching-up chatter.
		cat.speech.mark('found');
		cat.speech.mark('lonely');
		if (thrown > 8) {
			cat.flying = true;
			cat.spinFrom = now;
			cat.feel('happy', 1500);
			cat.speech.blurt(
				first && cat.visits === 1 ? cat.script.next('freedThrown') : cat.script.next('throw', cat.mood(), cat.bond())
			);
			happened(cat, 'thrown');
		} else {
			cat.speech.talk(
				first && cat.visits === 1 ? cat.script.next('freed') : cat.script.next('drop', cat.mood(), cat.bond())
			);
			happened(cat, 'set-down');
		}
		// Last, so a word about being taken off something waits behind what it says about the drop.
		cat.send({ type: 'RELEASE', now });
	} else if (wasPress && heldFor < 600) {
		poke(cat);
	}
}

export function leave(cat: Cat, event: MouseEvent, held: boolean) {
	if (event.relatedTarget || held || !cat.cursor.present) return;
	const now = performance.now();
	cat.cursor.present = false;
	cat.petFrom = 0;
	const edges = {
		left: event.clientX,
		right: innerWidth - event.clientX,
		top: event.clientY,
		bottom: innerHeight - event.clientY
	};
	const edge = (Object.keys(edges) as Side[]).reduce((a, b) => (edges[a] <= edges[b] ? a : b));
	const sideways = edge === 'left' || edge === 'right';
	const pad = cat.size / 2 + 6;
	const at = clampToView({ x: event.clientX, y: event.clientY }, innerWidth, innerHeight, pad);
	cat.left = { at: now, x: at.x, y: at.y, sideways };
	// `screen.isExtended` says whether there's more than one screen, where the browser tells.
	const extended = (screen as Screen & { isExtended?: boolean }).isExtended;
	// Where it went, and whether that is worth following, is the statechart's to work out.
	cat.send({
		type: 'CURSOR_LEFT',
		edge,
		sideways,
		extended: extended !== false,
		cross: cat.brain.cross
	});
}
