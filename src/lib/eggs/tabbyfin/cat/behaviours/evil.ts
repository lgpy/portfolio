/**
 * The cat's mischief, the page side of it: what it can get up to right now, where to stand to do
 * it, how it takes the page apart, and how it all goes back. It keeps no timers and no tokens:
 * the tantrum's statechart (../machine.ts) decides when each bit happens, and leaving the state
 * it was in is what cancels it.
 *
 * Two kinds of mess are kept apart. What a tantrum did, the pieces it wrecked and the text it
 * rewrote, is the cat's to tidy up itself once it has calmed down; what a bored fiddle left
 * moved only goes back when the cat goes home. A piece it has already had a go at is never
 * picked again.
 *
 * Every change to the page is a Web Animations animation or the page's own text override, never
 * an inline style, so cancelling it puts the element back byte for byte.
 */
import { hone, vandal } from '#lib/eggs/state.svelte.js';
import type { EvilAct } from '../brain';
import type { Cat, Spot } from '../context';
import { VANDAL } from '../lines';
import { clampToView } from '../view';

/**
 * The pieces of the page it can take apart: elements with a box of their own, which a transform
 * moves on its own without moving anything else. Never the cat, its tile or its speech bubble,
 * and never an ancestor of them: the mascots' icons are picked by their glyph, because their
 * buttons are the tile itself, and the projects' own rows are left whole.
 */
const PIECES = [
	'header .name',
	'header .tagline',
	'header nav',
	'main .label',
	'.project .icon > svg',
	'.project .icon > img',
	'.project h3',
	'.project p',
	'.tags li',
	'footer'
];
const BUNNY = '[aria-label="LA Utils\' bunny"]';

/** Text that Svelte renders from state rather than as plain text. */
const OVERRIDES: Record<string, (text: string | undefined) => void> = {
	'header .tagline': (text) => (vandal['header .tagline'] = text)
};

/** A piece of the page the tantrum took down: the fall, held where it ended, and where that is. */
type Fallen = { el: HTMLElement; fall: Animation; end: string };

/** A bit of text it rewrote, and what the page had there before. */
type Rewritten = { el: HTMLElement; selector: string; original: string };

/** A piece of the page a bored fiddle moved, and how it stays moved. */
type Moved = { el: HTMLElement; animation: Animation };

/** A piece on its way back up, with the fall it is undoing. */
type Rising = { el: HTMLElement; fall: Animation; rise: Animation };

/** The cursor makeover, so stealing it and giving it back are silent. */
type CursorFx = { restyle(): void; undo(): void };

/** The acts that go and do something to a bit of the page. */
export type ElementAct = 'wreck' | 'vandal' | 'bunny';

type Target =
	{ act: ElementAct; el: HTMLElement; entry?: (typeof VANDAL)[number] } | { act: 'tidy'; was: Fallen | Rewritten };

/** What a tantrum has left out of place, and whether anything is still standing to take down. */
export type Damage = { left: boolean; standing: boolean };

/** A box on the page: what a tower of transforms does not move. */
type Box = { left: number; top: number; width: number; height: number };

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function onScreen(r: Box): boolean {
	return r.width > 0 && r.left + r.width > 0 && r.left < innerWidth && r.top + r.height > 0 && r.top < innerHeight;
}

/**
 * The mischief kit: the things a tantrum can do to the page, the tidying up afterwards, and the
 * fiddle it has when it is bored. Plain functions only, so the statechart owns when they run.
 */
