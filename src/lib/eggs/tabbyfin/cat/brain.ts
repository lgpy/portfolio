/**
 * The jelly cat's inner life: meters that rise and fall with what happens to it, the mood they
 * add up to, and which of its own pastimes it fancies next. The body (Jellyfish.svelte) reports
 * what it senses every frame and what happens to it; the brain decides how the cat feels, and
 * tells whoever is listening whenever that changes, so no caller has to carry the answer on.
 *
 * Plain TypeScript with an injectable clock, random source and storage, so tests can
 * fast-forward hours of cat life in milliseconds.
 */

export const METERS = ['energy', 'company', 'curiosity', 'temper', 'dizzy', 'bond'] as const;
export type Meter = (typeof METERS)[number];
export type Meters = Record<Meter, number>;

export type Mood =
	| 'content'
	| 'playful'
	| 'lonely'
	| 'sleepy'
	| 'dizzy'
	| 'grumpy'
	| 'smug'
	/** Pushed too far: a short tantrum, see EVIL below. */
	| 'evil'
	/** Just out of a tantrum, and a bit embarrassed about it. */
	| 'sheepish';

/** Things that happen to it. */
export type Event =
	| 'shaken'
	| 'slammed'
	| 'thrown'
	| 'rammed'
	| 'poked'
	| 'set-down'
	| 'forced-home'
	| 'gold-reset'
	| 'explored'
	| 'fiddled'
	| 'honed'
	| 'chatted'
	| 'freed';

/** Things it chooses to do by itself. Following the cursor is the default, not a pastime. */
export type Pastime = 'explore' | 'fiddle' | 'hone' | 'nap';

/**
 * Something the body should act on: `warn` when temper reaches WARN_AT, `evil` when a tantrum
 * starts, `calm` when it ends (see `calmedBy` for why).
 */
export type Signal = 'warn' | 'evil' | 'calm';

/** Whoever wants to hear the brain's signals as it makes them, and the way to stop listening. */
export type Listener = (signal: Signal) => void;

/** The mischief it gets up to while evil, one at a time. */
export type EvilAct = 'wreck' | 'vandal' | 'stealCursor' | 'bunny';

/** Why a tantrum ended: petted out of it, or it ran out of steam (or time). */
export type Calmed = 'petted' | 'time';

/** What the body tells the brain each tick. */
export type Senses = {
	/** The cursor is on the page and within about 200px. */
	cursorNear: boolean;
	cursorPresent: boolean;
	/** Seconds since the cursor last moved. */
	cursorIdle: number;
	/** How fast it's swimming, in px per frame. */
	swimming: number;
	napping: boolean;
	/** Being petted right now: the cursor stroking slowly over it. */
	petting: boolean;
	/** Back in its tile. */
	home: boolean;
	/** The honing game: found yet, whether you've honed yourself, and whether it's maxed (gold). */
	honeFound: boolean;
	honedByYou: boolean;
	gold: boolean;
};

export type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export type BrainOptions = {
	/** Milliseconds, like performance.now(). */
	clock?: () => number;
	random?: () => number;
	storage?: Storage;
};

const KEY = 'tabbyfin-cat';
const VERSION = 1;

/** How each meter changes per second, given what it senses. */
const RATES = {
	energy: {
		awake: -0.12,
		/** Extra drain at full swimming speed. */
		swimming: -0.25,
		napping: 1.5,
		home: 0.5,
		petting: 0.2
	},
	company: { near: 2.5, petting: 5, far: -0.4, gone: -1, home: -0.15 },
	curiosity: { bored: 0.8, busy: 0.3 },
	temper: { calm: -0.8, alone: -1.5, petting: -2.5 },
	dizzy: { settle: -8 },
	bond: { together: 0.04, petting: 0.25 }
} as const;

/** How much each event moves each meter. */
const EVENTS: Record<Event, Partial<Meters>> = {
	shaken: { temper: 18, dizzy: 35, energy: -3 },
	slammed: { temper: 12, dizzy: 15, energy: -4, bond: -1 },
	thrown: { temper: 4, dizzy: 25 },
	rammed: { energy: -5, dizzy: 10 },
	poked: { temper: 2, company: 2 },
	'set-down': { temper: -5, company: 3 },
	'forced-home': { temper: 10 },
	'gold-reset': { temper: 20 },
	explored: { curiosity: -30 },
	fiddled: { curiosity: -30 },
	honed: { curiosity: -40 },
	chatted: { company: 2 },
	freed: { bond: 2 }
};

/** Pokes beyond this many within POKE_WINDOW seconds start to annoy. */
const POKE_LIMIT = 5;
const POKE_WINDOW = 5;
const POKE_SPAM = 6;

