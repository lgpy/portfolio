import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from 'xstate';
import { Brain, WARN_AT, type EvilAct, type Pastime, type Senses, type Signal } from './brain';
import type { Cat, Mode, Probe, Spot } from './context';
import type { Moment, Script } from './lines';
import type { Speech } from './speech.svelte';
import { actOf, backingUp, charging, createBody, modeOf, ramming, whereOf, type Body } from './machine';
import { happened, warn } from './being';
import type { Mischief } from './behaviours/evil';
import * as ram from './behaviours/ram';
import { clampToView } from './view';

/**
 * The body's statechart, on its own: a fake cat, a simulated clock, and the events the component
 * would send. No DOM beyond the two stubs below, so days of cat life take milliseconds.
 */

const SENSES: Senses = {
	cursorNear: true,
	cursorPresent: true,
	cursorIdle: 0,
	swimming: 0,
	napping: false,
	petting: false,
	home: false,
	honeFound: false,
	honedByYou: false,
	gold: false
};

type Fake = {
	cat: Cat;
	body: Body;
	clock: SimulatedClock;
	/** Every line it said, by moment. */
	lines: string[];
	tricks: number;
	home: number;
	/** What the brain's `choose` answers, in order. */
	next: Pastime[];
	/** What the brain picks for mischief, in order. */
	evil: EvilAct[];
	/** What the brain's next `on` says. */
	signals: Signal[];
	/** What the mischief kit says it could do right now. */
	possible: EvilAct[];
	/** What the fake kit says the tantrum has left out of place, and whether anything is standing. */
	damage: { left: boolean; standing: boolean };
	/** Where the fake kit says the next piece to put back is, nearest first. */
	tidySpots: Spot[];
	/** Everything that happened, in order: kit calls and lines. */
	log: string[];
	/** The page side of a tantrum, as the machine calls it. */
	kit: Mischief;
	/** What the kit was asked to do, and what it did. */
	record: {
		visits: number;
		arrive: number;
		restore: number;
		steal: number;
		giveBack: boolean[];
		/** Pieces put back one at a time, and the times everything left went back at once. */
		tidy: number;
		snap: number;
		/** Everything that happened, in order: kit calls and lines, for order assertions. */
		log: string[];
	};
	tick(
		now: number,
		over?: Partial<{
			dc: number;
			petting: boolean;
			still: boolean;
			eager: boolean;
			line: boolean;
			talking: boolean;
			cross: boolean;
			flying: boolean;
		}>
	): void;
	/** The cat's mode, from the statechart that now owns it. */
	mode(): Mode;
	/** What the machine holds about what the cat is doing. */
	ctx(): ReturnType<Body['getSnapshot']>['context'];
};

function rect(left = 0, top = 0, width = 40, height = 40) {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({})
	};
}

