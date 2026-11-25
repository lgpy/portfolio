/**
 * The one plain object the cat's behaviour modules take. Position, velocity, flight and the cursor
 * are live accessors over the component's state, so a behaviour can swim it somewhere and the frame
 * loop, markup and styles all see the change; the rest is what the hand and the cursor leave behind
 * as they touch it. What the cat is doing at any moment (where it is swimming, when it may chat, its
 * run at the edge) is not here: that belongs to the statechart in machine.ts.
 */
import type { Brain, EvilAct, Mood, Pastime } from './brain';
import type { Script } from './lines';
import type { Speech } from './speech.svelte';
import type { BodyEvent } from './machine';

/** How it's getting about. `homing` is the swim back to its tile after Escape. */
export type Mode = 'held' | 'company' | 'seek' | 'wander' | 'sleep' | 'homing';

/** The face JellyCat draws. */
export type Face = 'open' | 'happy' | 'sleep' | 'surprised';

/** Somewhere to swim to, what to say there, and optionally something to do once there. */
export type Spot = {
	x: number;
	y: number;
	line: string;
	key: string;
	act?: () => void;
	/** A second line, said once the first is done: it waits for it rather than racing it in the queue. */
	more?: string;
	/** A piece of furniture to visit, not a place on the page: arriving there isn't exploring. */
	mischief?: boolean;
	/** A bored fiddle: something to shove or topple, which is no more exploring than a nudge is. */
	fiddle?: boolean;
	/** A stop on the guided tour, by its place in the tour. */
	tour?: number;
};

/** Where the cursor is, when it last moved, and whether it's still on the page. */
type Cursor = { x: number; y: number; moved: number; present: boolean };

/** Where the cursor left the window, and whether it went sideways toward another monitor. */
type Edge = { at: number; x: number; y: number; sideways: boolean };

/** How the cat is being held, for working out a throw. */
type Drag = { vx: number; vy: number; t: number };
type Press = { x: number; y: number; id: number } | undefined;
type TrailPoint = { x: number; y: number; t: number };

/** What the debug panel shows besides the meters. */
export type Probe = {
	mode: Mode | 'home';
	pastime?: Pastime;
	mood: Mood;
	/** Partial: the panel starts empty while the cat has not been out to fill it in yet. */
	scores: Partial<Record<Pastime, number>>;
	/** Evil mode: whether it is in one, how long it has lasted, and the temper it started at. */
	evil?: boolean;
	evilFor?: number;
	evilAt?: number;
	/** The bit of mischief it is on now. */
	act?: EvilAct;
};

export type Cat = {
	size: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Held and let go hard: it's still in the air. */
	flying: boolean;
	left: Edge;
	/** Spots it has already remarked on this visit. */
	seen: Set<string>;
	cursor: Cursor;
	grab: { x: number; y: number };
	press: Press;
	pressAt: number;
	drag: Drag;
	trail: TrailPoint[];
	turns: number[];
	flails: number;
	lastMove: TrailPoint;
	leftHome: boolean;
	over: boolean;
	/** When it last said "not the box!", for a drop that was really a forced home. */
	boxAt: number;
	petFrom: number;
	petLast: number;
	/** When the flip trick last started, for the spin. */
	spinFrom: number;
	/** How many times it has been let out this visit. */
	visits: number;
	speech: Speech;
	brain: Brain;
	script: Script;
	home: HTMLElement;
	probe: Probe;
	/** The tile lit up: the parent shows it can be dropped back in. */
	onover: (over: boolean) => void;
	/** Home again: the one way in, for a drop on the tile and for Escape. */
	onhome: () => void;
	feel: (face: Face, ms: number) => void;
	trick: () => void;
	/** A stroke of the tentacles, for a kick or a run-up. */
	pulse: () => void;
	mood: () => Mood;
	bond: () => number;
	restyled: boolean;
	restyle: () => void;
	/** The element that has the pointer captured since the last press, so Escape can let it go. */
	captured?: { el: HTMLElement; id: number };
	/** When a mood's chat may queue behind a line; the body spends it once it has chatted. */
	eagerUntil: number;
	/** What happened to the cat, for the statechart: picks, releases, pokes, the cursor. */
	send: (event: BodyEvent) => void;
};
