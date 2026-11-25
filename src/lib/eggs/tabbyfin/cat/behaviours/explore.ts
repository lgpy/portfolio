/**
 * Exploring: picking somewhere on the page worth a look, in the order it cares about. The body's
 * statechart decides when it sets off and when it lingers; this only finds the place.
 */
import { hone } from '#lib/eggs/state.svelte.js';
import { SPOTS, TAGS } from '../lines';
import type { Cat, Spot } from '../context';
import { clampToView } from '../view';
import { discover } from './hone';

/** A random member of a list. */
function pick<T>(items: readonly T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

/** Somewhere on the page worth a look, with something to say about it. */
function findSpot(cat: Cat): Spot | undefined {
	const tags = [...document.querySelectorAll('.tags li')].filter((li) => (li.textContent?.trim() ?? '') in TAGS);
	const tag = tags.length ? pick(tags) : undefined;
	const tagText = tag?.textContent?.trim() ?? '';
	const icons = document.querySelectorAll('.project .icon');
	const candidates: [Element | null | undefined, string, string][] = [
		[document.querySelector('header .name'), 'name', SPOTS.name],
		[document.querySelector('header .tagline'), 'tagline', SPOTS.tagline],
		[document.querySelector('header nav a'), 'github', SPOTS.github],
		[icons[2], 'bunny', hone.found ? SPOTS.bunny : ''],
		[cat.home, 'home', SPOTS.home],
		[icons[1], 'pill', SPOTS.pill],
		[tag, `tag-${tagText}`, TAGS[tagText]]
	];
	const options = candidates.filter(([el, key]) => {
		if (!el || cat.seen.has(key)) return false;
		const r = el.getBoundingClientRect();
		return r.bottom > 0 && r.top < innerHeight;
	});
	if (!options.length) return undefined;
	// Until it has found the honing game, the bunny is where it wants to go first.
	const [el, key, text] = (!hone.found && options.find(([, k]) => k === 'bunny')) || pick(options);
	const r = el!.getBoundingClientRect();
	const at = clampToView({ x: r.left + r.width / 2, y: r.top - 36 }, innerWidth, innerHeight, 40);
	return {
		x: at.x,
		y: Math.max(50, at.y),
		line: text,
		key,
		act: key === 'bunny' && !hone.found ? () => discover(cat) : undefined
	};
}

/** A random place to swim to, a good way from where it is, for when the page has been seen. */
function somewhere(cat: Cat): Spot {
	const pad = 60;
	let sx = cat.x;
	let sy = cat.y;
	for (let i = 0; i < 6 && Math.hypot(sx - cat.x, sy - cat.y) < 200; i++) {
		sx = pad + Math.random() * Math.max(0, innerWidth - 2 * pad);
		sy = pad + Math.random() * Math.max(0, innerHeight - 2 * pad);
	}
	return {
		x: sx,
		y: sy,
		line: Math.random() < 0.6 ? cat.script.next('nothing', cat.mood(), cat.bond()) : '',
		key: 'somewhere'
	};
}

/** Somewhere worth a look, or somewhere at all: a trip that always has a destination. */
export function nextSpot(cat: Cat, prowling: boolean): Spot {
	// In a tantrum it only prowls: no sightseeing remarks, and nothing to do at the bunny.
	if (prowling) return { ...somewhere(cat), line: '' };
	return findSpot(cat) ?? somewhere(cat);
}