function makeCat(): Fake {
	const clock = new SimulatedClock();
	const lines: string[] = [];
	const next: Pastime[] = [];
	const evilActs: EvilAct[] = [];
	const signals: Signal[] = [];
	const listeners = new Set<(signal: Signal) => void>();
	const possible: EvilAct[] = [];
	const giveBack: boolean[] = [];
	const log: string[] = [];
	/** What the fake kit has out of place, and what it says is still standing. */
	const damage = { left: false, standing: true };
	/** The pieces the fake kit says are waiting to be put back, nearest first. */
	const tidySpots: Spot[] = [];
	/** What the last act it was sent to do was. */
	let visiting: EvilAct | undefined;
	const state = {
		tricks: 0,
		home: 0,
		visits: 0,
		arrive: 0,
		restore: 0,
		steal: 0,
		tidy: 0,
		snap: 0
	};

	const brain = {
		meters: {
			energy: 80,
			company: 60,
			curiosity: 40,
			temper: 0,
			dizzy: 0,
			bond: 0
		},
		evil: false,
		cross: false,
		evilFor: 0,
		evilAt: 75,
		pokeSpam: false,
		daysAway: undefined,
		choose: (): Pastime | undefined => next.shift(),
		mood: () => 'content',
		tick: () => [],
		/** What the next `on` says, and it tells its listeners, as the real brain does. */
		on: (): Signal[] => {
			const out = signals.slice();
			signals.length = 0;
			for (const signal of out) for (const listener of listeners) listener(signal);
			return out;
		},
		listen: (listener: (signal: Signal) => void) => {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
		rest: () => {},
		stopEvil: () => {},
		chatGap: () => 8,
		vigour: () => 1,
		scores: () => ({ explore: 0, hone: 0, nap: 0 }),
		evilAct: (): EvilAct | undefined => evilActs.shift(),
		warningWaiting: () => {},
		warningHeard: () => {},
		save: () => {}
	} as unknown as Brain;

	const speech = {
		line: undefined,
		talking: false,
		talk: (text: string) => {
			lines.push(text);
			log.push(text);
		},
		blurt: (text: string) => {
			lines.push(text);
			log.push(text);
		},
		mark: () => {},
		has: () => false,
		cut: () => {},
		stop: () => {}
	} as unknown as Speech;

	const script = {
		next: (moment: Moment) => moment,
		pick: (moment: Moment) => ({ text: moment }),
		first: (moment: Moment) => moment
	} as unknown as Script;

	const probe: Probe = {
		mode: 'held',
		mood: 'content',
		scores: { explore: 0, hone: 0, nap: 0 }
	};
	const home = {
		getBoundingClientRect: () => rect(20, 20)
	} as unknown as HTMLElement;

	const cat: Cat = {
		size: 64,
		x: 600,
		y: 400,
		vx: 0,
		vy: 0,
		flying: false,
		left: { at: -1e9, x: 1190, y: 400, sideways: true },
		seen: new Set<string>(),
		cursor: { x: 700, y: 400, moved: 0, present: true },
		grab: { x: 0, y: 0 },
		press: undefined,
		pressAt: 0,
		drag: { vx: 0, vy: 0, t: 0 },
		trail: [],
		turns: [],
		flails: 0,
		lastMove: { x: 0, y: 0, t: 0 },
		leftHome: false,
		over: false,
		boxAt: -1e9,
		petFrom: 0,
		petLast: 0,
		spinFrom: -1e9,
		visits: 1,
		speech,
		brain,
		script,
		home,
		probe,
		onover: () => {},
		get onhome() {
			return () => {
				state.home += 1;
			};
		},
		feel: () => {},
		trick: () => {
			state.tricks += 1;
		},
		pulse: () => {},
		mood: () => 'content',
		bond: () => 0,
		restyled: false,
		restyle: () => {},
		eagerUntil: -1e9,
		send: (event) => fake.body.send(event)
	};

	const record = {
		visits: 0,
		arrive: 0,
		steal: 0,
		giveBack: [] as boolean[],
		get restore() {
			return state.restore;
		},
		get tidy() {
			return state.tidy;
		},
		get snap() {
			return state.snap;
		},
		log
	};
	const kit: Mischief = {
		possible: () => possible,
		visit: (act) => {
			record.visits += 1;
			visiting = act;
			record.log.push(`visit:${act}`);
			return { x: 300, y: 300, line: '', key: 'evil', mischief: true };
		},
		arrive: () => {
			record.arrive += 1;
			record.log.push('arrive');
			// A wreck leaves the page with something out of place.
			if (visiting === 'wreck') damage.left = true;
		},
		steal: () => {
			record.steal += 1;
			record.log.push('steal');
		},
		giveBack: (give) => {
			record.giveBack.push(give);
			record.log.push(`giveBack:${give}`);
		},
		restore: () => {
			state.restore += 1;
			record.log.push('restore');
			damage.left = false;
			tidySpots.length = 0;
		},
		damage: () => ({ ...damage }),
		nextTidy: () => tidySpots[0],
		tidyUp: () => {
			if (!tidySpots.length) return false;
			tidySpots.shift();
			state.tidy += 1;
			record.log.push('tidy');
			damage.left = tidySpots.length > 0;
			return true;
		},
		snapBack: () => {
			if (!damage.left) return 0;
			state.snap += 1;
			tidySpots.length = 0;
			damage.left = false;
			return 1;
		},
		fiddleSpot: () => ({
			x: 300,
			y: 300,
			line: '',
			key: 'fiddle',
			fiddle: true,
			act: () => record.log.push('fiddle')
		})
	};

	const fake: Fake = {
		cat,
		body: undefined as unknown as Body,
		clock,
		lines,
		next,
		evil: evilActs,
		signals,
		possible,
		damage,
		tidySpots,
		log,
		kit,
		record,
		get tricks() {
			return state.tricks;
		},
		get home() {
			return state.home;
		},
		mode() {
			return modeOf(fake.body.getSnapshot());
		},
		ctx() {
			return fake.body.getSnapshot().context;
		},
		tick(now, over = {}) {
			fake.body.send({
				type: 'TICK',
				now,
				x: cat.x,
				y: cat.y,
				dc: Math.hypot(cat.cursor.x - cat.x, cat.cursor.y - cat.y),
				cursor: { x: cat.cursor.x, y: cat.cursor.y, present: cat.cursor.present },
				left: { at: cat.left.at },
				flying: cat.flying,
				petting: false,
				still: false,
				eager: false,
				line: false,
				talking: false,
				cross: brain.cross,
				mood: 'content',
				toTile: toTileDistance(cat),
				toRunUp: fake.body.getSnapshot().hasTag('backingUp') ? ram.toRunUp(cat) : Infinity,
				senses: SENSES,
				...over
			});
		}
	};
	return fake;
}

/** How far the cat is from its tile, as the frame loop measures it: the fake tile is at (40, 40). */
function toTileDistance(cat: Cat) {
	const at = clampToView({ x: 40, y: 40 }, 1200, 800, cat.size / 2);
	return Math.hypot(at.x - cat.x, at.y - cat.y);
}

/**
 * A cat whose body is running, with the machine's tour planning under the test's control. `real`
 * gives it the real brain, told about the gap by what the component does with it.
 */
function start(plan: () => { again: boolean } | undefined = () => undefined, real = false): Fake {
	const fake = makeCat();
	// The same cat object, with the real brain deciding instead of the stub.
	if (real) (fake.cat as { brain: Brain }).brain = new Brain({ clock: () => fake.clock.now(), random: () => 0.9 });
	fake.body = createBody(fake.cat, {
		plan,
		clock: fake.clock,
		mischief: fake.kit
	});
	fake.body.start();
	// What the component does: the brain tells the body about its temper through its listener.
	fake.cat.brain.listen((signal) => {
		if (signal === 'evil') fake.cat.send({ type: 'EVIL' });
		else if (signal === 'calm') fake.cat.send({ type: 'CALM' });
	});
	return fake;
}

/** Let it out of its tile: the body starts in `held`, as it does on a first frame. */
function letOut(fake: Fake, now = 1000) {
	fake.cat.send({ type: 'RELEASE', now });
	return now;
}

/** The cursor leaving the window: by default, through the right edge toward another screen. */
function cursorLeft(
	fake: Fake,
	now: number,
	over: Partial<{
		edge: 'left' | 'right' | 'top' | 'bottom';
		sideways: boolean;
		extended: boolean;
		cross: boolean;
	}> = {}
) {
	const edge = over.edge ?? 'right';
	const sideways = over.sideways ?? (edge === 'left' || edge === 'right');
	fake.cat.cursor.present = false;
	fake.cat.left = { at: now, x: 1190, y: 400, sideways };
	fake.cat.send({
		type: 'CURSOR_LEFT',
		edge,
		sideways,
		extended: over.extended ?? true,
		cross: over.cross ?? false
	});
}

beforeEach(() => {
	vi.stubGlobal('innerWidth', 1200);
	vi.stubGlobal('innerHeight', 800);
	vi.stubGlobal('document', {
		querySelector: (selector: string) =>
			selector === 'main .label' ? { getBoundingClientRect: () => rect(100, 100, 200, 20) } : null,
		querySelectorAll: () => []
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the body: trips', () => {
	it('says where you went, and starts its run, when the cursor leaves during the announcement', () => {
		const fake = start();
		fake.next.push('explore');
		const now = letOut(fake);
		fake.tick(now);
		expect(fake.body.getSnapshot().matches({ body: { free: { trip: 'announce' } } })).toBe(true);
		const said = fake.lines.length;

		cursorLeft(fake, now + 100);
		expect(fake.lines.slice(said)).toEqual(['sideways']);
		expect(fake.ctx().ram.on).toBe(true);

		// The words are out, and the trip still goes.
		fake.clock.increment(900);
		expect(fake.ctx().spot).toBeDefined();
	});

	it('cancels an announced trip when it is grabbed, and never sets off', () => {
		const fake = start();
		const { cat, body } = fake;
		fake.next.push('explore');
		let now = letOut(fake);
		fake.tick(now);

		expect(body.getSnapshot().matches({ body: { free: { trip: 'announce' } } })).toBe(true);
		expect(fake.mode()).toBe('company');
		expect(fake.ctx().spot).toBeUndefined();
		expect(fake.lines).toContain('bored');

		// Into the hand, and the trip's 0.9s is the state's: leaving cancels it.
		cat.send({ type: 'GRAB' });
		expect(fake.mode()).toBe('held');
		fake.clock.increment(5000);
		expect(fake.mode()).toBe('held');
		expect(fake.ctx().spot).toBeUndefined();

		cat.send({ type: 'RELEASE', now: now + 200 });
		expect(fake.mode()).toBe('company');
		now += 3000;
		fake.tick(now);
		expect(body.getSnapshot().matches({ body: { free: 'company' } })).toBe(true);
		expect(fake.ctx().spot).toBeUndefined();
	});

	it('goes after the announcement, and Escape from the trip leaves for home without anything else firing', () => {
		const fake = start();
		const { cat, body } = fake;
		fake.next.push('explore');
		let now = letOut(fake);
		fake.tick(now);
		// The words are out; the go is 0.9s later, in the state that said them.
		fake.clock.increment(900);
		expect(fake.mode()).toBe('wander');
		expect(fake.ctx().spot).toBeDefined();

		// Walk it to the spot, so it would be arriving and doing whatever is there.
		const spot = fake.ctx().spot!;
		cat.x = spot.x;
		cat.y = spot.y;
		now += 100;
		fake.tick(now);
		expect(body.getSnapshot().matches({ body: { free: { trip: 'there' } } })).toBe(true);

		cat.send({ type: 'ESCAPE' });
		expect(fake.mode()).toBe('homing');
		expect(fake.ctx().spot).toBeUndefined();
		// Away from its tile, so it really is on its way home, and well past the arrival's act
		// and the linger: nothing of the trip may still be ticking.
		cat.x = 600;
		cat.y = 400;
		const before = fake.lines.length;
		fake.clock.increment(30_000);
		now += 30_000;
		fake.tick(now);
		expect(body.getSnapshot().hasTag('homing')).toBe(true);
		expect(fake.lines.length).toBe(before);

		// Arriving at its tile is the one way in.
		const tile = cat.home.getBoundingClientRect();
		cat.x = tile.left + tile.width / 2;
		cat.y = tile.top + tile.height / 2;
		fake.tick(now + 100);
		expect(fake.home).toBe(1);
	});
});

describe('the body: the guided tour', () => {
	it('says where you went when the cursor leaves during the announcement, and keeps its 0.9s', () => {
		const fake = start(() => ({ again: false }));
		const now = letOut(fake);
		fake.tick(now + 20_000);
		expect(fake.body.getSnapshot().matches({ body: { free: { tour: 'announcing' } } })).toBe(true);
		const said = fake.lines.length;

		cursorLeft(fake, now + 20_000);
		expect(fake.lines.slice(said)).toEqual(['sideways']);
		// The tour was already saying where it is going: it still goes.
		expect(fake.body.getSnapshot().matches({ body: { free: { tour: 'announcing' } } })).toBe(true);
		fake.clock.increment(900);
		expect(fake.ctx().spot).toBeDefined();
	});

	it('says it is off the tour once a grab has been let go', () => {
		const fake = start(() => ({ again: false }));
		const { cat, body } = fake;
		const now = letOut(fake);
		// Past the ten seconds it waits after coming out.
		fake.tick(now + 20_000);
		expect(body.getSnapshot().matches({ body: { free: { tour: 'announcing' } } })).toBe(true);
		expect(fake.lines).toContain('tourStart');

		fake.clock.increment(900);
		expect(fake.mode()).toBe('wander');
		expect(body.getSnapshot().matches({ body: { free: { tour: 'visiting' } } })).toBe(true);
		expect(fake.ctx().spot).toBeDefined();

		// At the first stop, so the visit is real.
		const spot = fake.ctx().spot!;
		cat.x = spot.x;
		cat.y = spot.y;
		fake.tick(now + 20_100);
		expect(fake.lines).toContain('tourProjects');

		cat.send({ type: 'GRAB' });
		expect(fake.mode()).toBe('held');
		cat.send({ type: 'RELEASE', now: now + 20_300 });
		expect(fake.mode()).toBe('company');
		expect(fake.lines).toContain('tourSkip');

		// And that is the end of it: the tour is not offered again this let-out.
		fake.tick(now + 40_000);
		expect(body.getSnapshot().matches({ body: { free: { trip: 'announce' } } })).toBe(false);
		expect(fake.lines.filter((line) => line === 'tourStart')).toHaveLength(1);
	});

	it('forgets a tour it has not started yet when a tantrum takes it', () => {
		const fake = start(() => ({ again: false }));
		const now = letOut(fake);
		goEvil(fake);
		fake.cat.send({ type: 'CALM' });

		// The tour was due ten seconds after it came out, well after the tantrum: it is not offered
		// now that the cat is calm again.
		for (let t = now + 1000; t < now + 60_000; t += 1000) fake.tick(t);
		expect(fake.lines).not.toContain('tourStart');
	});
});

describe('the body: sleeping', () => {
	it('naps when the brain says so, and a poke wakes it', () => {
		const fake = start();
		const { cat, body } = fake;
		fake.next.push('nap');
		const now = letOut(fake);
		fake.tick(now);
		expect(body.getSnapshot().hasTag('asleep')).toBe(true);
		expect(fake.mode()).toBe('sleep');
		expect(fake.lines).toContain('nap');

		cat.send({ type: 'POKE', now: now + 1000 });
		expect(fake.mode()).toBe('seek');
		expect(fake.lines).toContain('wakePoked');
		// Woken, not poked: no trick, and no line about it being poked awake again.
		expect(fake.tricks).toBe(0);
	});
});

/** Put the cat on its spot, as if it had swum there. */
function arriveAt(fake: Fake, now: number) {
	const spot = fake.ctx().spot!;
	fake.cat.x = spot.x;
	fake.cat.y = spot.y;
	fake.tick(now);
}

/** Out of the tour's announcement and at its first stop. */
function atFirstStop(fake: Fake) {
	const now = letOut(fake);
	fake.tick(now + 20_000);
	fake.clock.increment(900);
	arriveAt(fake, now + 20_100);
	return now + 20_100;
}

describe('the body: what the review found', () => {
	it('says the tour skip line when bounced off the tile, and not at a later grab', () => {
		const fake = start(() => ({ again: false }));
		const now = atFirstStop(fake);
		fake.cat.send({ type: 'GRAB' });
		// A drop on the tile with a tantrum on bounces off, and the tour it left is still off.
		goEvil(fake);
		fake.cat.send({ type: 'DROP_HOME', now: now + 100 });
		expect(fake.lines.filter((l) => l === 'tourSkip')).toHaveLength(1);
		fake.cat.send({ type: 'GRAB' });
		fake.cat.send({ type: 'RELEASE', now: now + 40_100 });
		expect(fake.lines.filter((l) => l === 'tourSkip')).toHaveLength(1);
	});

	it('says it is off the tour once, when sent home from the hand', () => {
		const fake = start(() => ({ again: false }));
		const now = atFirstStop(fake);
		fake.cat.send({ type: 'GRAB' });
		fake.cat.send({ type: 'ESCAPE' });
		fake.cat.send({ type: 'GRAB' });
		fake.cat.send({ type: 'RELEASE', now: now + 300 });
		expect(fake.lines.filter((l) => l === 'tourSkip')).toHaveLength(1);
	});

	it('drops its turn at the bunny when poked on the way there', () => {
		const fake = start();
		const act = vi.fn();
		const now = letOut(fake);
		fake.cat.send({
			type: 'VISIT',
			spot: { x: 300, y: 300, line: '', key: 'errand', act }
		});
		fake.cat.send({ type: 'POKE', now: now + 50 });
		arriveAt(fake, now + 100);
		fake.clock.increment(10_000);
		expect(act).not.toHaveBeenCalled();
	});

	it('drops its turn at the bunny when poked there', () => {
		const fake = start();
		const act = vi.fn();
		const now = letOut(fake);
		fake.cat.send({
			type: 'VISIT',
			spot: { x: 300, y: 300, line: '', key: 'errand', act }
		});
		arriveAt(fake, now + 100);
		expect(fake.body.getSnapshot().matches({ body: { free: { trip: 'there' } } })).toBe(true);
		fake.cat.send({ type: 'POKE', now: now + 200 });
		fake.clock.increment(10_000);
		expect(act).not.toHaveBeenCalled();
		expect(fake.lines).toContain('poke');
	});

	it('does the thing at a spot when left alone, then moves on', () => {
		const fake = start();
		const act = vi.fn();
		const now = letOut(fake);
		fake.cat.send({
			type: 'VISIT',
			spot: { x: 300, y: 300, line: '', key: 'bunny', act }
		});
		arriveAt(fake, now + 100);
		fake.clock.increment(900);
		expect(act).toHaveBeenCalledTimes(1);
		fake.clock.increment(7000);
		expect(fake.mode()).toBe('seek');
	});

	it('starts its run at the edge straight away, however young the page', () => {
		const fake = start();
		const now = letOut(fake, 500);
		cursorLeft(fake, now);
		for (let t = now + 16; t < now + 1000; t += 16) fake.tick(t);
		expect(ramming(fake.body.getSnapshot())).toBe(true);
	});

	it('ends a tour with nobody there without charging an edge the cursor left long ago', () => {
		const fake = start(() => ({ again: false }));
		const now = letOut(fake);
		fake.tick(now + 20_000);
		// The cursor leaves during the announcement; the tour still goes.
		cursorLeft(fake, now + 20_000);
		fake.clock.increment(900);
		// The only stop on this page, said and lingered over: the tour is over.
		arriveAt(fake, now + 21_000);
		fake.tick(now + 60_000);
		expect(ramming(fake.body.getSnapshot())).toBe(false);
		expect(fake.ctx().ram.on).toBe(false);
		expect(fake.lines).toContain('tourEnd');
	});

	it('goes home when dropped on its tile', () => {
		const fake = start();
		letOut(fake);
		fake.cat.send({ type: 'GRAB' });
		fake.cat.send({ type: 'DROP_HOME', now: 2100 });
		expect(fake.body.getSnapshot().hasTag('home')).toBe(true);
		expect(fake.home).toBe(1);
	});

	it('still finds the bunny game when poked on arrival', () => {
		const fake = start();
		const act = vi.fn();
		const now = letOut(fake);
		fake.cat.send({
			type: 'VISIT',
			spot: { x: 300, y: 300, line: '', key: 'bunny', act }
		});
		arriveAt(fake, now + 100);
		fake.cat.send({ type: 'POKE', now: now + 200 });
		fake.clock.increment(900);
		expect(act).toHaveBeenCalledTimes(1);
	});
});

/** Start a tantrum, as the component does when the brain turns evil. */
function goEvil(fake: Fake) {
	fake.cat.send({ type: 'EVIL' });
}

/** Saying what the act is about to do, and waiting on its moment. */
function saying(fake: Fake) {
	return fake.body.getSnapshot().matches({ temper: { evil: { acts: 'announcing' } } });
}

/** On its way to the bit of page it picked: one swim, whichever act it was. */
function onTheWay(fake: Fake) {
	return fake.body.getSnapshot().matches({ temper: { evil: { acts: { doing: 'swim' } } } });
}

/** Past the mood landing, with the next bit of mischief announced. */
function announcing(fake: Fake, act: EvilAct, now = 1000) {
	letOut(fake, now);
	fake.possible.push(act);
	fake.evil.push(act);
	goEvil(fake);
	fake.clock.increment(3000);
	// The pace is due; the next frame is what picks the act.
	fake.tick(now + 3000);
}

/** Put the cat on the spot the temper region sent it to, as if it had swum there. */
function mischiefArrived(fake: Fake, now: number) {
	const spot = fake.ctx().spot!;
	fake.cat.x = spot.x;
	fake.cat.y = spot.y;
	fake.tick(now);
	fake.clock.increment(900);
}

describe('the temper: picking and cancelling an act', () => {
	it('says it is evil when the brain turns, and the tour line when the tour is on', () => {
		const fake = start();
		letOut(fake);
		goEvil(fake);
		expect(fake.lines).toContain('evil');
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);

		// A tantrum that starts mid-tour leaves with the tour's line instead, whichever way the
		// component found out.
		const other = start(() => ({ again: false }));
		const now = atFirstStop(other);
		goEvil(other);
		expect(other.lines).toContain('tourEvil');
	});

	it('waits three seconds after the mood lands, then announces the act it picked', () => {
		const fake = start();
		letOut(fake);
		fake.possible.push('vandal');
		fake.evil.push('vandal');
		goEvil(fake);
		fake.clock.increment(2999);
		expect(fake.body.getSnapshot().matches({ temper: { evil: { pace: 'first', acts: 'waiting' } } })).toBe(true);
		expect(fake.lines).not.toContain('evilVandal');

		fake.clock.increment(1);
		fake.tick(4000);
		expect(saying(fake)).toBe(true);
		expect(fake.lines).toContain('evilVandal');
		expect(actOf(fake.body.getSnapshot())).toBe('vandal');
	});

	it('never does the DOM work for an act that was announced and then grabbed', () => {
		const fake = start();
		announcing(fake, 'vandal');
		expect(saying(fake)).toBe(true);

		fake.cat.send({ type: 'GRAB' });
		expect(fake.mode()).toBe('held');
		fake.clock.increment(30_000);
		fake.tick(40_000);
		expect(fake.record.arrive).toBe(0);
		expect(fake.record.visits).toBe(0);
	});

	it('cancels a poke mid-act, and never does its DOM work', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.cat.send({ type: 'POKE', now: 5000 });
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		// Poked in a tantrum, it answers as one; the fake brain used to be able to say otherwise.
		expect(fake.lines).toContain('pokeEvil');

		fake.clock.increment(30_000);
		expect(fake.record.arrive).toBe(0);
		expect(fake.record.visits).toBe(0);
	});

	it('cancels a poke once it is on its way to the bit of the page', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		expect(onTheWay(fake)).toBe(true);
		expect(fake.record.visits).toBe(1);
		expect(fake.mode()).toBe('wander');

		fake.cat.send({ type: 'POKE', now: 6000 });
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		// The arrival still comes from the body, but the act is over: no DOM work.
		mischiefArrived(fake, 6100);
		fake.clock.increment(10_000);
		expect(fake.record.arrive).toBe(0);
	});

	it('rewrites the thing it swam to on arrival, then goes back to waiting', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		expect(fake.record.visits).toBe(1);
		mischiefArrived(fake, 5000);
		expect(fake.record.arrive).toBe(1);
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
	});
});