export function createMischief(cat: Cat, cursor: CursorFx, still: () => boolean) {
	/** What the tantrum took down, what it rewrote, and what a fiddle moved. */
	let fallen: Fallen[] = [];
	let rewritten: Rewritten[] = [];
	let moved: Moved[] = [];
	/** Pieces on their way back up, until their fall is cancelled. */
	let rising: Rising[] = [];
	let stolen = false;
	/** The element the cat is swimming to, and what it will do there. */
	let target: Target | undefined;

	/** Whether this piece has already been had a go at, by a wreck, a fiddle or a rewrite. */
	function damaged(el: HTMLElement): boolean {
		return (
			fallen.some((f) => f.el === el) ||
			rewritten.some((r) => r.el === el) ||
			moved.some((m) => m.el === el) ||
			rising.some((r) => r.el === el)
		);
	}

	/** The pieces of the page it could take apart right now. */
	function pieces(): HTMLElement[] {
		const out: HTMLElement[] = [];
		for (const selector of PIECES) {
			for (const el of document.querySelectorAll<HTMLElement>(selector)) {
				if (onScreen(el.getBoundingClientRect())) out.push(el);
			}
		}
		return out;
	}

	/**
	 * The pieces still standing: a second go at the same one would do nothing. Rewritten text is
	 * still standing, so the whole page can come down; the tidy puts back the words and the piece.
	 */
	function freshPieces(): HTMLElement[] {
		return pieces().filter(
			(el) => !damaged(el) || rewritten.some((r) => r.el === el && !fallen.some((f) => f.el === el))
		);
	}

	function bunny(): HTMLElement | undefined {
		const el = document.querySelector<HTMLElement>(BUNNY);
		return el && !damaged(el) && onScreen(el.getBoundingClientRect()) ? el : undefined;
	}

	function textTargets(): { entry: (typeof VANDAL)[number]; el: HTMLElement }[] {
		const out: { entry: (typeof VANDAL)[number]; el: HTMLElement }[] = [];
		for (const entry of VANDAL) {
			const el = document.querySelector<HTMLElement>(entry.selector);
			if (el && !damaged(el) && onScreen(el.getBoundingClientRect())) out.push({ entry, el });
		}
		return out;
	}

	/** Everything it could get up to right now. With the page in pieces, that is nothing at all. */
	function possible(): EvilAct[] {
		const options: EvilAct[] = [];
		if (freshPieces().length) options.push('wreck');
		if (textTargets().length) options.push('vandal');
		if (cat.restyled) options.push('stealCursor');
		if (hone.found && hone.level > 0 && bunny()) options.push('bunny');
		return options;
	}

	/**
	 * Where to stand to look at a box: above it if there is room, otherwise beside or below.
	 * Always on screen, and as clear of the box as the viewport allows, so what it is working on
	 * stays visible and clickable.
	 */
	function place(r: Box): { x: number; y: number } {
		const half = cat.size / 2;
		const gap = 10;
		const places = [
			{ x: r.left + r.width / 2, y: r.top - half - gap },
			{ x: r.left + r.width / 2, y: r.top + r.height + half + gap },
			{ x: r.left - half - gap, y: r.top + r.height / 2 },
			{ x: r.left + r.width + half + gap, y: r.top + r.height / 2 }
		];
		let best = clampToView(places[0], innerWidth, innerHeight, half);
		let least = Infinity;
		for (const spot of places) {
			const at = clampToView(spot, innerWidth, innerHeight, half);
			// How much of the box the cat would cover once clamped on screen.
			const overlap =
				Math.max(0, Math.min(at.x + half, r.left + r.width) - Math.max(at.x - half, r.left)) *
				Math.max(0, Math.min(at.y + half, r.top + r.height) - Math.max(at.y - half, r.top));
			if (overlap < least) {
				least = overlap;
				best = at;
			}
		}
		return best;
	}

	function near(el: Element): { x: number; y: number } {
		return place(el.getBoundingClientRect());
	}

	/** A piece of furniture to visit: being there is the act, not a place on the page. */
	function spotAt(el: Element): Spot {
		const at = near(el);
		return { x: at.x, y: at.y, line: '', key: 'evil', mischief: true };
	}

	/**
	 * Somewhere to swim to do this act, or nothing if there is nothing to do it to. The spot is
	 * only the place to be: the body's trip says when the cat has arrived, which is when the page
	 * is touched.
	 */
	function visit(act: ElementAct): Spot | undefined {
		if (act === 'bunny') {
			const el = bunny();
			if (!el) return undefined;
			target = { act, el };
			return spotAt(el);
		}
		if (act === 'vandal') {
			const options = textTargets();
			if (!options.length) return undefined;
			const { entry, el } = pick(options);
			target = { act, el, entry };
			return spotAt(el);
		}
		const options = freshPieces();
		if (!options.length) return undefined;
		const el = pick(options);
		target = { act, el };
		return spotAt(el);
	}

	/**
	 * Where the piece belongs in the page's layout, which its own fall does not move. The fall is
	 * put back to its first frame to read it and put forward again in the same task, so nothing is
	 * ever painted in between.
	 */
	function homeOf(f: Fallen): Box {
		const at = f.fall.currentTime;
		f.fall.currentTime = 0;
		const r = f.el.getBoundingClientRect();
		f.fall.currentTime = at;
		return r;
	}

	/**
	 * A wobble, then over it goes, down and out of the window with a turn, and it stays there.
	 * Under reduced motion there is no motion at all: the piece is simply gone.
	 */
	function wreckPiece(el: HTMLElement) {
		if (damaged(el)) return;
		const r = el.getBoundingClientRect();
		const down = innerHeight - r.top + r.height + 40;
		const way = Math.random() < 0.5 ? -1 : 1;
		const out = Math.min(120, innerWidth * 0.12) * way;
		const end = `translate(${out}px, ${down}px) rotate(${12 * way}deg)`;
		const frames = still()
			? [{ opacity: 0 }]
			: [
					{ transform: 'translate(0, 0) rotate(0deg)', opacity: 1, offset: 0 },
					{ transform: 'translate(-3px, -3px) rotate(-2.5deg)', opacity: 1, offset: 0.18 },
					{ transform: 'translate(3px, 2px) rotate(2deg)', opacity: 1, offset: 0.32 },
					{ transform: end, opacity: 0.2 }
				];
		const fall = el.animate(frames, {
			duration: still() ? 0 : 900,
			// The wobble first, then gravity takes it.
			easing: still() ? 'linear' : 'cubic-bezier(0.45, 0, 0.9, 0.6)',
			fill: 'forwards'
		});
		fallen.push({ el, fall, end });
	}

	function putBackText(r: Rewritten) {
		const override = OVERRIDES[r.selector];
		if (override) override(undefined);
		else if (r.el.isConnected) r.el.textContent = r.original;
	}

	function paint(el: HTMLElement, selector: string, text: string) {
		rewritten.push({ el, selector, original: el.textContent ?? '' });
		const override = OVERRIDES[selector];
		if (override) override(text);
		else el.textContent = text;
	}

	/** The thing it went there to do. The bunny's threat is a line, so it is the machine's. */
	function arrive() {
		const at = target;
		target = undefined;
		if (!at) return;
		if (at.act === 'wreck') wreckPiece(at.el);
		else if (at.act === 'vandal' && at.entry) paint(at.el, at.entry.selector, at.entry.text);
	}

	/**
	 * A fiddle: a shove of a few pixels with a tilt, or tipped right over about a bottom corner.
	 * It stays where it ends up, and the whole thing is an animation, so going home can cancel it.
	 */
	function shoveOrTopple(el: HTMLElement) {
		if (damaged(el)) return;
		const shove = Math.random() < 0.5;
		const way = Math.random() < 0.5 ? -1 : 1;
		const origin = shove ? '50% 50%' : way > 0 ? '0% 100%' : '100% 100%';
		let end: string;
		if (shove) {
			const dx = (10 + Math.random() * 10) * way;
			const dy = (10 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1);
			end = `translate(${dx}px, ${dy}px) rotate(${(2 + Math.random() * 2) * way}deg)`;
		} else {
			end = `rotate(${(80 + Math.random() * 10) * way}deg)`;
		}
		const frames = still()
			? [{ transform: end, transformOrigin: origin }]
			: [
					{ transform: 'none', transformOrigin: origin },
					{ transform: end, transformOrigin: origin }
				];
		const animation = el.animate(frames, {
			duration: still() ? 0 : shove ? 420 : 620,
			easing: shove ? 'cubic-bezier(0.3, 1.4, 0.5, 1)' : 'cubic-bezier(0.4, 0, 0.7, 1.1)',
			fill: 'forwards'
		});
		moved.push({ el, animation });
	}

	/** Somewhere to fiddle: a piece of the page it hasn't been at, with the shove waiting for it there. */
	function fiddleSpot(): Spot | undefined {
		const options = freshPieces();
		if (!options.length) return undefined;
		const el = pick(options);
		const at = near(el);
		return { x: at.x, y: at.y, line: '', key: 'fiddle', fiddle: true, act: () => shoveOrTopple(el) };
	}

	/** What the tantrum has left out of place, and whether anything is still standing. */
	function damage(): Damage {
		return { left: fallen.length + rewritten.length > 0, standing: freshPieces().length > 0 };
	}

	/** Everything a tantrum left out of place that is on the page now, with where it belongs. */
	function outOfPlace(): { was: Fallen | Rewritten; box: Box }[] {
		const out: { was: Fallen | Rewritten; box: Box }[] = [];
		for (const f of fallen) {
			const box = homeOf(f);
			if (onScreen(box)) out.push({ was: f, box });
		}
		for (const r of rewritten) {
			if (!r.el.isConnected) continue;
			const box = r.el.getBoundingClientRect();
			if (onScreen(box)) out.push({ was: r, box });
		}
		return out;
	}

	/** The nearest thing out of place on the page, with the place to swim to put it back. */
	function nextTidy(cat: Cat): Spot | undefined {
		const options = outOfPlace();
		if (!options.length) {
			target = undefined;
			return undefined;
		}
		const from = (o: { box: Box }) =>
			Math.hypot(o.box.left + o.box.width / 2 - cat.x, o.box.top + o.box.height / 2 - cat.y);
		const best = options.reduce((a, b) => (from(b) < from(a) ? b : a));
		target = { act: 'tidy', was: best.was };
		const at = place(best.box);
		return { x: at.x, y: at.y, line: '', key: 'tidy', mischief: true };
	}

	/** The piece it swam to goes back: rising into place if it fell, its old text if it was rewritten. */
	function tidyUp(): boolean {
		const at = target;
		target = undefined;
		if (at?.act !== 'tidy') return false;
		if ('fall' in at.was) {
			const f = at.was;
			fallen = fallen.filter((x) => x !== f);
			const frames = still()
				? [{ opacity: 1 }]
				: [
						{ transform: f.end, opacity: 0.2 },
						{ transform: 'none', opacity: 1 }
					];
			const animation = f.el.animate(frames, { duration: still() ? 0 : 420, easing: 'ease-out' });
			const done = () => {
				animation.cancel();
				f.fall.cancel();
				rising = rising.filter((r) => r.el !== f.el);
			};
			if (still()) done();
			else {
				rising.push({ el: f.el, fall: f.fall, rise: animation });
				animation.onfinish = done;
			}
		} else {
			rewritten = rewritten.filter((x) => x !== at.was);
			putBackText(at.was);
		}
		return true;
	}

	/** Nothing out of place is on the page any more: everything left goes back at once. */
	function snapBack(): number {
		const count = fallen.length + rewritten.length;
		for (const f of fallen) f.fall.cancel();
		fallen = [];
		for (const r of rewritten) putBackText(r);
		rewritten = [];
		return count;
	}

	/** The cursor makeover, stolen back: the cat keeps it until the tantrum is over. */
	function steal() {
		stolen = true;
		cursor.undo();
		cat.feel('surprised', 900);
	}

	/** A tantrum ended: give the makeover back, unless it is going home with the grudge. */
	function giveBack(give: boolean) {
		if (!stolen) return;
		if (give) cursor.restyle();
		stolen = false;
	}

	/** Everything back at once: the tantrum's damage, the rewritten text and the boredom mess. */
	function restore() {
		for (const r of rising) {
			r.rise.cancel();
			r.fall.cancel();
		}
		rising = [];
		snapBack();
		for (const m of moved) m.animation.cancel();
		moved = [];
		target = undefined;
	}

	return {
		possible,
		visit,
		arrive,
		steal,
		giveBack,
		restore,
		damage,
		nextTidy,
		tidyUp,
		snapBack,
		fiddleSpot
	};
}
export type Mischief = ReturnType<typeof createMischief>;
