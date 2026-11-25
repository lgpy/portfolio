/**
 * The jelly cat, as one statechart: what its body is doing, and what temper it is in. The frame
 * loop keeps the physics, the pointer handlers keep their maths, and both tell this machine what
 * happened (TICK, GRAB, POKE, CURSOR_LEFT...). The machine then decides what the cat is up to,
 * says the things that go with it, and the frame loop asks `swim()` where that state should be
 * heading.
 *
 * The machine is built once, here at module scope. The cat it drives and the mischief kit it uses
 * come in as the actor's input and are kept in `context.io`, so an action reaches them the same way
 * a guard does, and nothing is closed over.
 *
 * Guards only ever read what they were told. A TICK carries the whole frame (where the cat is,
 * where the cursor is, whether a line is up), and the other events carry what just changed; guards
 * read those, the rest of the context, their params and `stateIn`. Nothing here looks at the page
 * or at the brain: what the machine needs to know arrives on an event, and what it wants to happen
 * is done by an action.
 *
 *   body
 *     held                       in your hand
 *     free
 *       company                  keeping the cursor company: chats, picks pastimes, starts the tour
 *       seek                     swimming over to the cursor
 *       trip                     announce -> go -> swimming -> there -> afterTrip
 *       tidy                     putting back what a tantrum took down, a piece at a time
 *       tour                     announcing -> visiting (a stop at a time) -> done
 *       asleep                   a nap, waking on a poke, the cursor or the tab coming back
 *       edge                     where the cursor left: waiting, ramming, sulking, then a pastime
 *         ramming                the run at the edge, a phase at a time:
 *           pause                a moment to turn around first
 *           backup               lining up well short of the wall
 *           charge               flying at it head first
 *           recoil               bounced back off it
 *       afterTrip                a trip just ended: back to the cursor, or somewhere new
 *     homing                     Escape: swim back to its tile, then home
 *     home                       it's in the tile: the one way in for a drop and for Escape
 *
 *   temper
 *     calm                       no tantrum: the brain decides when one starts (EVIL)
 *     evil
 *       pace                     the first act a few seconds off, then the gap between acts
 *       acts
 *         waiting                between acts, until the pace says the next one is due
 *         busy                   the body is busy: in the hand, in the air, asleep or talking
 *         ready                  the next frame picks something, unless the body is busy: then wait
 *         picking                the brain picks the next bit of mischief from what is possible
 *         announcing             says what it is about to do, if it has a word at all
 *         doing                  the acts: pick sends it to one of these
 *           pick                 the cursor is stolen on the spot, everything else swims
 *           swim                 swim to the bit of the page, giving up if the swim is lost
 *           threatening          the bunny, threatened and then relented
 *           wreck                the page, a piece at a time until nothing stands: visit -> swimming -> knocked
 *           stealCursor          the cursor makeover, taken at once
 *
 *   tab
 *     here                       the page is in front of you
 *     away                       the tab is in the background: nothing is measured while it is
 *
 *   frame
 *     tick                       the frame's own bookkeeping, whatever the body is at: whether the
 *                                cursor is on the page, and a mood's chat brought forward
 *
 * The states the outside code needs to know about carry `tags`: `modeOf`, `whereOf`, `backingUp`,
 * `ramming`, `charging` and `actOf` read them, so nothing else lists the states out twice.
 *
 * The machine owns what the cat is doing: where it is swimming (`spot`), when it got there
 * (`arrived`), when it may chat and choose again, the state of its run at the edge, and what the
 * page still has out of place. They are written here, by `assign`, and the frame loop and `swim()`
 * read them from the snapshot. The kit is the one that knows the page; every action that changes
 * it writes the answer into `damage` here, so the guards only ever read what they were told.
 *
 * The brain's temper arrives as `EVIL` and `CALM`. The component listens to the brain, so wherever
 * the brain was asked (its own tick, a poke, the time away in another tab) the body hears it, and
 * nothing here forwards a signal on.
 *
 * Timers belong to the state they were started in, so leaving a state early (a grab, a poke, a
 * send home, a tantrum ending) cancels whatever it was waiting on. That is what `generation`,
 * `departing`, `actToken`, `after` and the ram's `until` used to do; states do it now.
 */
import {
	and,
	assertEvent,
	assign,
	createActor,
	enqueueActions,
	not,
	raise,
	setup,
	stateIn,
	type AnyActorRef,
	type SimulatedClock
} from 'xstate';
import type { Cat, Mode, Spot } from './context';
import type { Moment } from './lines';
import type { EvilAct, Mood, Pastime, Senses } from './brain';
import type { ElementAct, Mischief } from './behaviours/evil';
import type { Side } from './behaviours/pointer';
import { happened, warn } from './being';
import * as ram from './behaviours/ram';
import { nextSpot } from './behaviours/explore';
import { errandSpot } from './behaviours/hone';
import { arrive, chat, type Where } from './behaviours/roam';
import { ANNOUNCE, DELAY, DWELL, NOT_NOW, STOPS_TOTAL, goTo, markToured, planTour } from './behaviours/tour';

/** How close the cursor has to be to count as company, and how far before it misses you. */
const NEAR = 160;
const FAR = 240;
/** How close a cursor has to come to wake a sleeping cat. */
const WAKE_NEAR = 220;
/** How long a sulk at the edge lasts after the last charge. */
const SULK = 6000;
/** How often the swim to an act is checked for still getting anywhere. */
const LOST = 5000;

/** The tantrum: the first bit of mischief once the mood has landed, then the gap between acts. */
const ACT_FIRST = 3000;
const ACT_MIN = 10_000;
const ACT_MAX = 15_000;
/** Between announcing an act and doing it, so the line gets a moment first. */
const ACT_DELAY = 1200;
/** How long the bunny stands threatened before it relents. */
const RELENT = 2600;
/** Between one piece of a wreck coming down and the swim to the next. */
const WRECK_BEAT = 700;
/** Between putting one piece back and swimming to the next. */
const TIDY_BEAT = 900;

/** What the frame loop and the pointer handlers report: one frame, and what happened to the cat. */
export type Frame = {
	now: number;
	/** Where the cat is. */
	x: number;
	y: number;
	/** How far the cursor is from it. */
	dc: number;
	/** Where the cursor is, and whether it is on the page at all. */
	cursor: { x: number; y: number; present: boolean };
	/** Where the cursor left the window. */
	left: { at: number };
	/** It is in the air after a throw. */
	flying: boolean;
	/** Being petted, and whether the page is set to reduce motion. */
	petting: boolean;
	still: boolean;
	/** A mood's chat is waiting and may queue behind a line. */
	eager: boolean;
	/** A line is up, and whether it is still being typed out. */
	line: boolean;
	talking: boolean;
	/** Cross with you: it neither follows the cursor nor waits where it left. */
	cross: boolean;
	mood: Mood;
	/** How far its tile is, and, while it backs up, how far its run-up point is. */
	toTile: number;
	toRunUp: number;
	senses: Senses;
};