/** A wreck under way: picked, and on its way to the first piece of the page. */
function wrecking(fake: Fake, now = 1000) {
	letOut(fake, now);
	fake.possible.push('wreck');
	fake.evil.push('wreck');
	goEvil(fake);
	fake.clock.increment(3000);
	// The pace is due; the next frame picks the act, and a wreck sets off without a word.
	fake.tick(now + 3000);
}

describe('the tidy comes before anything new', () => {
	it('picks no pastime while the page still needs putting back', () => {
		const fake = start();
		fake.tidySpots.push(outOfPlace(200, 200));
		wrecking(fake);
		mischiefArrived(fake, 4100);
		fake.cat.send({ type: 'CALM' });
		// Taken off the tidy and let go while still cross: it cannot tidy yet, and it waits rather
		// than settling down for a nap on the mess.
		fake.cat.send({ type: 'GRAB' });
		fake.cat.send({ type: 'RELEASE', now: 5000 });
		fake.next.push('nap');
		for (let t = 6000; t <= 20_000; t += 1000) fake.tick(t, { cross: true });
		expect(fake.mode()).not.toBe('sleep');
		// Cooled off, it goes back to the tidy.
		fake.tick(21_000);
		expect(fake.mode()).toBe('wander');
	});
});

describe('the temper: the wreck', () => {
	it('takes piece after piece down, saying so after each and never before', () => {
		const fake = start();
		wrecking(fake);
		expect(fake.record.visits).toBe(1);
		expect(fake.mode()).toBe('wander');

		let now = 4100;
		for (let piece = 1; piece <= 7; piece++) {
			mischiefArrived(fake, now);
			expect(fake.record.arrive).toBe(piece);
			// The piece is down first, and only then the word about it.
			const at = fake.log.lastIndexOf('arrive');
			expect(fake.log.slice(at)).toEqual(['arrive', 'wreck']);
			now += 2000;
			fake.clock.increment(1100);
		}

		expect(fake.lines.filter((l) => l === 'wreck')).toHaveLength(7);
		// Still pieces standing, so the rampage goes on to the next one.
		expect(fake.record.visits).toBe(8);
	});

	it('has its own last word for the last piece standing, and stops there', () => {
		const fake = start();
		fake.damage.standing = false;
		wrecking(fake);

		mischiefArrived(fake, 4100);
		expect(fake.record.arrive).toBe(1);
		expect(fake.lines).toContain('wreckLast');
		expect(fake.lines).not.toContain('wreck');

		// Nothing left standing, so no second piece: back to waiting for the next act.
		fake.clock.increment(1100);
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		expect(fake.record.visits).toBe(1);
	});

	it('stops the rampage when it is grabbed, and never takes another piece', () => {
		const fake = start();
		wrecking(fake);
		mischiefArrived(fake, 4100);
		expect(fake.record.arrive).toBe(1);

		fake.cat.send({ type: 'GRAB' });
		expect(fake.mode()).toBe('held');
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		fake.clock.increment(60_000);
		fake.tick(70_000);
		expect(fake.record.visits).toBe(1);
	});

	it('stops the rampage when it is poked', () => {
		const fake = start();
		wrecking(fake);
		fake.cat.send({ type: 'POKE', now: 5000 });
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		fake.clock.increment(60_000);
		expect(fake.record.visits).toBe(1);
	});
});

