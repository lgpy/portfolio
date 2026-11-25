import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backup, charge, edge, runUp, sulk, toRunUp } from './behaviours/ram';
import type { Cat } from './context';

/** A cat at `x`, `y` with its cursor last seen going out of one side. */
function cat(x: number, y: number, leftAt = 1190): Cat {
	return {
		x,
		y,
		vx: 0,
		vy: 0,
		size: 64,
		left: { at: 0, x: leftAt, y, sideways: true }
	} as unknown as Cat;
}

describe('ramming the edge', () => {
	beforeEach(() => {
		vi.stubGlobal('innerWidth', 1200);
		vi.stubGlobal('innerHeight', 800);
	});

	afterEach(() => vi.unstubAllGlobals());

	it('reads the wall it would charge and which way, from the edge the cursor left by', () => {
		expect(edge(cat(600, 400))).toEqual({ wallX: 1168, dir: 1 });
		expect(edge(cat(600, 400, 10))).toEqual({ wallX: 32, dir: -1 });
	});

	it('lines up well short of the wall, at the height the cursor left', () => {
		const c = cat(600, 300);
		const { wallX, dir } = edge(c);
		expect(runUp(c, wallX, dir)).toEqual({ x: 1008, y: 300 });
		expect(toRunUp(c)).toBeGreaterThan(45);
		c.x = 1008;
		c.y = 300;
		expect(toRunUp(c)).toBe(0);
		expect(backup(c, wallX, dir).target).toEqual({ x: 1008, y: 300 });
	});

	it('charges at full speed, and presses up against the wall when it gives up', () => {
		const c = cat(300, 300);
		c.vx = 2;
		charge(c, 1);
		expect(c.vx).toBe(12);
		expect(sulk(c, 1168, 1).target).toEqual({ x: 1164, y: 300 });
	});
});