/** Temper at which it warns you to stop. */
export const WARN_AT = 50;

/**
 * Evil mode: a short tantrum when temper boils over, always after a warning. A closer bond
 * makes it more patient. It never happens in the first minute of a visit, lasts at most
 * EVIL.max seconds, and won't come back for EVIL.cooldown seconds after.
 */
/** The temper at which it is cross with you: grumpy, and in no hurry to keep you company. */
export const CROSS = 45;

export const EVIL = {
	/** Temper it turns evil at, for a stranger; each point of bond adds `perBond`, up to `cap`. */
	at: 75,
	perBond: 0.2,
	cap: 95,
	/** Seconds into a visit before it can happen at all. */
	grace: 60,
	/** Seconds a tantrum lasts at most. */
	max: 120,
	cooldown: 600,
	/** Temper it calms down below by itself. */
	calmBelow: 30,
	/** Seconds of petting that talk it down. */
	petting: 3,
	/**
	 * The warning has to be recent, and have had time to be read: a tantrum starts at least
	 * `warnHold` and at most `warnWithin` seconds after it. An old warning is said again the next
	 * time something annoys it.
	 */
	warnHold: 2,
	/** Seconds after coming out of its tile or waking before it will warn, so the hello lands. */
	settle: 1.5,
	warnWithin: 30,
	/** Bond it loses for the tantrum. */
	bondCost: 3,
	/** Seconds it's sheepish afterwards. */
	sheepish: 40
} as const;

/** A pastime needs at least this score to be chosen. */
const THRESHOLD = 0.55;
/** Seconds between two of the same pastime. */
export const COOLDOWNS: Record<Pastime, number> = { explore: 20, fiddle: 45, hone: 70, nap: 0 };
/**
 * How far each pastime's score wanders when one is picked. The fiddle wanders most: it is the
 * one it does on a whim, so a bored cat sometimes shoves something instead of going for a look.
 */
const WHIM: Record<Pastime, number> = { nap: 0.1, explore: 0.1, fiddle: 0.26, hone: 0.1 };
/** Seconds after you first hone before it takes a turn itself. */
const HONE_AFTER_YOU = 20;
/** Below this energy it's sleepy (and says so); below EXHAUSTED it naps no matter what. */
const SLEEPY = 30;
const EXHAUSTED = 15;
/** Seconds of a still cursor before it naps, whatever its energy. */
const NAP_IDLE = 30;
/** Seconds of a still cursor before it gets restless enough to explore. */
const EXPLORE_IDLE = 8;