/** A piece the fake kit still has to put back. */
const outOfPlace = (x: number, y: number): Spot => ({ x, y, line: '', key: 'tidy', mischief: true });

describe('the body: tidying up after a tantrum', () => {
	/** A tantrum that took one piece down, and then calmed down. */
	function calmedAfterWreck(fake: Fake) {
		wrecking(fake);
		mischiefArrived(fake, 4100);
		expect(fake.damage.left).toBe(true);
		fake.cat.send({ type: 'CALM' });
	}

	it('puts the pieces back one at a time and ends with a word about it', () => {
		const fake = start();
		fake.tidySpots.push(outOfPlace(200, 200), outOfPlace(500, 200));
		calmedAfterWreck(fake);
		expect(fake.lines).toContain('calmTime');
		expect(fake.body.getSnapshot().matches({ body: { free: { tidy: 'swimming' } } })).toBe(true);
		expect(fake.mode()).toBe('wander');

		// At the first: it goes back, and the cat says something about it.
		arriveAt(fake, 6000);
		expect(fake.record.tidy).toBe(1);
		expect(fake.lines).toContain('tidy');
		expect(fake.body.getSnapshot().matches({ body: { free: { tidy: 'putting' } } })).toBe(true);

		// A beat later, the next piece, and then the page is back.
		fake.clock.increment(900);
		arriveAt(fake, 7000);
		expect(fake.record.tidy).toBe(2);
		fake.clock.increment(900);

		expect(fake.lines).toContain('tidyDone');
		expect(fake.damage.left).toBe(false);
		// Then back to the cursor.
		expect(fake.mode()).toBe('seek');
	});

	it('snaps the rest back at once once nothing out of place is on the page', () => {
		const fake = start();
		calmedAfterWreck(fake);
		// The kit has something out of place, but nothing of it on the page to swim to.
		expect(fake.record.snap).toBe(1);
		expect(fake.lines).toContain('tidyDone');
		expect(fake.body.getSnapshot().matches({ body: { free: 'tidy' } })).toBe(false);
	});

	it('picks the tidy up again after a grab and a release', () => {
		const fake = start();
		fake.tidySpots.push(outOfPlace(200, 200));
		calmedAfterWreck(fake);
		expect(fake.body.getSnapshot().matches({ body: { free: { tidy: 'swimming' } } })).toBe(true);

		fake.cat.send({ type: 'GRAB' });
		expect(fake.mode()).toBe('held');
		fake.cat.send({ type: 'RELEASE', now: 6000 });
		expect(fake.mode()).toBe('company');
		fake.tick(6100);
		expect(fake.body.getSnapshot().matches({ body: { free: { tidy: 'swimming' } } })).toBe(true);
	});

	it('puts everything back at once when sent home mid-tidy', () => {
		const fake = start();
		fake.tidySpots.push(outOfPlace(200, 200));
		calmedAfterWreck(fake);
		const restored = fake.record.restore;
		fake.cat.send({ type: 'ESCAPE' });
		expect(fake.record.restore).toBe(restored + 1);
		expect(fake.mode()).toBe('homing');
		expect(fake.ctx().damage.left).toBe(false);
	});

	it('puts everything back at once when sent home mid-tantrum', () => {
		const fake = start();
		wrecking(fake);
		mischiefArrived(fake, 4100);
		const restored = fake.record.restore;
		fake.cat.send({ type: 'ESCAPE' });
		expect(fake.record.restore).toBeGreaterThan(restored);
		expect(fake.body.getSnapshot().matches({ temper: 'calm' })).toBe(true);
		expect(fake.ctx().damage.left).toBe(false);
	});
});