export type BodyEvent =
	/** The frame, as the frame loop saw it. */
	| ({ type: 'TICK' } & Frame)
	| { type: 'GRAB' }
	| { type: 'RELEASE'; now: number }
	| { type: 'POKE'; now: number }
	| { type: 'ESCAPE' }
	/** The cursor left the window: through which edge, and whether that edge may lead to another screen. */
	| { type: 'CURSOR_LEFT'; edge: Side; sideways: boolean; extended: boolean; cross: boolean }
	/** The cursor came back: whether it was gone long enough to be missed, how far away it is, and how it went. */
	| { type: 'CURSOR_BACK'; slow: boolean; dc: number; sideways: boolean; cross: boolean }
	/** The cursor moved: how near it is now, for a sleeping cat to stir. */
	| { type: 'CURSOR_NEAR'; now: number; dc: number }
	/** The cursor moved after a long time still. */
	| { type: 'STIRRED'; now: number }
	/** The cursor flailed about: noticed, while it keeps you company. */
	| { type: 'FLAIL' }
	/** The tab went to the background, and came back. */
	| { type: 'TAB_AWAY' }
	| { type: 'TAB_BACK'; missed: boolean }
	/** A tantrum started: friendly work is off. Mid-tour, the machine says so instead. */
	| { type: 'EVIL' }
	/** The brain has calmed down: the tantrum is over, and it says why. */
	| { type: 'CALM' }
	/** The tantrum is over: what it took down is the body's to put back now. */
	| { type: 'TIDY' }
	/** Evil's mischief: go and do something to that bit of the page. */
	| { type: 'VISIT'; spot: Spot }
	/** The spot's act: the cat has arrived, so the page can be touched. */
	| { type: 'MISCHIEF_ARRIVED' }
	/** The thing it went for is gone (scrolled away, say): the act is off. */
	| { type: 'MISCHIEF_MISSED' }
	/** It splatted into the edge mid-charge. */
	| { type: 'RAM_HIT'; now: number }
	/** The cursor let go of it over its tile: home, or a bounce off it while evil. */
	| { type: 'DROP_HOME'; now: number }
	/** The tour has run out of stops: raise it from `stop` to say how it ends. */
	| { type: 'END' };

/** What the machine is given when it starts: the cat it drives, the mischief kit, and the tour plan. */
export type CatInput = {
	cat: Cat;
	mischief: Mischief;
	/** Whether this let-out gets a tour. */
	plan?: () => { again: boolean } | undefined;
};

type Ctx = {
	/** The cat this machine drives, and the page side of its tantrums. */
	io: { cat: Cat; kit: Mischief };
	/** Where it is swimming and what it says there: the machine's to set, never the cat's. */
	spot?: Spot;
	/** When it reached the spot, or 0 until it has. */
	arrived: number;
	/** When it may next chat, and next go looking for something to do. */
	nextChat: number;
	nextChoose: number;
	/** The run at the edge: whether the edge is worth following, how many charges, and when it gave up. */
	ram: { on: boolean; count: number; gaveUp: number };
	/** Whether the cursor was on the page when the machine last heard: the decisions between frames need it. */
	here: boolean;
	/** When the cursor last woke it: the stir that comes with that same move is not worth a word. */
	wokeAt: number;
	/** How far the swim to an act still had to go at the last check, and when the next look is due. */
	lostDist: number;
	lostAt: number;
	/** A tour still to come this let-out: when it may start. */
	tour?: { at: number };
	/** Whether the tour to come is one offered again. */
	tourAgain: boolean;
	/** The stop the tour is on, and the last one it reached, for whether the end needs saying. */
	stop: number;
	said: number;
	/** The pastime just chosen, while the choosing state decides where that takes it. */
	choice?: Pastime;
	/** What the last chat asked for, while the body sees whether it needs a moment. */
	act?: 'cursor' | 'trick';
	/** Where an announced trip is going: picked when it says so, applied when it sets off. */
	next?: Spot;
	/** A grab took it off the tour: it says so once it is put down. */
	skipTour: boolean;
	/** The bit of mischief the brain just picked, for the act states to hand on. */
	mischief?: EvilAct;
	/** What the page still has out of place from a tantrum, and whether anything is left standing. */
	damage: { left: boolean; standing: boolean };
	/** Pieces it has put back in this tidy. */
	tidied: number;
};

/** What a state is, for the code that only needs to know what the cat is at. */
type Tag =
	| 'held'
	| 'homing'
	| 'home'
	| 'asleep'
	| 'seek'
	| 'trip'
	| 'edge'
	/** The run at the edge, whichever phase of it. */
	| 'ramming'
	| 'backingUp'
	| 'charging'
	| 'sulking'
	| 'evil'
	/** It picked a bit of mischief and is saying or doing it. */
	| 'mischief';

/** What a let-out gets a tour from, what it ticks by, and the page side of a tantrum. */
export type BodyOptions = {
	plan?: () => { again: boolean } | undefined;
	clock?: SimulatedClock;
	/** The mischief kit: the machine decides when each bit of it runs. */
	mischief: Mischief;
};

/** The one line the cat says at a moment, in the mood and bond it is in now. */
function line(cat: Cat, moment: Moment): string {
	return cat.script.next(moment, cat.mood(), cat.bond());
}

/** Say a line that waits its turn. */
function talk(cat: Cat, moment: Moment) {
	cat.speech.talk(line(cat, moment));
}

/** Say a line over the top of whatever else is being said, held so a poke can't swallow it. */
function blurt(cat: Cat, moment: Moment, hold = 0) {
	cat.speech.blurt(line(cat, moment), undefined, 0, undefined, hold);
}

/** A run at the edge that has not started: it hasn't been left at one. */
function idleRam() {
	// Never gave up: not "gave up at time 0", which a page younger than the sulk would take as just now.
	return { on: false, count: 0, gaveUp: -Infinity };
}

/** How far the cat still is from a spot, from the frame that says where it is. */
function toSpot(spot: Spot | undefined, frame: Frame): number {
	return spot ? Math.hypot(spot.x - frame.x, spot.y - frame.y) : Infinity;
}

/** The frame a guard or an action is looking at: only a TICK reaches the ones that ask for it. */
function frame(event: BodyEvent): Frame {
	assertEvent(event, 'TICK');
	return event;
}

/** When an event with a time on it happened. */
function when(event: BodyEvent): number {
	// Only the events that carry a time are read for one: the rest have nothing to hide behind 0.
	assertEvent(event, ['TICK', 'POKE', 'CURSOR_NEAR', 'STIRRED', 'RELEASE', 'RAM_HIT', 'DROP_HOME']);
	return event.now;
}

/** Cross with you, as the frame or the cursor's own event says. */
function crossed(event: BodyEvent): boolean {
	return 'cross' in event ? event.cross : false;
}

/** Home, or on its way there: nothing of the page is still its business, so the page goes back. */
function settle(io: Ctx['io']): Partial<Ctx> {
	io.cat.flying = false;
	io.cat.brain.rest();
	// Escape, a drop on the tile and the end of it all put back everything at once: the tantrum's
	// damage and the boredom mess alike.
	io.kit.restore();
	return { spot: undefined, arrived: 0, ram: idleRam(), damage: { left: false, standing: false } };
}

/** The acts that go and do something to a bit of the page, as opposed to the ones done where it is. */
function isElementAct(act: EvilAct | undefined): act is ElementAct {
	return act === 'wreck' || act === 'vandal' || act === 'bunny';
}

/**
 * Whether the tantrum has it, asked from inside an action. The temper state is the one place that
 * knows; `check(stateIn(...))` cannot keep its state type in an `extend`ed action map (see the note
 * on the split below), so the state is read from the actor, which is the same thing one step later.
 */
function inTantrum(self: AnyActorRef): boolean {
	return self.getSnapshot().hasTag('evil');
}

/**
 * The line that says what each bit of mischief is about to do. The bunny says nothing until it is
 * there, and a wreck says nothing at all until the piece is down.
 */
const ANNOUNCE_LINE: Record<EvilAct, Moment | undefined> = {
	wreck: undefined,
	vandal: 'evilVandal',
	stealCursor: 'stealCursor',
	bunny: undefined
};

/** Where the machine starts: what it was handed, and the tour planned for this let-out. */
function initialState(input: CatInput): Ctx {
	const planned = (input.plan ?? planTour)();
	return {
		io: { cat: input.cat, kit: input.mischief },
		spot: undefined,
		arrived: 0,
		nextChat: 0,
		nextChoose: 0,
		ram: idleRam(),
		here: true,
		wokeAt: -Infinity,
		lostDist: Infinity,
		lostAt: 0,
		tour: planned ? { at: performance.now() + DELAY } : undefined,
		tourAgain: planned?.again ?? false,
		stop: 0,
		said: -1,
		skipTour: false,
		damage: { left: false, standing: false },
		tidied: 0
	};
}

