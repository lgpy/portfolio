/**
 * The bunny and her honing game: finding it for the first time, and the cat's own goes at it.
 */
import { hone } from '#lib/eggs/state.svelte.js';
import { TIERS } from '../lines';
import { happened } from '../being';
import type { Cat, Spot } from '../context';

/** At the bunny for the first time: it pokes her, and that starts the honing game. */
export function discover(cat: Cat) {
	cat.feel('surprised', 1500);
	cat.speech.blurt(cat.script.next('discover', cat.mood(), cat.bond()));
	// Arriving and poking her is the unlock; the line above is only flavour. Doing the attempt
	// here, rather than after the line, means an interrupted line cannot lose the game.
	const outcome = hone.attempt?.('cat');
	if (outcome === 'max') {
		cat.speech.talk(cat.script.next('maxed', cat.mood(), cat.bond()));
		return;
	}
	if (outcome !== 'success' && outcome !== 'tier') return;
	cat.feel('happy', 2500);
	cat.trick();
	cat.speech.talk(cat.script.next('discovered', cat.mood(), cat.bond()));
	happened(cat, 'honed');
}

/** The bunny, if she is on screen: a trip whose arrival has a go at her. */
export function errandSpot(cat: Cat): Spot | undefined {
	const bunny = document.querySelector('[aria-label="LA Utils\' bunny"]');
	const r = bunny?.getBoundingClientRect();
	if (!r || r.bottom < 0 || r.top > innerHeight) return undefined;
	// A grab, a send home or a nap on the way there cancels the go: the body only calls this with
	// the trip it belongs to still under way.
	return {
		x: r.left + r.width / 2,
		y: Math.max(50, r.top - 30),
		line: '',
		key: 'errand',
		act: () => {
			const outcome = hone.attempt?.('cat');
			if (outcome === 'tier') {
				cat.feel('happy', 2500);
				cat.trick();
				const tier = TIERS[hone.level];
				cat.speech.blurt(tier ? `i did that! me! ${tier}` : 'i did that! me!');
			} else if (outcome === 'success') {
				cat.feel('happy', 2000);
				cat.speech.blurt(`i did it! +${hone.level}! with tentacles!`);
			} else if (outcome === 'max') {
				cat.speech.blurt(cat.script.next('maxed', cat.mood(), cat.bond()));
			} else if (outcome === 'fail') {
				cat.feel('surprised', 1500);
				cat.speech.blurt(cat.script.next('catMissed', cat.mood(), cat.bond()));
			}
			if (outcome === 'success' || outcome === 'tier') happened(cat, 'honed');
		}
	};
}