describe('the body: the fiddle', () => {
	/** A bored cat sets off on a fiddle, with no word about it first. */
	function fiddling(fake: Fake) {
		fake.next.push('fiddle');
		letOut(fake);
		fake.tick(1100);
		expect(fake.ctx().choice).toBe('fiddle');
		fake.clock.increment(900);
		expect(fake.ctx().spot?.key).toBe('fiddle');
	}

	it('sets off without a word, and says oops only once it has done it', () => {
		const fake = start();
		fiddling(fake);
		expect(fake.lines).not.toContain('bored');
		expect(fake.mode()).toBe('wander');

		const from = fake.log.length;
		arriveAt(fake, 2000);
		// Getting there is not the deed: nothing is said or moved yet.
		expect(fake.log.slice(from)).toEqual([]);
		fake.clock.increment(900);
		// The kit's fiddle first, and the oops after it.
		expect(fake.log.slice(from)).toEqual(['fiddle', 'oops']);
	});

	it('keeps the mess until it goes home', () => {
		const fake = start();
		fiddling(fake);
		arriveAt(fake, 2000);
		fake.clock.increment(900);
		const restored = fake.record.restore;
		fake.cat.send({ type: 'ESCAPE' });
		expect(fake.record.restore).toBe(restored + 1);
		expect(fake.mode()).toBe('homing');
	});
});