const craft = setup({
	types: {} as { context: Ctx; events: BodyEvent; input: CatInput; tags: Tag },
	delays: {
		ANNOUNCE,
		/** A trick waits for the line to land first. */
		TRICK: 700,
		/** After arriving, the thing to do there. */
		ACT: 900,
		/** How long it lingers where it has nothing to do, and where it has. */
		SETTLED: 4000,
		DONE: 7000,
		/** Sleep-talk, once soon after falling asleep, then now and then. */
		SLEEP_FIRST: 4000,
		SLEEP_MORE: () => 15_000 + Math.random() * 5000,
		/** The tantrum: its first act, and the gap between the rest. */
		ACT_FIRST,
		GAP: () => ACT_MIN + Math.random() * (ACT_MAX - ACT_MIN),
		/** Between announcing a bit of mischief and doing it. */
		ACT_DELAY,
		/** Between one piece of a wreck coming down and the next, and between tidies. */
		WRECK_BEAT,
		TIDY_BEAT,
		RELENT,
		/** A tantrum act found the body busy: try again in a moment. */
		BUSY: 1000,
		/** The edge: the moment it takes to turn around, and the bounce off the wall. */
		PAUSE: ram.PAUSE,
		RECOIL: ram.RECOIL
	},
	guards: {
		// Everything below decides from the frame or from what the machine itself holds. Nothing
		// reads the page, the DOM or the brain: if a guard needs to know it, it was sent.
		cross: ({ event }) => crossed(event),
		leaving: ({ event }) => !frame(event).cursor.present,
		/** The cursor is on the page, as the last thing the machine heard said. */
		cursorPresent: ({ context }) => context.here,
		/** The tab is in the background: the cat cannot swim, but the clock still runs. */
		tabAway: stateIn({ tab: 'away' }),
		/** The tab was away long enough to be missed. */
		tabMissed: ({ event }) => {
			assertEvent(event, 'TAB_BACK');
			return event.missed;
		},
		far: ({ event }) => {
			const f = frame(event);
			return !f.cross && f.dc > FAR;
		},
		near: ({ event }) => {
			const f = frame(event);
			return !f.cross && f.dc < NEAR;
		},
		/** The cursor is close enough for a sleeping cat to notice it. */
		atItsSide: ({ event }) => {
			assertEvent(event, 'CURSOR_NEAR');
			return event.dc < WAKE_NEAR;
		},
		/** The swim to an act got somewhere since the last check: slow, not lost. */
		gettingThere: ({ context, event }) => toSpot(context.spot, frame(event)) < context.lostDist - 30,
		/** Nothing measured yet: the first frame only starts the clock. */
		measuring: ({ context }) => context.lostAt > 0,
		/** The next look at a slow swim is due. */
		lostDue: ({ context, event }) => frame(event).now >= context.lostAt,
		/** It reached its spot this frame. */
		arrived: ({ context, event }) => {
			const f = frame(event);
			return !!context.spot && toSpot(context.spot, f) < 40 && !context.arrived && !f.flying;
		},
		hasSpot: ({ context }) => !!context.spot,
		/** There is something to do where it is: an act, or a bit of mischief to report. */
		hasAct: ({ context }) => !!context.spot?.act || !!context.spot?.mischief,
		noAct: ({ context }) => !context.spot?.act && !context.spot?.mischief,
		/** The spot is the tantrum's: arriving there is the act, not something to do when there. */
		mischiefHere: ({ context }) => !!context.spot?.mischief,
		/** It is keeping you company with nothing else on: a tour may start. */
		tourDue: ({ context, event }) => {
			const f = frame(event);
			return (
				!!context.tour &&
				f.now >= context.tour.at &&
				!NOT_NOW.includes(f.mood) &&
				f.cursor.present &&
				!f.line &&
				!f.flying &&
				!f.petting
			);
		},
		chatDue: ({ context, event }) => {
			const f = frame(event);
			return f.now > context.nextChat && (!f.line || f.eager) && !f.flying && !f.petting;
		},
		/** A mood's chat is waiting: bring the next one forward. */
		chooseDue: ({ context, event }) => {
			const f = frame(event);
			// Not in the air, and nothing new while the page still needs putting back: the tidy
			// comes first, even if it has to wait for the temper to cool.
			return !f.petting && !f.flying && !context.damage.left && f.now > context.nextChoose;
		},
		/** Ramming needs somewhere to go and motion to see. */
		canRam: ({ context, event }) => {
			const f = frame(event);
			return !f.flying && !f.still && context.ram.on && context.ram.count < ram.RAMS;
		},
		/** It is lined up far enough back to start a charge. */
		linedUp: ({ event }) => frame(event).toRunUp < ram.LINED_UP,
		/** It gave up against the edge a moment ago, and is sulking there. */
		gaveUpRecently: ({ context, event }) => {
			const f = frame(event);
			return !f.flying && context.ram.on && f.now - context.ram.gaveUp < SULK;
		},
		/** Left at the edge long enough (or too cross to care): do something else. */
		edgeTired: ({ context, event }) => {
			const f = frame(event);
			return !f.flying && (f.now - f.left.at > ram.EDGE_WAIT || f.cross);
		},
		lingered: ({ context, event }) => {
			const f = frame(event);
			return !!context.arrived && f.now - context.arrived > DWELL && !f.line;
		},
		atTile: ({ event }) => {
			const f = frame(event);
			return !f.flying && f.toTile < 30;
		},
		/** Not in the air, and not talking. */
		bodyIdle: ({ event }) => {
			const f = frame(event);
			return !f.flying && !f.talking;
		},
		/** Gone long enough that coming back is worth a word. */
		backSlow: ({ event }) => {
			assertEvent(event, 'CURSOR_BACK');
			return event.slow || event.dc > FAR;
		},
		/** The move that woke it is the same one that stirred it: the wake has its own line already. */
		justWoke: ({ context, event }) => when(event) === context.wokeAt,
		/** A drop on the tile lands in the middle of a tantrum: it bounces off instead. */
		prowling: stateIn({ temper: 'evil' }),
		/** That edge may lead to another screen, so it is worth following. */
		follows: ({ event }) => {
			assertEvent(event, 'CURSOR_LEFT');
			return event.sideways && event.extended;
		},
		/** The bit of mischief the brain picked just now. */
		picked: ({ context }, params: { act: EvilAct }) => context.mischief === params.act,
		/** The brain came back with something to do at all. */
		hasPick: ({ context }) => !!context.mischief,
		/** The page still has something a tantrum left out of place. */
		damaged: ({ context }) => context.damage.left,
		/** It has something to put back, is calm, and is not in the air or being petted. */
		tidyDue: ({ context, event }) => {
			const f = frame(event);
			return context.damage.left && !f.cross && !f.flying && !f.petting;
		},
		/** There is nothing left standing to take down. */
		rampageOver: ({ context }) => !context.damage.standing
	}
	// The actions get their own step: with the guards and actions in one setup, the parameterised
	// guards (`picked`) lose their params type and the action map no longer type-checks.
}).extend({
	actions: {
		/** A frame said where the cursor was, or an event said it came or went. */
		cursorGone: assign({ here: false }),
		cursorHere: assign({ here: true }),
		/** The frame is the one that is true: the cursor is where it says, whatever an event said. */
		syncCursor: assign({ here: ({ event }) => frame(event).cursor.present }),
		/** A mood is waiting to be heard: bring the next chat forward, but not back once it is due. */
		pullChat: enqueueActions(({ context, enqueue, event }) => {
			const f = frame(event);
			if (f.eager) enqueue.assign({ nextChat: Math.min(context.nextChat, f.now + 1000) });
		}),
		/** Off to an act: nothing measured yet, and the clock starts on the next frame. */
		freshDistance: assign({ lostDist: Infinity, lostAt: 0 }),
		/** The first frame of a swim: the next five seconds are its first look. */
		startClock: assign({ lostAt: ({ event }) => frame(event).now + LOST }),
		/** It is still getting somewhere: note how far it has left, and when to look again. */
		noteDistance: enqueueActions(({ context, enqueue, event }) => {
			enqueue.assign({ lostDist: toSpot(context.spot, frame(event)), lostAt: frame(event).now + LOST });
		}),
		/** A tantrum line about what it is about to do. */
		blurtLine: ({ context: { io } }, params: { moment: Moment; hold?: number }) =>
			blurt(io.cat, params.moment, params.hold),
		/** Let go of wherever it was going. */
		letGo: assign({ spot: undefined, arrived: 0 }),
		/** Somewhere new to go, now that the last place is done with. */
		anotherSpot: enqueueActions(({ context, enqueue, self }) => {
			const { cat } = context.io;
			enqueue.assign({ spot: nextSpot(cat, inTantrum(self)), arrived: 0 });
		}),
		/** It is there: says what there is to say, and notes when it got there. */
		reachSpot: enqueueActions(({ context, enqueue, event }) => {
			const now = frame(event).now;
			enqueue.assign({ arrived: arrive(context.io.cat, context.spot, now) });
		}),
		/** The thing to do at the spot, and what to say about it. A fiddle's oops comes after it moved. */
		fireAct: enqueueActions(({ context }) => {
			const { cat } = context.io;
			const spot = context.spot;
			spot?.act?.();
			if (spot?.key !== 'fiddle') return;
			talk(cat, 'oops');
			happened(cat, 'fiddled');
		}),
		/** A poke: the brain counts it, it starts, and maybe that was one too many. */
		poke: ({ context, self }) => {
			const { cat } = context.io;
			// The brain counts pokes; ask it after the event whether this is one too many. Poking
			// a cat that is already evil only gets you its list.
			const out = cat.brain.on('poked');
			cat.trick();
			// This poke may have been the one too many, so the tantrum's line is the one to say.
			const moment = inTantrum(self) || out.includes('evil') ? 'pokeEvil' : cat.brain.pokeSpam ? 'pokeSpam' : 'poke';
			cat.speech.blurt(line(cat, moment));
			// The answer to the poke first, then the warning it earned.
			if (out.includes('warn')) warn(cat);
		},
		/** A nap: it curls up and says so. */
		nap: ({ context: { io } }) => {
			io.cat.feel('sleep', 1000);
			talk(io.cat, 'nap');
		},
		sleepTalk: ({ context: { io } }) => io.cat.speech.talk(io.cat.script.next('chat', 'sleepy', io.cat.bond())),
		/**
		 * Woken by the cursor coming near, or by a poke, which is its own kind of hello: it says so
		 * straight away, over any sleepy mumble, and a poke is still counted.
		 */
		wake: enqueueActions(({ context, enqueue, event }, params: { poked?: boolean }) => {
			const { cat } = context.io;
			const now = when(event);
			enqueue.assign({ nextChoose: now + 5000, wokeAt: now });
			cat.feel('surprised', 900);
			cat.speech.blurt(line(cat, params.poked ? 'wakePoked' : 'wake'));
			if (params.poked) happened(cat, 'poked');
		}),
		/** A line, and what the line asked for, so a trick can still have its moment. */
		smallTalk: enqueueActions(({ context, enqueue, event }) => {
			const f = frame(event);
			const said = chat(context.io.cat, f.now, f.still);
			enqueue.assign({ act: said.act, nextChat: said.nextChat });
		}),
		trick: ({ context: { io } }) => io.cat.trick(),
		/**
		 * The brain picks the next pastime from what it senses. At the edge it can take its time:
		 * no new pace, just the pick.
		 */
		pickPastime: enqueueActions(({ context: { io }, enqueue, event }, params: { pace: boolean }) => {
			assertEvent(event, 'TICK');
			if (params.pace) enqueue.assign({ nextChoose: event.now + 1000 });
			const choice = io.cat.brain.choose(event.senses);
			// The pastime the brain picked, for the debug panel.
			if (choice) io.cat.probe.pastime = choice;
			enqueue.assign({ choice: () => choice });
		}),
		/**
		 * Say where it is going, and pick the place it will go to when it sets off. A fiddle sets
		 * off without a word: the oops comes once the thing has moved.
		 */
		announceTrip: enqueueActions(({ context, enqueue, self }) => {
			const { cat } = context.io;
			if (context.choice === 'hone') {
				enqueue.assign({ next: undefined });
				talk(cat, 'errand');
			} else if (context.choice !== 'fiddle') {
				enqueue.assign({ next: nextSpot(cat, inTantrum(self)) });
				talk(cat, 'bored');
			}
		}),
		/** The go: a trip always has somewhere to be, even if the bunny has been scrolled away. */
		depart: enqueueActions(({ context, enqueue, self }) => {
			const { cat, kit } = context.io;
			const spot =
				context.choice === 'fiddle'
					? kit.fiddleSpot()
					: (context.next ?? errandSpot(cat) ?? nextSpot(cat, inTantrum(self)));
			enqueue.assign({ spot, arrived: 0 });
		}),
		lonely: ({ context: { io } }) => io.cat.speech.talk(line(io.cat, 'lonely'), 'lonely', 6000),
		found: enqueueActions(({ context, enqueue, event }) => {
			context.io.cat.speech.talk(line(context.io.cat, 'found'), 'found', 8000);
			enqueue.assign({ nextChat: when(event) + 5000 });
		}),
		/** The tour sets off: it is given once per browser, finished or not. */
		toured: ({ context: { io, tourAgain } }) => {
			markToured();
			talk(io.cat, tourAgain ? 'tourAgain' : 'tourStart');
		},
		/** A stop: park the cat at the next place on the page that is worth seeing. */
		stop: enqueueActions(({ context, enqueue }) => {
			const { at, spot } = goTo(context.io.cat, context.stop);
			if (at < 0) enqueue.raise({ type: 'END' });
			else enqueue.assign({ stop: at, said: at, spot, arrived: 0 });
		}),
		nextStop: assign({ stop: ({ context }) => context.stop + 1 }),
		/** If the last stop was off screen, it still says the tour is over. */
		tourEnd: ({ context }) => {
			if (context.said !== STOPS_TOTAL - 1) talk(context.io.cat, 'tourEnd');
		},
		/** A grab took it off the tour: it says so once it is put down, behind the word about the ride. */
		skipLater: assign({ skipTour: true }),
		skipNow: enqueueActions(({ context, enqueue }) => {
			if (context.here) talk(context.io.cat, 'tourSkip');
			enqueue.assign({ skipTour: false });
		}),
		/** Out of your hand (let go, bounced off the tile, sent home): the word about the tour it was taken off. */
		released: enqueueActions(({ context, enqueue }) => {
			if (context.skipTour && context.here) talk(context.io.cat, 'tourSkip');
			enqueue.assign({ skipTour: false });
		}),
		/** Let go: the landing line comes first, so any catching-up chatter waits behind it. */
		restChat: assign({ nextChat: ({ event }) => when(event) + 6000 }),
		/**
		 * A poke while it waits at the bunny for its turn: the hone is off. Other spots' acts (finding the
		 * bunny game, mischief, which cancels itself) still happen, as they always did.
		 */
		dropAct: assign({
			spot: ({ context }) => (context.spot?.key === 'errand' ? { ...context.spot, act: undefined } : context.spot)
		}),
		/** At the end of a tour with nobody there, and on a leave with no edge to follow: no run at all. */
		noRam: assign({ ram: () => idleRam() }),
		/** Escape: let go of everything and go home. */
		homeward: enqueueActions(({ context, enqueue }) => {
			enqueue.assign(settle(context.io));
			context.io.cat.feel('surprised', 800);
		}),
		/** Home: nothing of the page is its business any more, before the tile takes over. */
		settleHome: enqueueActions(({ context, enqueue }) => {
			enqueue.assign(settle(context.io));
		}),
		/** The tile has it now. */
		home: ({ context: { io } }) => io.cat.onhome(),
		/** Evil took it off the tour: the rest of this let-out's tour is off too. */
		forgetTour: assign({ tour: undefined }),
		/** Evil's mischief: that is where it is going, as soon as it is there. */
		takeSpot: enqueueActions(({ enqueue, event }) => {
			assertEvent(event, 'VISIT');
			enqueue.assign({ spot: event.spot, arrived: 0 });
		}),
		/** The mood lands, then the tantrum says what it is: mid-tour, the tour is what it leaves with. */
		beginEvil: ({ context: { io } }, params: { moment: 'evil' | 'tourEvil' }) => {
			io.cat.feel('surprised', 1200);
			blurt(io.cat, params.moment, 1800);
		},
		/** Calmed down: the cursor makeover was only borrowed. */
		handBack: ({ context: { io } }) => io.kit.giveBack(true),
		/** Sent home with the grudge: the makeover stays stolen. */
		keepStolen: ({ context: { io } }) => io.kit.giveBack(false),
		/** Calmed down: clear the deck and say why it stopped. What it took down is the tidy's. */
		calmDown: ({ context: { io } }) => {
			const { cat } = io;
			cat.speech.cut();
			blurt(cat, cat.brain.calmedBy === 'petted' ? 'calmPetted' : 'calmTime', 1500);
		},
		/** Escape while evil: the tantrum ends here, and the grudge is said on the way home. */
		grudge: ({ context: { io } }) => {
			const { cat } = io;
			cat.brain.stopEvil('time');
			cat.speech.cut();
			blurt(cat, 'evilHome');
		},
		/** Every bit of the page the tantrum touched goes back at once, before the grudge is said. */
		restorePage: ({ context: { io } }) => io.kit.restore(),
		/** The brain picks the next bit of mischief from what is possible right now. */
		pickAct: enqueueActions(({ context, enqueue }) => {
			const { cat } = context.io;
			enqueue.assign({ mischief: cat.brain.evilAct(context.io.kit.possible()) });
		}),
		/** What it is about to do, if that has a line at all. */
		announce: ({ context }) => {
			const moment = context.mischief ? ANNOUNCE_LINE[context.mischief] : undefined;
			if (moment) blurt(context.io.cat, moment);
		},
		/** Off to the bit of the page: nothing to go to means the act is off, not the tantrum. */
		visit: enqueueActions(({ context, enqueue }) => {
			if (!isElementAct(context.mischief)) return;
			const spot = context.io.kit.visit(context.mischief);
			if (spot) enqueue.raise({ type: 'VISIT', spot });
			else enqueue.raise({ type: 'MISCHIEF_MISSED' });
		}),
		/** It is there: the page is touched, and what that left out of place goes in the ledger. */
		arrived: enqueueActions(({ context, enqueue }) => {
			const { kit } = context.io;
			kit.arrive();
			enqueue.assign({ damage: kit.damage() });
		}),
		/**
		 * A piece has gone over, and only now does it say so. The last one standing gets its own
		 * word: this page is its page.
		 */
		wrecked: enqueueActions(({ context, enqueue }) => {
			const { kit, cat } = context.io;
			kit.arrive();
			const damage = kit.damage();
			enqueue.assign({ damage });
			blurt(cat, damage.standing ? 'wreck' : 'wreckLast');
		}),
		stealCursor: ({ context: { io } }) => io.kit.steal(),
		/** A start: the cat was startled, so it looks it. */
		startle: ({ context: { io } }) => io.cat.feel('surprised', 900),
		/** What it has to put back next: the nearest thing on the page, or nothing at all. */
		findTidy: enqueueActions(({ context, enqueue }) => {
			const { kit, cat } = context.io;
			enqueue.assign({ spot: kit.nextTidy(cat), arrived: 0, damage: kit.damage() });
		}),
		/** At the piece: it rises back into place, and the cat says something about it now and then. */
		tidyPut: enqueueActions(({ context, enqueue }) => {
			const { kit, cat } = context.io;
			if (!kit.tidyUp()) return;
			// The first one always gets a word, so a tidy is never silent.
			if (context.tidied === 0 || Math.random() < 0.45) talk(cat, 'tidy');
			enqueue.assign({ tidied: context.tidied + 1, damage: kit.damage() });
		}),
		/** Nothing out of place is on the page: what is left goes back at once. */
		snapTidy: enqueueActions(({ context, enqueue }) => {
			const { kit } = context.io;
			const count = kit.snapBack();
			enqueue.assign({ tidied: context.tidied + count, damage: kit.damage() });
		}),
		/** The page is back: a word about it, if there was anything to put back. */
		finishTidy: enqueueActions(({ context, enqueue }) => {
			// Held, so a chat that comes along once it is free again doesn't push it out of the queue.
			if (context.tidied > 0) blurt(context.io.cat, 'tidyDone', 1800);
			enqueue.assign({ tidied: 0, spot: undefined });
		}),
		/** It splatted into the wall mid-charge: another run, or a word about giving up. */
		hitWall: enqueueActions(({ context, enqueue, event }) => {
			const now = when(event);
			const count = context.ram.count + 1;
			const gaveUp = count >= ram.RAMS ? now : context.ram.gaveUp;
			enqueue.assign({ ram: { ...context.ram, count, gaveUp } });
			blurt(context.io.cat, count >= ram.RAMS ? 'gaveUp' : 'rammed');
		}),
		/** Follow that edge: a run at it, from a pause first. */
		startRam: assign({ ram: () => ({ ...idleRam(), on: true }) }),
		/** Which way the cursor went, said after the event that says where it is waiting. */
		leftWord: ({ context: { io }, event }) => {
			assertEvent(event, 'CURSOR_LEFT');
			const moment = event.sideways
				? event.extended
					? 'sideways'
					: 'gone'
				: event.edge === 'top'
					? 'upwards'
					: 'downwards';
			io.cat.speech.blurt(line(io.cat, moment), 'left', 4000);
		},
		/** Cross, it is glad to see the back of you. */
		leftCross: ({ context: { io } }) => io.cat.speech.blurt(line(io.cat, 'leftCross'), 'left', 4000),
		/** The cursor is back after a while: glad, cross or from another screen is the mood's to say. */
		cameBack: ({ context: { io }, event }) => {
			assertEvent(event, 'CURSOR_BACK');
			// A cursor that only dipped out for a moment is not worth a word.
			if (!event.slow) return;
			const { cat } = io;
			if (!event.cross) cat.feel('happy', 1500);
			const moment = event.cross ? 'backCross' : event.sideways ? 'backSideways' : 'back';
			cat.speech.blurt(line(cat, moment), 'back', 5000);
			cat.speech.mark('found');
			cat.speech.mark('lonely');
		},
		/** The cursor moved after a long time still. */
		stirred: ({ context: { io } }) => io.cat.speech.talk(line(io.cat, 'stirred'), 'moved', 60_000),
		/** Flailing the cursor about gets noticed. */
		flailLine: ({ context: { io } }) => {
			io.cat.feel('surprised', 1000);
			io.cat.speech.talk(line(io.cat, 'dizzy'), 'flail', 10_000);
		},
		/** Lined up: a kick of the tentacles before it goes. */
		pulseNow: ({ context: { io } }) => io.cat.pulse(),
		/** Dropped on its tile while evil: it bounces off instead of going in. */
		bounceOff: ({ context: { io } }) => {
			const { cat } = io;
			const r = cat.home.getBoundingClientRect();
			const dx = cat.x - (r.left + r.width / 2) || 1;
			const dy = cat.y - (r.top + r.height / 2) || 1;
			const d = Math.hypot(dx, dy) || 1;
			cat.vx = (dx / d) * 7;
			cat.vy = (dy / d) * 5 - 2;
			cat.feel('surprised', 900);
			cat.pulse();
			// After the bounce line: anything the body says about being put down queues behind it.
			cat.speech.blurt(line(cat, 'refuseHome'));
		},
		/** A drop on the tile that really is home: resting first, then a word if it was forced. */
		shoved: enqueueActions(({ context, event }) => {
			const { cat } = context.io;
			// Resting first, so being shoved home can neither warn nor start a tantrum nobody sees.
			cat.brain.rest();
			if (when(event) - cat.boxAt < 6000) happened(cat, 'forced-home');
		})
	}
});

