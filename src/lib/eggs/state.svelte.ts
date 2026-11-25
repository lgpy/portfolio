// State the easter eggs share: the header shows the honing level, and the jelly cat notices it.

/** The honing level everything turns gold at. */
export const GOLD = 25;

export type Outcome = 'success' | 'fail' | 'tier' | 'max' | 'reset';
export type Honer = 'you' | 'cat';

/**
 * LA Utils' honing: the level, which upgrades the whole page, and the latest attempt, which
 * the jelly cat reacts to. `attempt` is LaUtils' own, so the cat can have a go too.
 */
export const hone = $state<{
	level: number;
	/** Whether the game has been found. The jelly cat finds it; until then the bunny does nothing. */
	found: boolean;
	/** Whether you have honed yourself this visit, for the cat to take a turn a while later. */
	honedByYou: boolean;
	/** `tier` is the honing level the upgrade landed at, for lines.ts' TIERS. */
	last?: { id: number; outcome: Outcome; tier?: number; by: Honer };
	attempt?: (by: Honer) => Outcome;
}>({ level: 0, found: false, honedByYou: false });

/**
 * While the jelly cat is evil it rewrites bits of the page that Svelte itself renders; a set
 * field overrides the page's own text until the cat puts it back. Selector-keyed so the page
 * only has to know about its own copy.
 */
export const vandal = $state<{ 'header .tagline'?: string }>({});

/** The jelly cat's subtitle line, shown at the bottom of the screen. */
export const subtitle = $state({ line: '', id: 0 });

let clear: ReturnType<typeof setTimeout> | undefined;

/** Show a line of subtitles for a while, replacing the current one. */
export function say(text: string, duration = 3200) {
	subtitle.line = text;
	subtitle.id += 1;
	clearTimeout(clear);
	clear = setTimeout(() => (subtitle.line = ''), duration);
}

/** A one-off read, for code outside a component; components read the media query reactively. */
export function reducedMotion() {
	return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