const START: Meters = { energy: 80, company: 60, curiosity: 40, temper: 0, dizzy: 0, bond: 0 };

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export class Brain {
	readonly meters: Meters = { ...START };
	/** Days since the last visit, or undefined on a first visit. */
	readonly daysAway: number | undefined;

	private clock: () => number;
	private random: () => number;
	private storage?: Storage;
	private last: Partial<Record<Pastime, number>> = {};
	private pokes: number[] = [];
	private warned = false;
	private warnedAt = -Infinity;
	/** The body is still waiting to say the warning: until it has, it doesn't count. */
	private warningUnheard = false;
	/** In its tile or asleep, as of the last tick: no tantrums without a body to throw them. */
	private resting = false;
	/** When it last came out of its tile or woke up: it says hello before it says anything cross. */
	private upAt = -Infinity;
	/** Bond as last saved, so a save adds only what this tab gained since. */
	private savedBond = 0;
	private honedByYouAt: number | undefined;
	private bornAt: number;
	private evilSince: number | undefined;
	private evilEnded = -Infinity;
	private evilPetting = 0;
	private sheepishUntil = -Infinity;
	/** The last mischief that was not a wreck, so the next one is something different. */
	private lastOther: EvilAct | undefined;
	/** How many wrecks it has done since anything else, so the other mischief still gets a turn. */
	private wrecksInRow = 0;
	private calmed: Calmed | undefined;
	/** Everyone who wants to hear a signal as it is made. */
	private listeners = new Set<Listener>();

	constructor({ clock = () => performance.now(), random = Math.random, storage }: BrainOptions = {}) {
		this.clock = clock;
		this.random = random;
		this.storage = storage;
		this.bornAt = clock();
		const saved = this.load();
		if (saved) {
			this.meters.bond = clamp(saved.bond);
			this.savedBond = this.meters.bond;
			this.daysAway = Math.floor((Date.now() - saved.lastVisit) / 86_400_000);
		}
	}

	/**
	 * Hear every signal as the brain makes it, wherever it was asked from: its own tick, something
	 * that happened to the cat, or the time away. A tantrum already on is told at once, so a cat
	 * let out of its tile mid-tantrum is heard about. Returns the way to stop listening.
	 */
	listen(listener: Listener): () => void {
		this.listeners.add(listener);
		if (this.evil) listener('evil');
		return () => void this.listeners.delete(listener);
	}

	/** Advance time by `seconds`, given what it senses. Returns any signals for the body. */
	tick(seconds: number, senses: Senses): Signal[] {
		const m = this.meters;
		const r = RATES;
		const near = senses.cursorPresent && senses.cursorNear;

		m.energy += seconds * this.energyRate(senses);

		if (senses.home) m.company += seconds * r.company.home;
		else if (senses.petting) m.company += seconds * r.company.petting;
		else if (near) m.company += seconds * r.company.near;
		else if (senses.cursorPresent) m.company += seconds * r.company.far;
		else m.company += seconds * r.company.gone;

		if (!senses.home && !senses.napping) {
			const bored = near && senses.cursorIdle > 3;
			m.curiosity += seconds * (bored ? r.curiosity.bored : r.curiosity.busy);
		}

		const calming = senses.petting ? r.temper.petting : !senses.cursorPresent ? r.temper.alone : r.temper.calm;
		m.temper += seconds * calming;
		m.dizzy += seconds * r.dizzy.settle;

		if (senses.petting) m.bond += seconds * r.bond.petting;
		else if (near) m.bond += seconds * r.bond.together;

		if (senses.honedByYou && this.honedByYouAt === undefined) this.honedByYouAt = this.clock();
		// Petting talks it out of a tantrum; stopping lets that wear off slowly rather than all at once.
		if (this.evil) this.evilPetting = Math.max(0, this.evilPetting + (senses.petting ? seconds : -seconds / 2));

		const resting = senses.home || senses.napping;
		if (this.resting && !resting) this.upAt = this.clock();
		this.resting = resting;

		for (const k of METERS) m[k] = clamp(m[k]);
		return this.emit(this.signals());
	}

	private energyRate(senses: Senses) {
		const r = RATES.energy;
		if (senses.napping) return r.napping;
		if (senses.home) return r.home;
		const swim = (Math.min(senses.swimming, 6) / 6) * r.swimming;
		return r.awake + swim + (senses.petting ? r.petting : 0);
	}

	/** Something happened to it. Returns any signals for the body. */
	on(event: Event): Signal[] {
		const m = this.meters;
		for (const [k, v] of Object.entries(EVENTS[event]) as [Meter, number][]) m[k] = clamp(m[k] + v);
		if (event === 'poked') {
			const now = this.clock();
			this.pokes = [...this.pokes.filter((t) => now - t < POKE_WINDOW * 1000), now];
			if (this.pokes.length > POKE_LIMIT) m.temper = clamp(m.temper + POKE_SPAM);
		}
		return this.emit(this.signals(true));
	}

	/** More pokes than it likes within a few seconds: say so. The brain is the one poke counter. */
	get pokeSpam(): boolean {
		return this.pokes.filter((t) => this.clock() - t < POKE_WINDOW * 1000).length > POKE_LIMIT;
	}

	/**
	 * Cross with you: grumpy or worse, whatever else it feels. It doesn't follow the cursor about
	 * until it has cooled off.
	 */
	get cross(): boolean {
		return this.evil || this.meters.temper >= CROSS;
	}

	/** In a tantrum right now. */
	get evil(): boolean {
		return this.evilSince !== undefined;
	}

	/** Why the last tantrum ended, for what it says about it. */
	get calmedBy(): Calmed | undefined {
		return this.calmed;
	}

	/** The temper it turns evil at, given the bond. */
	get evilAt(): number {
		return Math.min(EVIL.cap, EVIL.at + this.meters.bond * EVIL.perBond);
	}

	/** Seconds of the current tantrum so far, or 0. */
	get evilFor(): number {
		return this.evilSince === undefined ? 0 : (this.clock() - this.evilSince) / 1000;
	}

	/**
	 * Its next bit of mischief, from what the body can do right now. The page is what it came
	 * for, so it wrecks while anything is still standing, and only after two wrecks in a row does
	 * it get up to something else, so one tantrum is enough to take the whole page down.
	 */
	evilAct(available: readonly EvilAct[]): EvilAct | undefined {
		if (!available.length) return undefined;
		const others = available.filter((a) => a !== 'wreck' && a !== this.lastOther);
		const act =
			available.includes('wreck') && (this.wrecksInRow < 2 || !others.length)
				? 'wreck'
				: (others.length ? others : available)[Math.floor(this.random() * (others.length || available.length))];
		this.wrecksInRow = act === 'wreck' ? this.wrecksInRow + 1 : 0;
		if (act !== 'wreck') this.lastOther = act;
		return act;
	}

	/**
	 * The body is going into its tile (or on its way there). Call before reporting what sent it
	 * there: in the tile it can't throw a tantrum, and a warning it raised on the way in would
	 * never be seen, so it doesn't count. Ticks on the way home must say `home: true` too.
	 */
	rest() {
		this.resting = true;
		this.warned = false;
		this.warnedAt = -Infinity;
		this.warningUnheard = false;
	}

	/**
	 * The warning has just been said in full. It may have waited its turn behind another line,
	 * so its time to be read starts now rather than when the brain decided to warn.
	 */
	warningHeard() {
		this.warningUnheard = false;
		if (this.warned) this.warnedAt = this.clock();
	}

	/** The body has the warning queued but hasn't said it yet; `warningHeard` follows. */
	warningWaiting() {
		this.warningUnheard = true;
	}

	/**
	 * End a tantrum from outside the brain: the body is taking the cat home, so there is no
	 * `calm` signal to act on. `calmedBy` and the bond cost still apply, as with any tantrum.
	 */
	stopEvil(why: Calmed = 'time') {
		if (this.evil) this.endEvil(why);
	}

	/** Tell every listener about each signal, in order, and hand them back for the caller. */
	private emit(out: Signal[]): Signal[] {
		for (const signal of out) for (const listener of this.listeners) listener(signal);
		return out;
	}

	/** `annoyed`: something just happened to it, which can bring an old warning back up. */
	private signals(annoyed = false, catchingUp = false): Signal[] {
		const out: Signal[] = [];
		const m = this.meters;
		const now = this.clock();
		const since = now - this.warnedAt;
		// Warned in an earlier moment than this one, recently, and long enough ago to have been read.
		const warnedFairly =
			this.warned && !this.warningUnheard && since >= EVIL.warnHold * 1000 && since <= EVIL.warnWithin * 1000;
		const stale = since > EVIL.warnWithin * 1000;
		// Catching up after time away only ever ends things: nothing new starts while you're gone.
		const settling = now - this.upAt < EVIL.settle * 1000;
		if (
			!catchingUp &&
			!this.resting &&
			!settling &&
			m.temper >= WARN_AT &&
			!this.evil &&
			(!this.warned || (annoyed && stale))
		) {
			this.warned = true;
			this.warnedAt = now;
			out.push('warn');
		}
		if (this.evil) {
			const petted = this.evilPetting >= EVIL.petting;
			if (petted || m.temper < EVIL.calmBelow || this.evilFor >= EVIL.max) {
				this.endEvil(petted ? 'petted' : 'time');
				out.push('calm');
			}
		} else if (
			warnedFairly &&
			!catchingUp &&
			!this.resting &&
			m.temper >= this.evilAt &&
			now - this.bornAt >= EVIL.grace * 1000 &&
			now - this.evilEnded >= EVIL.cooldown * 1000
		) {
			this.evilSince = now;
			this.evilPetting = 0;
			this.lastOther = undefined;
			this.wrecksInRow = 0;
			out.push('evil');
		}
		// Calmed right down: the next time it gets this cross, it warns again.
		if (m.temper < 10) this.warned = false;
		return out;
	}

	private endEvil(why: Calmed) {
		const m = this.meters;
		this.evilSince = undefined;
		this.evilEnded = this.clock();
		this.evilPetting = 0;
		this.calmed = why;
		// The next tantrum needs a warning of its own.
		this.warned = false;
		this.warnedAt = -Infinity;
		this.warningUnheard = false;
		this.sheepishUntil = this.clock() + EVIL.sheepish * 1000;
		m.bond = clamp(m.bond - EVIL.bondCost);
		m.temper = Math.min(m.temper, 15);
	}

	/** How it feels, from the meters. The first that applies wins. */
	mood(senses: Pick<Senses, 'napping' | 'gold'>): Mood {
		const m = this.meters;
		if (this.evil) return 'evil';
		if (m.dizzy > 55) return 'dizzy';
		if (this.clock() < this.sheepishUntil) return 'sheepish';
		if (senses.napping || m.energy < SLEEPY) return 'sleepy';
		if (m.temper >= CROSS) return 'grumpy';
		if (m.company < 30) return 'lonely';
		if (senses.gold) return 'smug';
		if (m.energy > 55 && m.company > 60 && m.temper < 20) return 'playful';
		return 'content';
	}

	/** How much it wants each pastime right now, 0 to about 1. */
	scores(senses: Senses): Record<Pastime, number> {
		const m = this.meters;
		const now = this.clock();
		const cooling = (p: Pastime) => now - (this.last[p] ?? -Infinity) < COOLDOWNS[p] * 1000;
		const quiet = !senses.cursorPresent || senses.cursorIdle >= EXPLORE_IDLE;

		let nap = 0;
		if (m.energy < EXHAUSTED) nap = 1;
		else if (senses.cursorPresent && senses.cursorIdle >= NAP_IDLE) nap = 0.9;

		const curious = m.curiosity / 100 + (senses.cursorPresent ? 0 : 0.3);
		const explore = cooling('explore') || !quiet ? 0 : curious;
		// The fiddle wants the same quiet a look at the page wants, a little less: looking is the
		// older habit. Cross with you, it doesn't play.
		const fiddle = cooling('fiddle') || !quiet || this.cross ? 0 : curious * 0.9;

		const youHonedLongEnoughAgo = this.honedByYouAt !== undefined && now - this.honedByYouAt >= HONE_AFTER_YOU * 1000;
		const hone =
			senses.honeFound && youHonedLongEnoughAgo && !senses.gold && senses.cursorPresent && !cooling('hone')
				? (m.curiosity / 100) * 0.95 + 0.25
				: 0;

		return { nap, explore, fiddle, hone };
	}

	/**
	 * The pastime it wants to start now, if any. Call when it's free (not held, flying or busy);
	 * the choice is recorded for cooldowns.
	 */
	choose(senses: Senses): Pastime | undefined {
		// While evil, the body runs its mischief instead (see `evilAct`).
		if (senses.home || senses.napping || this.evil) return undefined;
		const scores = this.scores(senses);
		let best: Pastime | undefined;
		let top = THRESHOLD;
		for (const p of Object.keys(scores) as Pastime[]) {
			// A little jitter, so two close scores don't always resolve the same way.
			const score = scores[p] > 0 ? scores[p] + (this.random() - 0.5) * WHIM[p] : 0;
			if (score >= top) {
				best = p;
				top = score;
			}
		}
		if (best) this.last[best] = this.clock();
		return best;
	}

	/** Seconds until it next makes small talk, by mood. */
	chatGap(mood: Mood): number {
		const [lo, hi] = {
			playful: [6, 10],
			content: [8, 13],
			lonely: [5, 8],
			grumpy: [15, 25],
			sleepy: [14, 20],
			dizzy: [6, 9],
			smug: [8, 12],
			evil: [7, 11],
			sheepish: [10, 15]
		}[mood];
		return lo + this.random() * (hi - lo);
	}

	/** How hard it swims, from tired (about 0.6) to full of beans (1). */
	vigour(): number {
		return 0.6 + 0.4 * (this.meters.energy / 100);
	}

	/**
	 * The tab was hidden for `seconds`: catch up, but not all the way. A tantrum doesn't survive
	 * more than a few seconds of you being gone. Returns any signals for the body.
	 */
	away(seconds: number): Signal[] {
		const m = this.meters;
		m.company = Math.max(Math.min(m.company, 15), m.company - Math.min(seconds * 0.5, 50));
		m.energy = clamp(m.energy + Math.min(seconds * 0.3, 40));
		m.temper = clamp(m.temper - seconds);
		m.curiosity = clamp(m.curiosity + Math.min(seconds * 0.2, 30));
		m.dizzy = 0;
		if (this.evil && seconds >= 20) {
			this.endEvil('time');
			return this.emit(['calm']);
		}
		return this.emit(this.signals(false, true));
	}

	private load(): { bond: number; lastVisit: number } | undefined {
		try {
			const saved = JSON.parse(this.storage?.getItem(KEY) ?? '');
			if (saved?.v === VERSION && typeof saved.bond === 'number' && typeof saved.lastVisit === 'number') {
				return saved;
			}
		} catch {}
		return undefined;
	}

	/**
	 * Save what it remembers between visits: its bond with you, and when you were last here.
	 * Another tab may have saved since, so this adds what this tab gained (or lost) on top of
	 * what's stored, instead of overwriting it.
	 */
	save() {
		const stored = this.load()?.bond ?? this.savedBond;
		const bond = clamp(stored + (this.meters.bond - this.savedBond));
		this.meters.bond = bond;
		this.savedBond = bond;
		this.storage?.setItem(KEY, JSON.stringify({ v: VERSION, bond, lastVisit: Date.now() }));
	}
}