describe('the temper: the bunny', () => {
	it('threatens the bunny and relents 2.6 seconds later, never honing it', () => {
		const fake = start();
		letOut(fake);
		fake.possible.push('bunny');
		fake.evil.push('bunny');
		goEvil(fake);
		fake.clock.increment(3000);
		fake.tick(4000);
		// No announcement line for the bunny: it swims there first.
		expect(onTheWay(fake)).toBe(true);
		expect(actOf(fake.body.getSnapshot())).toBe('bunny');
		expect(fake.lines).not.toContain('bunnyThreat');

		mischiefArrived(fake, 5000);
		expect(fake.lines).toContain('bunnyThreat');
		expect(fake.lines).not.toContain('bunnyRelent');

		fake.clock.increment(2599);
		expect(fake.lines).not.toContain('bunnyRelent');
		fake.clock.increment(1);
		expect(fake.lines).toContain('bunnyRelent');
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
	});

	it('drops the threat when calmed down first, and leaves the page for the tidy', () => {
		const fake = start();
		letOut(fake);
		fake.possible.push('bunny');
		fake.evil.push('bunny');
		goEvil(fake);
		fake.clock.increment(3000);
		fake.tick(4000);
		mischiefArrived(fake, 5000);
		expect(fake.lines).toContain('bunnyThreat');

		fake.cat.send({ type: 'CALM' });
		fake.clock.increment(10_000);
		expect(fake.lines).not.toContain('bunnyRelent');
		expect(fake.lines).toContain('calmTime');
		// Calming down is not putting the page back: that is the tidy's, or the way home's.
		expect(fake.record.restore).toBe(0);
		expect(fake.body.getSnapshot().matches({ temper: 'calm' })).toBe(true);
	});
});

describe('the temper: how it ends', () => {
	it('hands the cursor back and says why it stopped before anything of the tidy', () => {
		const fake = start();
		letOut(fake);
		goEvil(fake);
		fake.cat.send({ type: 'CALM' });

		// Calmed by time, so the cursor makeover comes back, and the word about it is first.
		expect(fake.record.giveBack).toEqual([true]);
		const handBack = fake.record.log.indexOf('giveBack:true');
		const said = fake.record.log.indexOf('calmTime');
		expect(handBack).toBeGreaterThan(-1);
		expect(said).toBeGreaterThan(handBack);
		expect(fake.body.getSnapshot().matches({ temper: 'calm' })).toBe(true);
		// Nothing was taken down, so there is nothing to tidy: no line about a page that is fine.
		expect(fake.lines).not.toContain('tidyDone');
	});

	it('says the grudge on Escape, leaves for home, and keeps the stolen cursor', () => {
		const fake = start();
		letOut(fake);
		// Start it mid-tour, as if a tantrum caught it there.
		goEvil(fake);
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);

		fake.cat.send({ type: 'ESCAPE' });
		// The tantrum's own end puts the page back at once, and so does the way home.
		expect(fake.record.restore).toBeGreaterThan(0);
		expect(fake.record.giveBack).toEqual([false]);
		expect(fake.lines).toContain('evilHome');
		expect(fake.body.getSnapshot().hasTag('homing')).toBe(true);
		expect(fake.body.getSnapshot().matches({ temper: 'calm' })).toBe(true);

		// The tile is the one way in, as for any send home.
		const tile = fake.cat.home.getBoundingClientRect();
		fake.cat.x = tile.left + tile.width / 2;
		fake.cat.y = tile.top + tile.height / 2;
		fake.tick(6000);
		expect(fake.home).toBe(1);
	});
});

describe('the temper: what the review found', () => {
	afterEach(() => vi.restoreAllMocks());

	it('picks the next act when the cursor leaves while it swims to one', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fake = start();
		announcing(fake, 'vandal');
		const first = fake.lines.filter((l) => l === 'evilVandal').length;
		fake.possible.push('vandal');
		fake.evil.push('vandal');
		fake.clock.increment(1200);
		expect(onTheWay(fake)).toBe(true);
		cursorLeft(fake, 5500);
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);
		// The next act is due a gap after the vandal was picked, not after the cursor left.
		fake.clock.increment(8800);
		fake.tick(14_100);
		expect(fake.lines.filter((l) => l === 'evilVandal')).toHaveLength(first + 1);
		expect(fake.record.arrive).toBe(0);
	});

	it('gives up an act whose swim never arrives', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		expect(onTheWay(fake)).toBe(true);
		// Looked at every five seconds: the first frame starts the clock, the first look measures,
		// and the second sees no progress in five seconds.
		fake.tick(5200);
		fake.clock.increment(5000);
		fake.tick(10_200);
		expect(onTheWay(fake)).toBe(true);
		fake.clock.increment(5000);
		fake.tick(15_200);
		expect(onTheWay(fake)).toBe(false);
	});

	it('does not give up a swim that went on in a background tab, and measures afresh once back', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		const spot = fake.ctx().spot!;
		fake.cat.x = spot.x + 3000;
		fake.cat.y = spot.y;
		let now = 5200;
		fake.tick(now);
		// Away in another tab: it cannot swim, and nothing is held against it.
		fake.cat.send({ type: 'TAB_AWAY' });
		for (let i = 0; i < 4; i++) {
			fake.clock.increment(5000);
			now += 5000;
			fake.tick(now);
		}
		expect(onTheWay(fake)).toBe(true);
		// Back just before a look, having swum only a little since.
		fake.cat.send({ type: 'TAB_BACK', missed: true });
		fake.cat.x -= 5;
		fake.tick((now += 16));
		fake.clock.increment(5000);
		fake.tick((now += 5000));
		expect(onTheWay(fake)).toBe(true);
		fake.cat.x -= 400;
		fake.clock.increment(5000);
		fake.tick((now += 5000));
		expect(onTheWay(fake)).toBe(true);
		mischiefArrived(fake, now + 100);
		expect(fake.record.arrive).toBe(1);
	});

	it('never gives up a swim while the tab is away', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		const spot = fake.ctx().spot!;
		fake.cat.x = spot.x + 3000;
		fake.cat.y = spot.y;
		let now = 5200;
		fake.tick(now);
		fake.cat.send({ type: 'TAB_AWAY' });
		// A minute of frames from a tab that is not being looked at: every look is off.
		for (let i = 0; i < 12; i++) {
			fake.clock.increment(5000);
			now += 5000;
			fake.tick(now);
		}
		expect(onTheWay(fake)).toBe(true);
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);
	});

	it('keeps waiting for a slow swim that is still getting closer, and does the act on arrival', () => {
		const fake = start();
		announcing(fake, 'vandal');
		fake.clock.increment(1200);
		const spot = fake.ctx().spot!;
		fake.cat.x = spot.x + 3000;
		fake.cat.y = spot.y;
		let now = 5200;
		fake.tick(now);
		for (let i = 0; i < 6; i++) {
			fake.clock.increment(5000);
			now += 5000;
			fake.cat.x -= 400;
			fake.tick(now);
		}
		expect(onTheWay(fake)).toBe(true);
		mischiefArrived(fake, 40_000);
		expect(fake.record.arrive).toBe(1);
	});

	it('paces acts from when each was picked, not from when the last one ended', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fake = start();
		wrecking(fake);
		// Three pieces down, one every two seconds of the test's clock, and the third is the last
		// one standing, so the rampage ends there.
		let now = 4100;
		for (let i = 0; i < 3; i++) {
			if (i === 2) fake.damage.standing = false;
			mischiefArrived(fake, now);
			now += 2000;
			fake.clock.increment(1100);
		}
		expect(fake.record.arrive).toBe(3);
		expect(fake.body.getSnapshot().matches({ temper: { evil: { acts: 'waiting' } } })).toBe(true);

		// Picked 3s in, the next act was due 10s after the pick, so the rampage taking its time is
		// no reason to push it back: one more frame and the next act is on.
		fake.clock.increment(4000);
		fake.possible.push('vandal');
		fake.evil.push('vandal');
		fake.tick(14_000);
		expect(fake.lines).toContain('evilVandal');
	});
});

