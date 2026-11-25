/**
 * Following the cursor through the edge of the window: it backs up, charges the edge, splats,
 * and tries a few times before giving up and waiting there. The phases of that run are states of
 * the body's statechart (../machine.ts); this only does the maths they ask for, and the jolt the
 * page takes when it hits.
 */
import type { Cat } from '../context';

/** How many charges before it gives up. */
export const RAMS = 4;
/** How long the cursor can be gone before it wanders off instead. */
export const EDGE_WAIT = 8000;
/** How long it takes to turn round at the edge before the first run-up. */
export const PAUSE = 1800;
/** How long it takes to bounce off the wall and come back round. */
export const RECOIL = 700;
/** How far back from the wall it lines up, and how close counts as lined up. */
const RUN_UP = 160;
export const LINED_UP = 45;

/** Where to steer, how hard, how often, and how close counts as there. */
export type Steer = { target: { x: number; y: number }; power: number; every: number; near: number };

/** The wall it would charge, and which way, from where the cursor left the window. */
export function edge(cat: Cat): { wallX: number; dir: number } {
	const dir = cat.left.x > innerWidth / 2 ? 1 : -1;
	return { wallX: dir > 0 ? innerWidth - cat.size / 2 : cat.size / 2, dir };
}

/** Where it backs up to before a charge: at the cursor's height, well short of the wall. */
export function runUp(cat: Cat, wallX: number, dir: number): { x: number; y: number } {
	return { x: wallX - dir * RUN_UP, y: cat.left.y };
}

/** How far it still is from that run-up point, for the state that waits there. */
export function toRunUp(cat: Cat): number {
	const { wallX, dir } = edge(cat);
	const at = runUp(cat, wallX, dir);
	return Math.hypot(at.x - cat.x, at.y - cat.y);
}

/** The run-up: steer for the line-up point. */
export function backup(cat: Cat, wallX: number, dir: number): Steer {
	return { target: runUp(cat, wallX, dir), power: 1.8, every: 450, near: 30 };
}

/** The charge sets the velocity itself, so it returns nothing to steer at; the frame loop flies it into the wall. */
export function charge(cat: Cat, dir: number) {
	cat.vx = dir * Math.max(Math.abs(cat.vx), 12);
	cat.vy *= 0.9;
}

/** Given up: press up against the edge and sulk for a while. */
export function sulk(cat: Cat, wallX: number, dir: number): Steer {
	return { target: { x: wallX - dir * 4, y: cat.left.y }, power: 0.6, every: 1400, near: 10 };
}

/** The page flinches the way it hit, without transforming `.page` (that would move the cat). */
export function jolt(dir: number) {
	for (const el of document.querySelectorAll('.page > header, .project, .page > footer')) {
		el.animate([{ translate: '0 0' }, { translate: `${dir}px 0` }, { translate: '0 0' }], { duration: 180 });
	}
}