/**
 * The swim to a bit of the page, once for every act that has to get there: it is looked at every
 * few seconds, and given up if it is not getting anywhere. The look is part of the frame, so time
 * in another tab is never held against it: nothing is measured while the tab is away, and coming
 * back measures afresh.
 */
const swimTo = craft.createStateConfig({
	initial: 'going',
	states: {
		going: {
			on: {
				TICK: [
					{ guard: 'tabAway' },
					{ guard: not('measuring'), actions: 'startClock' },
					{ guard: not('lostDue') },
					{ guard: 'gettingThere', actions: 'noteDistance' },
					{ target: '#evil.waiting' }
				],
				TAB_AWAY: { actions: 'freshDistance' },
				TAB_BACK: { actions: 'freshDistance' }
			}
		}
	}
});

/** Where a pastime takes it: a nap to sleep, a look, an errand or a fiddle to a trip. */
const pastimeTarget = craft.createStateConfig({
	always: [
		{ guard: ({ context }) => context.choice === 'nap', target: '#body.free.asleep' },
		{
			guard: ({ context }) => context.choice === 'explore' || context.choice === 'hone' || context.choice === 'fiddle',
			target: '#body.free.trip.announce'
		}
	]
});

/** The cat's one statechart, built once. Each let-out is an actor of it, with its own cat. */
export const catMachine = craft.createMachine({
	id: 'cat',
	type: 'parallel',
	context: ({ input }) => initialState(input),
	states: {
		body: {
			id: 'body',
			initial: 'held',
			on: {
				// The brain counts pokes and warns about them in every state but a nap, which has its own.
				POKE: { actions: 'poke' },
				// A tantrum forgets the rest of this let-out's tour wherever it starts.
				EVIL: { actions: 'forgetTour' }
			},
			states: {
				held: {
					tags: 'held',
					on: {
						ESCAPE: { target: '#body.homing', actions: 'released' },
						RELEASE: { target: '#body.free.company', actions: ['released', 'restChat'] },
						// Dropped on its tile: home, unless a tantrum has it bouncing off instead.
						DROP_HOME: [
							{ guard: 'prowling', target: '#body.free.company', actions: ['bounceOff', 'released'] },
							{ target: '#body.home', actions: 'shoved' }
						]
					}
				},
				free: {
					initial: 'company',
					on: {
						GRAB: { target: '#body.held' },
						ESCAPE: { target: '#body.homing' },
						// The cursor left the window: it waits at that edge, and follows it if the edge
						// may lead to another screen. Any other leave resets the run: it is only a run
						// at the edge it was left at. Cross, it stays cross and says only that.
						CURSOR_LEFT: [
							{
								guard: 'cross',
								target: '#body.free.edge',
								actions: ['cursorGone', 'leftCross', 'noRam']
							},
							{
								guard: 'follows',
								target: '#body.free.edge',
								actions: ['cursorGone', 'startle', 'startRam', 'leftWord']
							},
							{ target: '#body.free.edge', actions: ['cursorGone', 'startle', 'noRam', 'leftWord'] }
						],
						// The cursor came back: the edge says whether it is worth swimming over to,
						// and the word about seeing it again is only for an absence worth missing.
						CURSOR_BACK: { actions: ['cursorHere', 'cameBack'] },
						// A long still cursor moving again: it noticed, unless it is in its own world,
						// or this is the very move that woke it.
						STIRRED: { guard: not('justWoke'), actions: 'stirred' },
						// Flailing the cursor about: noticed while it is keeping you company (the
						// states that are off doing something else say nothing).
						FLAIL: { actions: 'flailLine' },
						// The tantrum takes it off whatever friendly thing it was at, and the rest of
						// this let-out's tour with it; its own mischief is a body trip the temper
						// region put it on, and never sends EVIL.
						EVIL: { target: '#body.free.company', actions: ['letGo', 'forgetTour'] },
						VISIT: { target: '#body.free.trip.swimming', actions: 'takeSpot' },
						// The tantrum is over and it is calm: whatever it took down is the body's
						// business now, wherever it was.
						TIDY: { target: '#body.free.tidy', actions: 'letGo' }
					},
					states: {
						company: {
							initial: 'idle',
							on: {
								TICK: [
									{ guard: 'leaving', target: '#body.free.edge', actions: ['cursorGone', 'letGo'] },
									// Still putting the page back is what it does instead of keeping you company,
									// picking a pastime or swimming over: a grab or a poke interrupted the tidy.
									{ guard: and(['tidyDue', stateIn({ temper: 'calm' })]), target: '#body.free.tidy' },
									{ guard: 'tourDue', target: '#body.free.tour.announcing' },
									{ guard: 'far', target: '#body.free.seek', actions: 'lonely' },
									{ guard: 'chatDue', target: '.chat' },
									{ guard: 'chooseDue', target: '.choose' }
								]
							},
							states: {
								idle: {},
								// A line is a state of its own so a trick can still have its moment.
								chat: {
									entry: 'smallTalk',
									always: [{ guard: ({ context }) => context.act === 'trick', target: 'trick' }, { target: 'idle' }]
								},
								trick: { after: { TRICK: { target: 'idle', actions: 'trick' } } },
								choose: {
									entry: { type: 'pickPastime', params: { pace: true } },
									always: [...pastimeTarget.always, { target: 'idle' }]
								}
							}
						},
						seek: {
							tags: 'seek',
							on: {
								TICK: [
									{ guard: 'leaving', target: '#body.free.edge', actions: 'cursorGone' },
									{ guard: 'cross', target: '#body.free.company' },
									{ guard: 'near', target: '#body.free.company', actions: 'found' }
								],
								FLAIL: {}
							}
						},
						trip: {
							initial: 'announce',
							// Whatever took it off the trip, the place it was going is off too.
							exit: 'letGo',
							on: {
								// A poke on the way to the bunny is a no thank you to its turn there, as one
								// there is, and one during the announcement is a no thank you to the trip.
								POKE: { actions: ['poke', 'dropAct'] }
							},
							states: {
								announce: {
									entry: 'announceTrip',
									after: { ANNOUNCE: 'go' },
									on: {
										// The words don't come back with the cursor, and it starts its run
										// all the same: the trip still goes. Cross, it only says that.
										CURSOR_LEFT: [
											{ guard: 'cross', actions: ['cursorGone', 'leftCross', 'noRam'] },
											{
												guard: 'follows',
												actions: ['cursorGone', 'startle', 'startRam', 'leftWord']
											},
											{ actions: ['cursorGone', 'startle', 'noRam', 'leftWord'] }
										],
										// A poke is a no thank you too: the trip is off, just as with a grab.
										POKE: { target: '#body.free.company', actions: 'poke' }
									}
								},
								go: {
									entry: 'depart',
									always: [{ guard: 'hasSpot', target: 'swimming' }, { target: '#body.free.company' }]
								},
								swimming: {
									tags: 'trip',
									on: {
										TICK: { guard: 'arrived', target: 'there', actions: 'reachSpot' },
										FLAIL: {}
									}
								},
								there: {
									tags: 'trip',
									on: { FLAIL: {} },
									after: {
										// The thing to do there, after the line has had its moment. A mischief
										// spot has no act of its own: being there is what the tantrum waits for.
										ACT: [
											{ guard: 'mischiefHere', actions: raise({ type: 'MISCHIEF_ARRIVED' }) },
											{ guard: 'hasAct', actions: 'fireAct' }
										],
										// It lingers longer where it has something to do.
										SETTLED: { guard: 'noAct', target: '#body.free.afterTrip' },
										DONE: { guard: 'hasAct', target: '#body.free.afterTrip' }
									}
								}
							}
						},
						afterTrip: {
							always: [
								{ guard: 'cursorPresent', target: '#body.free.seek' },
								{ target: '#body.free.trip.swimming', actions: 'anotherSpot' }
							]
						},
						/**
						 * Putting back what the tantrum took down. It swims to the nearest piece still
						 * out of place on the page and the piece goes back up as it gets there, one at
						 * a time, until nothing on the page is left: anything off the page snaps back
						 * at once. Then a word about the page being back, and back to the cursor. A
						 * grab, a poke or the cursor leaving interrupts it as it would a trip, and
						 * whatever is still out of place brings it back as soon as it is free.
						 */
						tidy: {
							tags: 'trip',
							initial: 'look',
							// Whatever took it off the tidy, the place it was going is off too.
							exit: 'letGo',
							on: {
								POKE: { target: '#body.free.company', actions: 'poke' }
							},
							states: {
								look: {
									entry: 'findTidy',
									always: [
										{ guard: 'hasSpot', target: 'swimming' },
										{ guard: 'damaged', target: 'snap' },
										{ target: 'done' }
									]
								},
								swimming: {
									on: {
										TICK: { guard: 'arrived', target: 'putting' },
										FLAIL: {}
									}
								},
								putting: {
									entry: 'tidyPut',
									after: { TIDY_BEAT: 'look' }
								},
								snap: {
									entry: 'snapTidy',
									always: 'look'
								},
								done: {
									entry: 'finishTidy',
									always: [{ guard: 'cursorPresent', target: '#body.free.seek' }, { target: '#body.free.company' }]
								}
							}
						},
						tour: {
							initial: 'announcing',
							states: {
								announcing: {
									entry: ['toured', 'forgetTour'],
									after: { ANNOUNCE: 'visiting' },
									on: {
										// It is already saying where it is going: the tour keeps its 0.9s, and
										// the cursor leaving is only worth where you went. Cross, that.
										CURSOR_LEFT: [
											{ guard: 'cross', actions: ['cursorGone', 'leftCross'] },
											{ actions: ['cursorGone', 'startle', 'leftWord'] }
										]
									}
								},
								visiting: {
									tags: 'trip',
									initial: 'swimming',
									entry: 'stop',
									exit: 'letGo',
									on: {
										// A grab is a no thank you, said once it has been let go.
										GRAB: { target: '#body.held', actions: 'skipLater' },
										ESCAPE: { target: '#body.homing', actions: 'skipNow' },
										TICK: { guard: 'lingered', target: '#body.free.tour.visiting', reenter: true, actions: 'nextStop' },
										END: { target: 'done', actions: 'tourEnd' },
										FLAIL: {}
									},
									states: {
										swimming: {
											on: {
												TICK: { guard: 'arrived', target: 'there', actions: 'reachSpot' }
											}
										},
										there: { after: { ACT: { guard: 'hasAct', actions: 'fireAct' } } }
									}
								},
								done: {
									always: [
										{ guard: 'cursorPresent', target: '#body.free.seek' },
										{ target: '#body.free.edge', actions: 'noRam' }
									]
								}
							}
						},
						asleep: {
							tags: 'asleep',
							entry: 'nap',
							initial: 'settling',
							states: {
								settling: { after: { SLEEP_FIRST: 'talking' } },
								talking: { entry: 'sleepTalk', after: { SLEEP_MORE: { target: 'talking', reenter: true } } }
							},
							on: {
								POKE: [
									{
										guard: 'cursorPresent',
										target: '#body.free.seek',
										actions: { type: 'wake', params: { poked: true } }
									},
									{
										target: '#body.free.company',
										actions: { type: 'wake', params: { poked: true } }
									}
								],
								// The cursor coming near is enough: it wakes and says so.
								CURSOR_NEAR: { guard: 'atItsSide', target: '#body.free.seek', actions: { type: 'wake', params: {} } },
								// A nap doesn't follow the cursor out, and doesn't remark on it coming back.
								CURSOR_LEFT: { actions: 'cursorGone' },
								CURSOR_BACK: { actions: 'cursorHere' },
								STIRRED: {},
								FLAIL: {},
								// The tab coming back after a while is enough to wake it, with the line about the pixels.
								TAB_BACK: { guard: 'tabMissed', target: '#body.free.company' }
							}
						},
						edge: {
							tags: 'edge',
							initial: 'waiting',
							on: {
								// The cursor coming back is worth swimming over, wherever the edge got to.
								CURSOR_BACK: [
									{ guard: 'cross', target: '#body.free.company', actions: ['cursorHere', 'cameBack'] },
									{ guard: 'backSlow', target: '#body.free.seek', actions: ['cursorHere', 'cameBack'] },
									{ target: '#body.free.company', actions: ['cursorHere', 'cameBack'] }
								]
							},
							states: {
								waiting: {
									on: {
										TICK: [
											{ guard: 'canRam', target: 'ramming' },
											{ guard: 'gaveUpRecently', target: 'sulking' },
											// Something is still out of place and it is calm: it goes back to it,
											// rather than taking up the edge or a pastime.
											{ guard: and(['tidyDue', stateIn({ temper: 'calm' })]), target: '#body.free.tidy' },
											{ guard: 'edgeTired', target: 'choose' }
										]
									}
								},
								/** A run at the wall, a phase at a time. The frame loop flies it and reports the splat. */
								ramming: {
									tags: 'ramming',
									initial: 'pause',
									on: {
										RAM_HIT: { target: '.recoil', actions: 'hitWall' },
										TICK: [
											{ guard: 'gaveUpRecently', target: '#body.free.edge.sulking' },
											{ guard: not('canRam'), target: 'waiting' },
											{ guard: 'linedUp', target: '.charge' }
										]
									},
									states: {
										/** A moment to turn around before the run-up. */
										pause: { after: { PAUSE: 'backup' } },
										/** Backing off well short of the wall, lined up with where the cursor went. */
										backup: { tags: 'backingUp' },
										/** Flying at it head first: the frame loop sets the speed. */
										charge: { tags: 'charging', entry: 'pulseNow' },
										/** Bounced off it, and turning round for another go. */
										recoil: { after: { RECOIL: 'backup' } }
									}
								},
								sulking: { tags: 'sulking', on: { TICK: { guard: not('gaveUpRecently'), target: 'waiting' } } },
								choose: {
									entry: { type: 'pickPastime', params: { pace: false } },
									always: [...pastimeTarget.always, { target: '#body.free.trip.swimming', actions: 'anotherSpot' }]
								}
							}
						}
					}
				},
				homing: {
					tags: 'homing',
					entry: 'homeward',
					on: {
						TICK: { guard: 'atTile', target: '#body.home' },
						// Even on its way home it can be caught again.
						GRAB: { target: '#body.held' },
						CURSOR_LEFT: { actions: 'cursorGone' },
						// On its way home it still says you are back: it is a greeting, not a decision.
						CURSOR_BACK: { actions: ['cursorHere', 'cameBack'] }
					}
				},
				home: { tags: 'home', entry: ['settleHome', 'home'], type: 'final' }
			}
		},
		temper: {
			initial: 'calm',
			states: {
				calm: {
					// The brain is the source of truth: this is the one way in. Mid-tour, the tour is
					// the thing it leaves with, and the machine knows whether it is on it.
					on: {
						EVIL: [
							{
								guard: stateIn({ body: { free: { tour: 'visiting' } } }),
								target: 'evil',
								actions: { type: 'beginEvil', params: { moment: 'tourEvil' } }
							},
							{ target: 'evil', actions: { type: 'beginEvil', params: { moment: 'evil' } } }
						]
					}
				},
				evil: {
					id: 'tantrum',
					tags: 'evil',
					type: 'parallel',
					// The page is the cat's to tidy up itself once it has calmed down, so calming down
					// doesn't put it back: the tidy does, and so do Escape and the way home. Being in
					// this state is what `prowling` means, so there is nothing to unset.
					on: {
						// Calmed down: the cursor is handed back and it says why it stopped, and then
						// the body hears that what it took down is its to put back.
						CALM: { target: 'calm', actions: ['handBack', 'calmDown', raise({ type: 'TIDY' })] },
						// Escape: the page goes back at once, then the grudge is said before the cat
						// reaches its tile.
						ESCAPE: { target: 'calm', actions: ['keepStolen', 'restorePage', 'grudge'] }
					},
					states: {
						/**
						 * The pace of the mischief: the next act is due a while after the last one was picked,
						 * however long that one took or whatever interrupted it. The first is a few seconds
						 * off, so the mood has a moment to land.
						 */
						pace: {
							initial: 'first',
							id: 'pace',
							states: { first: { after: { ACT_FIRST: 'due' } }, running: { after: { GAP: 'due' } }, due: {} }
						},
						acts: {
							id: 'evil',
							initial: 'waiting',
							states: {
								/** Between acts, until the pace says the next one is due. */
								waiting: { always: { guard: stateIn({ temper: { evil: { pace: 'due' } } }), target: 'ready' } },
								/** It is in the hand, in the air, asleep or talking: not now. */
								busy: { after: { BUSY: 'ready' } },
								/**
								 * The next frame decides: a timer knows nothing of whether the body is in the
								 * air or mid-sentence, so it waits for a TICK to say so.
								 */
								ready: {
									// The pace starts again from this pick, in the same step, so the act is due a gap later.
									on: {
										TICK: [
											{
												// Nothing is started in the hand, on its way home, asleep, in the
												// air or mid-sentence.
												guard: and([
													'bodyIdle',
													not(stateIn({ body: 'held' })),
													not(stateIn({ body: 'homing' })),
													not(stateIn({ body: { free: 'asleep' } }))
												]),
												target: ['picking', '#pace.running']
											},
											{ target: 'busy' }
										]
									}
								},
								picking: {
									entry: 'pickAct',
									always: [{ guard: 'hasPick', target: 'announcing' }, { target: 'waiting' }]
								},
								announcing: {
									tags: 'mischief',
									entry: 'announce',
									// A grab or a poke is a no thank you: the act is off, and its words with it.
									on: { GRAB: '#evil.waiting', POKE: '#evil.waiting' },
									// Neither the threat nor the wreck has a word before the deed: it goes at once.
									always: [
										{ guard: { type: 'picked', params: { act: 'bunny' } }, target: '#evil.doing' },
										{ guard: { type: 'picked', params: { act: 'wreck' } }, target: '#evil.doing' }
									],
									after: { ACT_DELAY: '#evil.doing' }
								},
								doing: {
									tags: 'mischief',
									initial: 'pick',
									// In the hand, the act is over before it got anywhere.
									on: { GRAB: '#evil.waiting' },
									states: {
										/** Only the acts that have somewhere to go swim there. */
										pick: {
											always: [
												{ guard: { type: 'picked', params: { act: 'wreck' } }, target: 'wreck' },
												{ guard: { type: 'picked', params: { act: 'stealCursor' } }, target: 'stealCursor' },
												{ target: 'swim' }
											]
										},
										swim: {
											entry: ['visit', 'freshDistance'],
											// The swim there can be lost (the cursor left, the window shrank): the act is
											// off, not the tantrum.
											...swimTo,
											on: {
												MISCHIEF_ARRIVED: [
													{ guard: { type: 'picked', params: { act: 'bunny' } }, target: '#evil.doing.threatening' },
													{ target: '#evil.waiting', actions: 'arrived' }
												],
												MISCHIEF_MISSED: '#evil.waiting',
												POKE: '#evil.waiting',
												CURSOR_LEFT: '#evil.waiting'
											}
										},
										// The threat, then it thinks better of it, without ever honing.
										threatening: {
											entry: { type: 'blurtLine', params: { moment: 'bunnyThreat' } },
											after: {
												RELENT: {
													target: '#evil.waiting',
													actions: { type: 'blurtLine', params: { moment: 'bunnyRelent' } }
												}
											},
											on: { POKE: '#evil.waiting' }
										},
										/**
										 * A rampage: the whole page, a piece at a time. Swim to one, take it down
										 * and say so now that it has, then the next, until nothing is left
										 * standing or the swim is lost. The same interruptions as the other
										 * acts that swim; the next wreck carries on where this one stopped.
										 */
										wreck: {
											initial: 'visit',
											states: {
												visit: {
													entry: 'visit',
													// The swim is the next state whichever way it goes: a swim that
													// found nothing is lost the moment it starts.
													always: 'swimming'
												},
												swimming: {
													entry: 'freshDistance',
													...swimTo,
													on: {
														MISCHIEF_ARRIVED: { target: 'knocked' },
														MISCHIEF_MISSED: '#evil.waiting',
														POKE: '#evil.waiting',
														CURSOR_LEFT: '#evil.waiting'
													}
												},
												knocked: {
													entry: 'wrecked',
													after: {
														WRECK_BEAT: [{ guard: 'rampageOver', target: '#evil.waiting' }, { target: 'visit' }]
													}
												}
											}
										},
										// The cursor makeover is gone at once: there is nothing to swim to.
										stealCursor: { entry: 'stealCursor', always: [{ target: '#evil.waiting' }] }
									}
								}
							}
						}
					}
				}
			}
		},
		tab: {
			id: 'tab',
			initial: 'here',
			states: {
				// The page is in front of you: the cat can swim, and the clock still runs.
				here: { on: { TAB_AWAY: 'away' } },
				// In the background it cannot swim, and nothing is measured: coming back measures afresh.
				away: { on: { TAB_BACK: 'here' } }
			}
		},
		/**
		 * The frame's own bookkeeping, in a region of its own because every region sees the frame and
		 * a state that handles it hides the rest: whatever the body is at, the cursor being on the
		 * page is what the frame says, and a mood's chat is brought forward.
		 */
		frame: {
			initial: 'tick',
			states: {
				tick: { on: { TICK: { actions: ['syncCursor', 'pullChat'] } } }
			}
		}
	}
});