describe('the body: the run at the edge', () => {
	it('follows only a sideways exit toward another screen', () => {
		const towards = start();
		letOut(towards);
		cursorLeft(towards, 2000, { sideways: true, extended: true });
		expect(towards.ctx().ram.on).toBe(true);

		const single = start();
		letOut(single);
		cursorLeft(single, 2000, { sideways: true, extended: false });
		expect(single.ctx().ram.on).toBe(false);

		const up = start();
		letOut(up);
		cursorLeft(up, 2000, { edge: 'top' });
		expect(up.ctx().ram.on).toBe(false);
	});

	it('runs at the wall four times, then gives up with a word about it', () => {
		const fake = start();
		const now = letOut(fake, 500);
		cursorLeft(fake, now);
		// The run begins on the next frame, with a moment to turn around.
		fake.tick(now + 16);
		expect(fake.body.getSnapshot().matches({ body: { free: { edge: { ramming: 'pause' } } } })).toBe(true);
		fake.clock.increment(ram.PAUSE);
		expect(backingUp(fake.body.getSnapshot())).toBe(true);

		// It swims to its run-up point (the frame loop does the swimming).
		const { wallX, dir } = ram.edge(fake.cat);
		const at = ram.runUp(fake.cat, wallX, dir);
		fake.cat.x = at.x;
		fake.cat.y = at.y;
		let at16 = now + ram.PAUSE + 16;
		fake.tick(at16);
		expect(charging(fake.body.getSnapshot())).toBe(true);

		for (let i = 1; i <= ram.RAMS; i++) {
			fake.cat.send({ type: 'RAM_HIT', now: at16 });
			expect(fake.ctx().ram.count).toBe(i);
			at16 += 16;
			if (i < ram.RAMS) {
				// Bounced off, back round, and lined up again.
				fake.clock.increment(ram.RECOIL);
				fake.tick(at16);
				expect(charging(fake.body.getSnapshot())).toBe(true);
			}
		}
		expect(fake.lines.filter((l) => l === 'rammed')).toHaveLength(ram.RAMS - 1);
		expect(fake.lines).toContain('gaveUp');

		// The last splat is the end of the run: it sulks at the edge, then waits there.
		fake.tick(at16);
		expect(whereOf(fake.body.getSnapshot())).toBe('edge-sulking');
	});

	it('says nothing and starts no run when the cursor leaves while it is asleep', () => {
		const fake = start();
		fake.next.push('nap');
		const now = letOut(fake);
		fake.tick(now);
		expect(fake.mode()).toBe('sleep');
		const said = fake.lines.length;

		cursorLeft(fake, now + 1000);
		fake.tick(now + 1016);
		expect(fake.mode()).toBe('sleep');
		expect(fake.ctx().ram.on).toBe(false);
		expect(fake.lines.length).toBe(said);
	});

	it('says nothing and starts no run when the cursor leaves on its way home', () => {
		const fake = start();
		const now = letOut(fake);
		// Well away from its tile, so the swim home is a real one.
		fake.cat.x = 900;
		fake.cat.y = 500;
		fake.cat.send({ type: 'ESCAPE' });
		expect(fake.mode()).toBe('homing');
		const said = fake.lines.length;

		cursorLeft(fake, now + 200);
		fake.tick(now + 216);
		expect(fake.mode()).toBe('homing');
		expect(fake.ctx().ram.on).toBe(false);
		expect(fake.lines.length).toBe(said);
	});

	it('starts no run at a side wall when a later leave goes through the top', () => {
		const fake = start();
		const now = letOut(fake);
		cursorLeft(fake, now + 1000);
		expect(fake.ctx().ram.on).toBe(true);

		// Back after a while, so it swims over rather than taking up the edge again.
		fake.cat.cursor.present = true;
		fake.cat.send({ type: 'CURSOR_BACK', slow: true, dc: 300, sideways: true, cross: false });
		fake.tick(now + 2000);

		// A top exit is no run at all: the earlier one was for the edge it was left at.
		cursorLeft(fake, now + 2000, { edge: 'top' });
		expect(fake.ctx().ram.on).toBe(false);
		fake.tick(now + 2016);
		expect(whereOf(fake.body.getSnapshot())).toBe('edge-waiting');
	});
});

