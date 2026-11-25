import { describe, expect, it } from 'vitest';
import { clampToView } from './view';

describe('clampToView', () => {
	it('keeps a point a pad inside every edge', () => {
		expect(clampToView({ x: -20, y: 900 }, 400, 800, 32)).toEqual({ x: 32, y: 768 });
		expect(clampToView({ x: 500, y: -5 }, 400, 800, 32)).toEqual({ x: 368, y: 32 });
	});

	it('leaves a point that is already inside alone', () => {
		expect(clampToView({ x: 200, y: 400 }, 400, 800, 32)).toEqual({ x: 200, y: 400 });
	});
});