/** One let-out of the cat: an actor of the machine, with the cat and the mischief kit it was given. */
export function createBody(cat: Cat, options: BodyOptions) {
	const input: CatInput = { cat, mischief: options.mischief, plan: options.plan };
	return createActor(catMachine, options.clock ? { input, clock: options.clock } : { input });
}

export type Body = ReturnType<typeof createBody>;

/** The body's snapshot, for the components and tests that read it. */
export type BodySnapshot = ReturnType<Body['getSnapshot']>;

/** The cat's mode, as the markup, the probe and the behaviours read it. */
export function modeOf(snap: BodySnapshot): Mode {
	if (snap.hasTag('held')) return 'held';
	if (snap.hasTag('homing')) return 'homing';
	if (snap.hasTag('asleep')) return 'sleep';
	if (snap.hasTag('seek')) return 'seek';
	if (snap.hasTag('trip')) return 'wander';
	return 'company';
}

/** Where it is swimming this frame, from what the machine says it is doing. */
export function whereOf(snap: BodySnapshot): Where {
	if (snap.hasTag('held')) return 'held';
	if (snap.hasTag('homing')) return 'homing';
	if (snap.hasTag('asleep')) return 'sleep';
	if (snap.hasTag('seek')) return 'seek';
	if (snap.hasTag('trip')) return 'trip';
	if (snap.hasTag('charging')) return 'edge-charging';
	if (backingUp(snap)) return 'edge-backing-up';
	if (snap.hasTag('ramming')) return 'edge-ramming';
	if (snap.hasTag('sulking')) return 'edge-sulking';
	if (snap.hasTag('edge')) return 'edge-waiting';
	return 'company';
}

/** Whether it is in its run at the edge, whichever phase: the frame loop turns it head first. */
export function ramming(snap: BodySnapshot): boolean {
	return snap.hasTag('ramming');
}

/** Whether it is lining up its run-up: the frame loop needs to know where that is. */
export function backingUp(snap: BodySnapshot): boolean {
	return snap.hasTag('backingUp');
}

/** Whether it is flying at the wall: the frame loop is the one that sees the splat. */
export function charging(snap: BodySnapshot): boolean {
	return snap.hasTag('charging');
}

/** The bit of mischief the tantrum is on, for the debug panel. */
export function actOf(snap: BodySnapshot): EvilAct | undefined {
	return snap.hasTag('mischief') ? snap.context.mischief : undefined;
}
