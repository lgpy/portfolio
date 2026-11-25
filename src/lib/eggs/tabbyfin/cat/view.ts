/** Keeping the cat (and its target) on screen, in one place. */

export type Point = { x: number; y: number };

/** The same point, kept `pad` px inside every edge of a `width` by `height` viewport. */
export function clampToView(point: Point, width: number, height: number, pad: number): Point {
	return {
		x: Math.min(width - pad, Math.max(pad, point.x)),
		y: Math.min(height - pad, Math.max(pad, point.y))
	};
}
