/**
 * Little things the cat does to itself, shared by the frame loop and the behaviours: feeling
 * something, and saying something when a thing that happened to it is one too many. What the brain
 * makes of it reaches the body by itself: the brain tells its listeners, so no call site has to
 * carry the answer on.
 */
import { EVIL, type Event as Happening, type Signal } from './brain';
import type { Cat } from './context';

/**
 * How long the warning stays up before anything may cut it off: while it types, and then until
 * a tantrum could start (the brain gives it EVIL.warnHold seconds once it has been said in full,
 * which the speech reports 600ms after the last letter). Nothing slips in between the two.
 */
const warnHold = (text: string) => 80 + text.length * 40 + 600 + EVIL.warnHold * 1000 + 300;

/** Its temper boiled over: say so, once, and look startled. */
export function warn(cat: Cat) {
	cat.feel('surprised', 1200);
	// The warning has to be read before anything else gets a turn.
	const text = cat.script.next('warn', cat.mood(), cat.bond());
	cat.brain.warningWaiting();
	cat.speech.blurt(text, undefined, 0, () => cat.brain.warningHeard(), warnHold(text));
}

/**
 * Something happened to it. The warning is the one signal a caller has to say itself; its temper
 * reaches the body through the brain's listener. Returns what the brain said, for the callers that
 * ask about it before the body hears.
 */
export function happened(cat: Cat, event: Happening): Signal[] {
	const out = cat.brain.on(event);
	if (out.includes('warn')) warn(cat);
	return out;
}