describe('the body: what the pointer reports', () => {
	it('notices a flail while keeping you company, and not while it is off exploring', () => {
		const away = start();
		away.next.push('explore');
		const now = letOut(away);
		away.tick(now);
		away.clock.increment(900);
		expect(away.mode()).toBe('wander');
		const said = away.lines.length;
		away.cat.send({ type: 'FLAIL' });
		expect(away.lines.length).toBe(said);

		const home = start();
		letOut(home);
		home.cat.send({ type: 'FLAIL' });
		expect(home.lines).toContain('dizzy');
	});

	it('says nothing about the cursor coming back while it is asleep', () => {
		const fake = start();
		fake.next.push('nap');
		const now = letOut(fake);
		fake.tick(now);
		expect(fake.mode()).toBe('sleep');
		const said = fake.lines.length;
		fake.cat.send({ type: 'CURSOR_BACK', slow: true, dc: 900, sideways: true, cross: false });
		expect(fake.lines.length).toBe(said);
		expect(fake.mode()).toBe('sleep');
	});

	it('wakes a sleeping cat when the cursor comes near it', () => {
		const fake = start();
		fake.next.push('nap');
		const now = letOut(fake);
		fake.tick(now);
		expect(fake.mode()).toBe('sleep');
		fake.cat.send({ type: 'CURSOR_NEAR', now: now + 1000, dc: 900 });
		expect(fake.mode()).toBe('sleep');
		fake.cat.send({ type: 'CURSOR_NEAR', now: now + 1100, dc: 100 });
		expect(fake.mode()).toBe('seek');
		expect(fake.lines).toContain('wake');
	});

	it('says only the wake line when the move that wakes it is the one that stirs it', () => {
		const fake = start();
		fake.next.push('nap');
		const now = letOut(fake);
		fake.tick(now);
		expect(fake.mode()).toBe('sleep');
		const said = fake.lines.length;

		// One move, carrying both: near enough to wake it, and the cursor's first in a long while.
		fake.cat.send({ type: 'CURSOR_NEAR', now: now + 1000, dc: 100 });
		fake.cat.send({ type: 'STIRRED', now: now + 1000 });
		expect(fake.mode()).toBe('seek');
		expect(fake.lines.slice(said)).toEqual(['wake']);

		// A later stir is its own: a still cursor moving again still gets its word.
		fake.cat.send({ type: 'STIRRED', now: now + 2000 });
		expect(fake.lines).toContain('stirred');
	});

	it('says you are back when the cursor returns while it is on its way home', () => {
		const fake = start();
		const now = letOut(fake);
		fake.cat.x = 900;
		fake.cat.y = 500;
		fake.cat.send({ type: 'ESCAPE' });
		expect(fake.mode()).toBe('homing');
		const said = fake.lines.length;

		cursorLeft(fake, now + 100);
		fake.cat.cursor.present = true;
		fake.cat.send({ type: 'CURSOR_BACK', slow: true, dc: 500, sideways: true, cross: false });
		expect(fake.lines.slice(said)).toEqual(['backSideways']);
		expect(fake.mode()).toBe('homing');
	});

	it('counts the cursor as on the page again from the frame, even having missed its return', () => {
		const fake = start();
		const now = letOut(fake);
		fake.cat.x = 900;
		fake.cat.y = 500;
		fake.cat.send({ type: 'ESCAPE' });
		// The cursor slips out and back, and the move that would have said so never arrives.
		cursorLeft(fake, now + 100);
		expect(fake.ctx().here).toBe(false);
		fake.cat.cursor.present = true;
		fake.tick(now + 200);
		expect(fake.ctx().here).toBe(true);
	});
});

describe('the temper: the brain decides', () => {
	it('starts the tantrum in the same step as the poke that tipped it over', () => {
		const fake = start();
		letOut(fake);
		// This poke is the one too many, the brain says so.
		fake.signals.push('evil');
		fake.cat.send({ type: 'POKE', now: 2000 });
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);
		// The poke is answered as a cat in a tantrum answers one, and the tantrum says what it is.
		expect(fake.lines).toContain('pokeEvil');
		expect(fake.lines).toContain('evil');
	});

	it("brings a mood's chat forward while it is off on a trip, on the frame it hears it", () => {
		const fake = start();
		const now = letOut(fake);
		// It chats, and the next one is eight seconds off.
		fake.tick(now + 8000);
		expect(fake.ctx().nextChat).toBe(now + 16_000);
		fake.next.push('explore');
		fake.tick(now + 9000);
		expect(fake.body.getSnapshot().matches({ body: { free: { trip: 'announce' } } })).toBe(true);
		expect(fake.ctx().nextChat).toBe(now + 16_000);

		fake.tick(now + 9100, { eager: true });
		expect(fake.ctx().nextChat).toBe(now + 10_100);
	});
});

describe('the temper: the brain tells the body itself', () => {
	/** Whether the brain is in a tantrum, as it tells the world: its mood. */
	function inTantrum(fake: Fake) {
		return fake.cat.brain.mood({ napping: false, gold: false }) === 'evil';
	}

	/** A frame as the component runs it: the brain's own tick, then the frame it sends. */
	function frame(fake: Fake, now: number) {
		for (const signal of fake.cat.brain.tick(0.25, SENSES)) if (signal === 'warn') warn(fake.cat);
		fake.tick(now);
	}

	/** The brain's own road to a warning: out of the grace, shaken until it warns, and its hold. */
	function warned(fake: Fake, now: number) {
		fake.clock.increment(61_000);
		now += 61_000;
		frame(fake, now);
		for (let i = 0; i < 4; i++) {
			happened(fake.cat, 'shaken');
			now += 50;
			frame(fake, now);
		}
		expect(fake.cat.brain.meters.temper).toBeGreaterThanOrEqual(WARN_AT);
		// The line itself is only flavour: what matters is that the warning has had time to be read.
		fake.cat.brain.warningHeard();
		fake.clock.increment(2600);
		return now + 2600;
	}

	/** A few more shakes, until the brain's meters boil over: the brain's own tantrum, not a fake one. */
	function boilOver(fake: Fake, now: number) {
		for (let i = 0; i < 3 && !fake.body.getSnapshot().hasTag('evil'); i++) {
			happened(fake.cat, 'shaken');
			now += 200;
			frame(fake, now);
		}
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);
		expect(inTantrum(fake)).toBe(true);
	}

	it('hears the calm that time away brings, though Tabbyfin drops what the brain returns', () => {
		const fake = start(undefined, true);
		const now = warned(fake, letOut(fake));
		boilOver(fake, now);
		const said = fake.lines.length;

		// The tab is away for longer than a tantrum survives: Tabbyfin tells the brain and throws the
		// answer away, and the body hears it anyway.
		fake.cat.brain.away(25);
		expect(inTantrum(fake)).toBe(false);
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(false);
		expect(fake.lines.slice(said)).toContain('calmTime');
	});

	it('answers the poke that earns the warning before it warns', () => {
		const fake = start(undefined, true);
		let now = letOut(fake);
		fake.clock.increment(61_000);
		now += 61_000;
		frame(fake, now);
		fake.cat.brain.meters.temper = WARN_AT - 1;
		const said = fake.lines.length;
		fake.body.send({ type: 'POKE', now: now + 50 });
		const after = fake.lines.slice(said);
		expect(after).toContain('warn');
		const answer = after.findIndex((l) => l.startsWith('poke'));
		expect(answer).toBeGreaterThanOrEqual(0);
		expect(answer).toBeLessThan(after.indexOf('warn'));
	});

	it('starts the tantrum a gold reset tips it into, with the reset line still up', () => {
		const fake = start(undefined, true);
		warned(fake, letOut(fake));
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(false);

		// What the component does: the reset line first, then the brain is asked what the reset did.
		// Nothing waits for the line to finish, so a line taking over cannot lose the tantrum.
		fake.cat.speech.blurt('goldReset');
		happened(fake.cat, 'gold-reset');
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);
		fake.cat.speech.blurt('grabbed');
		expect(fake.body.getSnapshot().hasTag('evil')).toBe(true);
		expect(fake.lines).toContain('evil');
	});
});
