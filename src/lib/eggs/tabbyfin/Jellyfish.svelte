<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { innerWidth as viewportWidth } from 'svelte/reactivity/window';
	import { GOLD, hone } from '#lib/eggs/state.svelte.js';
	import JellyCat, { type Mood } from './JellyCat.svelte';
	import { TIERS, type Script } from './cat/lines';
	import { createSpeech } from './cat/speech.svelte';
	import { createCursor } from './cat/behaviours/cursor';
	import { createMischief } from './cat/behaviours/evil';
	import { happened, warn } from './cat/being';
	import { swim, type Step } from './cat/behaviours/roam';
	import * as pointer from './cat/behaviours/pointer';
	import * as ram from './cat/behaviours/ram';
	import { clampToView } from './cat/view';
	import type { Cat, Face, Mode, Probe } from './cat/context';
	import { actOf, backingUp, charging, createBody, modeOf, ramming, whereOf, type Body } from './cat/machine';
	import type { Brain, Mood as Feeling, Senses } from './cat/brain';

	// The jelly cat, out of its tile: a small, curious, sociable thing. It keeps the cursor
	// company and chats, wanders off to look at the page when you go quiet, naps when you
	// leave it alone, and only goes home when you drag it back onto its tile (or press Escape).
	// What it is doing at any moment is one statechart (./cat/machine.ts); what it says comes
	// from lines.ts, how it feels and what it fancies doing from brain.ts, and where it swims
	// from ./cat/behaviours.
	let {
		home,
		start,
		visits,
		brain,
		script,
		probe = $bindable(),
		onover,
		onhome
	}: {
		home: HTMLElement;
		start: { x: number; y: number };
		visits: number;
		brain: Brain;
		script: Script;
		probe: Probe;
		/** Whether it's being held over its tile, so the tile can light up. */
		onover: (over: boolean) => void;
		onhome: () => void;
	} = $props();

	const SIZE = 64;

	// Reduced motion is read reactively: the effect below restarts when it changes, and only the
	// decorative motion is dropped. The physics and the clamp always run, or the cat would freeze.
	const motion = new MediaQuery('(prefers-reduced-motion: reduce)');
	let still = $derived(motion.current);

	// svelte-ignore state_referenced_locally
	let x = $state(start.x);
	// svelte-ignore state_referenced_locally
	let y = $state(start.y);
	let angle = $state(0);
	let spin = $state(0);
	let squeeze = $state(0);
	let time = $state(0);
	let speed = $state(0);
	let look = $state({ x: 0, y: 0 });
	let blink = $state(false);
	let mood = $state<Mood>('surprised');
	let zs = $state<{ id: number; dx: number }[]>([]);
	let smash = $state(0);
	let impactSide = $state<'left' | 'right'>('right');
	let announced = $state('');
	/** Its brain is dizzy, as opposed to JellyCat's faces: it weaves as it swims. */
	let dizzy = $state(false);

	// The bubble stays on screen, and its tail stays inside the bubble, whatever the line's width.
	// The viewport is read reactively so a resize re-clamps a bubble next to a still cat.
	let bubbleWidth = $state(0);
	let viewWidth = $derived(viewportWidth.current ?? innerWidth);
	let bubbleX = $derived(Math.min(viewWidth - bubbleWidth / 2 - 8, Math.max(bubbleWidth / 2 + 8, x)));
	let tail = $derived.by(() => {
		const room = Math.max(0, bubbleWidth / 2 - 18);
		return Math.max(-room, Math.min(room, x - bubbleX));
	});

	/** The body's snapshot since the last transition: the one place its mode comes from. */
	type Snapshot = ReturnType<Body['getSnapshot']>;
	let snap = $state.raw<Snapshot | undefined>(undefined);
	const mode: Mode = $derived(snap ? modeOf(snap) : 'held');
	/** In a tantrum: the evil look, and the mischief it is getting up to. */
	const evilOn = $derived(!!snap && snap.hasTag('evil'));

	const speech = createSpeech((text) => (announced = text));
	const talk = speech.talk;
	const blurt = speech.blurt;
	const cursorFx = createCursor();

	let vx = 0;
	let vy = 0;
	let flying = false;
	let pulseAt = -1e9;
	let nextPulse = 0;
	let nextBlink = 0;
	let nextZ = 0;
	/** How far a reduced-motion glide moved this frame, for the brain's sense of speed. */
	let glideSpeed = 0;
	let moodUntil = 0;
	let awayAt = 0;
	let impactAt = -1e9;
	let ids = 0;
	let brainAt = performance.now();
	let probeAt = 0;
	let seenAttempt = hone.last?.id ?? -1;

	// Moods worth hearing about actually get a chat soon after they arrive.
	const EAGER: Feeling[] = ['dizzy', 'sleepy', 'lonely', 'grumpy', 'smug'];
	let lastMood: Feeling | undefined;
	let wasSleeping = false;
	const boostedAt = new Map<Feeling, number>();

	// Petting: a slow cursor over it, or a press-and-hold, for at least 0.6s.
	let petting = false;
	let petOn = false;
	let petSaid = -1e9;
	let petTemper = 0;

	/** What it feels, from its meters. */
	function feeling(): Feeling {
		return brain.mood({ napping: mode === 'sleep', gold: hone.level >= GOLD });
	}

	function feel(next: Face, ms: number) {
		// Evil, nothing makes it happy: the narrowed eyes stay.
		mood = next === 'happy' && evilOn ? 'open' : next;
		moodUntil = performance.now() + ms;
	}

	function trick() {
		// No tricks for you while it is evil: a poke just startles it.
		if (evilOn) {
			feel('surprised', 600);
			return;
		}
		if (!still) {
			cat.spinFrom = performance.now();
			vy -= 4;
		}
		feel('happy', 1200);
	}

	function stroke(towards: { x: number; y: number }, power: number) {
		const dx = towards.x - x;
		const dy = towards.y - y;
		const dist = Math.hypot(dx, dy) || 1;
		vx += (dx / dist) * power;
		vy += (dy / dist) * power;
		pulseAt = performance.now();
	}

	function restyle() {
		cursorFx.restyle();
		trick();
		blurt(script.next('cursorDone', feeling(), brain.meters.bond));
	}

	// The one plain object the behaviour modules get: live position, velocity, mode and flight.
	const cat: Cat = {
		size: SIZE,
		get x() {
			return x;
		},
		set x(value) {
			x = value;
		},
		get y() {
			return y;
		},
		set y(value) {
			y = value;
		},
		get vx() {
			return vx;
		},
		set vx(value) {
			vx = value;
		},
		get vy() {
			return vy;
		},
		set vy(value) {
			vy = value;
		},
		get flying() {
			return flying;
		},
		set flying(value) {
			flying = value;
		},
		left: { at: -1e9, x: 0, y: 0, sideways: false },
		seen: new Set<string>(),
		// svelte-ignore state_referenced_locally
		cursor: { x: start.x, y: start.y, moved: performance.now(), present: true },
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
		get visits() {
			return visits;
		},
		speech,
		get brain() {
			return brain;
		},
		get script() {
			return script;
		},
		get home() {
			return home;
		},
		get probe() {
			return probe;
		},
		get restyled() {
			return cursorFx.restyled;
		},
		captured: undefined,
		eagerUntil: -1e9,
		send: (event) => body.send(event),
		get onover() {
			return onover;
		},
		get onhome() {
			return onhome;
		},
		feel,
		trick,
		restyle,
		pulse: () => (pulseAt = performance.now()),
		mood: () => feeling(),
		bond: () => brain.meters.bond
	};

	/** The tantrum's page side: the machine decides when each bit of it runs. */
	const mischief = createMischief(cat, cursorFx, () => still);

	/** The cat's one statechart: what it does, what temper it is in, and when it changes its mind. */
	const body: Body = createBody(cat, { mischief });

	/** How far the cat is from its tile, for the machine's idea of being home. */
	function toTile() {
		const r = home.getBoundingClientRect();
		const at = clampToView(
			{ x: r.left + r.width / 2, y: r.top + r.height / 2 },
			innerWidth,
			innerHeight,
			SIZE / 2
		);
		return Math.hypot(at.x - x, at.y - y);
	}

	onMount(() => {
		blurt(
			visits > 1
				? script.first('greetAgain')
				: brain.daysAway !== undefined
					? script.first('greetReturning', feeling(), brain.meters.bond)
					: script.first('greet')
		);
		// Let the greeting land before any remarks about the ride.
		speech.mark('zoom');
		body.start();
		const subscription = body.subscribe((next) => (snap = next));
		// The brain decides when a tantrum starts and ends, and tells the body itself: wherever it
		// was asked (its own tick, a poke, the time away in another tab), nothing has to carry the
		// answer on. A cat let out mid-tantrum is heard about straight away.
		const temper = brain.listen((signal) => {
			if (signal === 'evil') cat.send({ type: 'EVIL' });
			else if (signal === 'calm') cat.send({ type: 'CALM' });
		});
		return () => {
			temper();
			subscription.unsubscribe();
			speech.stop();
			body.stop();
			// Home or away for good: no tantrum follows it out of the page, and the page is
			// put back even if the tab is closing mid-mischief.
			brain.stopEvil('time');
			mischief.restore();
			cursorFx.undo();
		};
	});

	// It reacts to your honing, and once you've found it, it takes a turn now and then.
	$effect(() => {
		const last = hone.last;
		untrack(() => {
			if (!last || last.by === 'cat' || last.id === seenAttempt) return;
			seenAttempt = last.id;
			const moodNow = feeling();
			const bond = brain.meters.bond;
			if (mode === 'sleep') return;
			if (last.outcome === 'tier' && evilOn) talk(script.next('honed', moodNow, bond), 'hone', 6000);
			else if (last.outcome === 'tier') {
				feel('happy', 2500);
				blurt(TIERS[last.tier ?? -1] ?? 'ooh!');
			} else if (last.outcome === 'success') talk(script.next('honed', moodNow, bond), 'hone', 6000);
			else if (last.outcome === 'fail') talk(script.next('missed', moodNow, bond), 'hone', 6000);
			else if (last.outcome === 'max') talk(script.next('maxed', moodNow, bond), 'maxed', 15_000);
			else if (last.outcome === 'reset') {
				feel('surprised', 1500);
				// The reset line always gets said, and a warning it raised follows it. The brain tells
				// the body about a tantrum itself, so nothing rides on the line being heard out.
				const cross = brain.on('gold-reset').includes('warn');
				blurt(script.next('goldReset', moodNow, bond), undefined, 0, cross ? () => warn(cat) : undefined);
			}
		});
	});

	/** A mood worth hearing about actually gets chatted about soon after it arrives. */
	function noteMood(moodNow: Feeling, now: number) {
		const sleeping = mode === 'sleep';
		const changed = moodNow !== lastMood || (wasSleeping && !sleeping);
		lastMood = moodNow;
		wasSleeping = sleeping;
		if (!changed || !EAGER.includes(moodNow)) return;
		// Once per mood per 20s, so a lasting grump doesn't keep cutting in.
		if (now - (boostedAt.get(moodNow) ?? -1e9) < 20_000) return;
		boostedAt.set(moodNow, now);
		cat.eagerUntil = now + 6000;
	}

	$effect(() => {
		// Reading the reactive query here restarts the loop when the preference changes.
		const calm = still;
		let prev = performance.now();
		let id = requestAnimationFrame(function frame(now) {
			const dt = Math.min(50, now - prev) / 16.67;
			prev = now;
			time = now / 1000;

			// The stroke: a quick squeeze, then a slow relax. Purely decorative.
			const s = now - pulseAt;
			squeeze = calm ? 0 : s < 160 ? s / 160 : s < 760 ? 1 - (s - 160) / 600 : 0;

			if (now > nextBlink) {
				blink = true;
				if (now > nextBlink + 130) {
					blink = false;
					nextBlink = now + 2500 + Math.random() * 4000;
				}
			}
			if (now > moodUntil && mood !== 'sleep') mood = 'open';

			const dc = Math.hypot(cat.cursor.x - x, cat.cursor.y - y);

			// Petting: a slow cursor over it, or a held touch, for at least 0.6s.
			if (cat.petFrom && now - cat.petLast >= 500) cat.petFrom = 0;
			const touching =
				!!cat.press && now - cat.pressAt >= 600 && Math.hypot(cat.cursor.x - cat.press.x, cat.cursor.y - cat.press.y) <= 6;
			petting = mode !== 'sleep' && (touching || (cat.petFrom > 0 && now - cat.petFrom >= 600));
			if (petting) {
				if (!petOn) {
					petOn = true;
					petTemper = brain.meters.temper;
				}
				if (now - petSaid >= 6000) {
					petSaid = now;
					const moment = evilOn ? 'pettedEvil' : petTemper >= 45 ? 'pettedCalm' : 'petted';
					talk(script.next(moment, feeling(), brain.meters.bond));
				}
				if (!evilOn) {
					mood = 'happy';
					moodUntil = now + 250;
				}
			} else petOn = false;

			const moodNow = feeling();
			noteMood(moodNow, now);
			const eager = now < cat.eagerUntil;
			dizzy = !calm && moodNow === 'dizzy' && !petting;
			const senses: Senses = {
				cursorNear: cat.cursor.present && dc < 200,
				cursorPresent: cat.cursor.present,
				cursorIdle: (now - cat.cursor.moved) / 1000,
				swimming: calm ? glideSpeed : speed,
				napping: mode === 'sleep',
				petting,
				// On its way home it is as good as home: nothing new starts that the tile would cut off.
				home: mode === 'homing',
				honeFound: hone.found,
				honedByYou: hone.honedByYou,
				gold: hone.level >= GOLD
			};
			// Its own tick may have started or ended a tantrum: the brain tells the body itself, and
			// the body is the one that says the line and turns the page round. The warning is the one
			// signal a caller has to say.
			for (const signal of brain.tick(Math.min(0.25, (now - brainAt) / 1000), senses)) {
				if (signal === 'warn') warn(cat);
			}
			// What it is doing: one statechart sees the frame, held, homing, asleep and evil too, so
			// it can tell when something took the cat off what it was on. Everything it decides from
			// is on the frame: it never goes looking at the page or the brain itself.
			cat.send({
				type: 'TICK',
				now,
				x,
				y,
				dc,
				cursor: { x: cat.cursor.x, y: cat.cursor.y, present: cat.cursor.present },
				left: { at: cat.left.at },
				flying,
				petting,
				still: calm,
				eager,
				line: !!speech.line,
				talking: speech.talking,
				cross: brain.cross,
				mood: moodNow,
				toTile: mode === 'homing' ? toTile() : Infinity,
				toRunUp: snap && backingUp(snap) ? ram.toRunUp(cat) : Infinity,
				senses
			});
			const snapNow = body.getSnapshot();
			// Home is the end of it: the tile has it now.
			if (snapNow.hasTag('home')) return;
			// A link hovered for a moment gets a word about it, once nothing else is being said.
			if (linkAt && now >= linkAt) considerLink(now);
			brainAt = now;
			if (now > probeAt) {
				probeAt = now + 500;
				// The cat's mode is the statechart's, read here by the debug panel.
				Object.assign(probe, {
					mode,
					mood: feeling(),
					scores: brain.scores(senses),
					evil: snapNow.hasTag('evil'),
					evilFor: brain.evilFor,
					evilAt: brain.evilAt,
					act: actOf(snapNow)
				});
			}

			// Under reduced motion the drifting z's have no animation to end them; they go now.
			if (calm && zs.length) zs = [];

			let step: Step = { power: 0, every: 1000, near: 30, settle: false };
			if (mode === 'sleep') {
				if (now > nextZ) {
					if (!calm) zs.push({ id: ids++, dx: Math.random() * 10 - 5 });
					nextZ = now + 1100;
				}
			} else {
				step = swim(cat, now, whereOf(snapNow), snapNow.context.spot);
			}
			const { target, power, every, near, settle } = step;

			// The physics and the clamp run whatever the motion preference: only the decoration goes.
			glideSpeed = 0;
			if (mode !== 'held') {
				if (target && (!petting || mode === 'homing')) {
					const d = Math.hypot(target.x - x, target.y - y);
					if (calm) {
						// Calm: one steady glide at the target, no pulses.
						if (d > near) {
							const glide = Math.min(d, (3 + power * 1.2) * brain.vigour() * dt);
							x += ((target.x - x) / d) * glide;
							y += ((target.y - y) / d) * glide;
							glideSpeed = glide / dt;
						}
					} else if (d > near && now >= nextPulse) {
						stroke(target, (Math.min(d, 320) * 0.03 + power) * brain.vigour());
						nextPulse = now + every * (0.85 + Math.random() * 0.3);
					}
				}
				const water = Math.pow(0.958, dt);
				vx *= water;
				vy = vy * water + (mode === 'sleep' ? 0.004 : 0.01) * dt;
				if (mode === 'sleep') vy = Math.min(vy, 0.35);
				if ((petting && mode !== 'homing') || settle) {
					// Being petted (or about to be), it settles: no stroking, and the water takes it out of it.
					const rest = Math.pow(0.9, dt);
					vx *= rest;
					vy *= rest;
				}
				if (!calm && moodNow === 'dizzy' && !petting) {
					// Dizzy, it weaves a little as it swims.
					const sp = Math.hypot(vx, vy) || 1;
					const sway = Math.sin(now / 320) * 0.04 * dt;
					vx += (-vy / sp) * sway;
					vy += (vx / sp) * sway;
				}
				x += vx * dt;
				y += vy * dt;
				const hitX = x < SIZE / 2 || x > innerWidth - SIZE / 2;
				const hitY = y < SIZE / 2 || y > innerHeight - SIZE / 2;
				if ((hitX || hitY) && flying && Math.hypot(vx, vy) > 5) {
					feel('surprised', 700);
					blurt(script.next('bonk', moodNow, brain.meters.bond), 'bonk', 1500);
					happened(cat, 'slammed');
				}				if (hitX && charging(snapNow)) {
					// Splat against the edge and bounce off. The machine counts the charge, turns
					// it round and says the word about it, including when that was the last try.
					impactAt = now;
					// Which edge it hit, from where it is: the bounce below flips the velocity.
					impactSide = x > innerWidth / 2 ? 'right' : 'left';
					vx = -Math.sign(vx) * 3;
					feel('surprised', 700);
					// The page jolts. Not .page itself: a transform there would become the
					// containing block for this fixed-position cat and throw it off screen.
					if (!calm) ram.jolt(impactSide === 'right' ? 3 : -3);
					happened(cat, 'rammed');
					cat.send({ type: 'RAM_HIT', now });
				} else if (hitX) vx *= -0.6;
				if (hitY) vy *= -0.6;
				// A thrown cat that has come to a stop has something to say about it.
				if (flying && Math.hypot(vx, vy) < 0.8) {
					flying = false;
					feel('happy', 1500);
					blurt(script.next('land', moodNow, brain.meters.bond));
				}
				const kept = clampToView({ x, y }, innerWidth, innerHeight, SIZE / 2);
				x = kept.x;
				y = kept.y;
			}

			// Face the way it's swimming; at rest, sit upright and sway.
			const v = mode === 'held' ? Math.hypot(cat.drag.vx, cat.drag.vy) : Math.hypot(vx, vy);
			speed = calm && mode !== 'held' ? glideSpeed : v;
			const resting = calm ? 0 : Math.sin(now / 900) * (mode === 'sleep' ? 8 : 5);
			const heading =
				mode === 'held'
					? Math.max(-35, Math.min(35, cat.drag.vx * 3))
					: v > 0.7
						? (Math.atan2(vx, -vy) * 180) / Math.PI
						: resting;
			// Ramming, it turns head-first toward the edge, and quickly; the splat's moment stays
			// with it a little longer, while it comes back round.
			const facingEdge = !cat.cursor.present && (ramming(snapNow) || now - impactAt < 700);
			const facing = facingEdge ? (cat.left.x > innerWidth / 2 ? 90 : -90) : heading;
			const diff = ((facing - angle + 540) % 360) - 180;
			angle += diff * Math.min(1, (facingEdge ? 0.4 : 0.08) * dt);
			spin = !calm && now - cat.spinFrom < 800 ? ((now - cat.spinFrom) / 800) * 360 : 0;
			smash = Math.max(0, 1 - (now - impactAt) / 350);

			// Eyes follow the cursor, or whatever it's swimming to.
			const focus = mode === 'wander' && snapNow.context.spot ? snapNow.context.spot : cat.cursor;
			const fx = focus.x - x;
			const fy = focus.y - y;
			const rad = (-angle * Math.PI) / 180;
			const lx = fx * Math.cos(rad) - fy * Math.sin(rad);
			const ly = fx * Math.sin(rad) + fy * Math.cos(rad);
			const m = Math.max(1, Math.hypot(lx, ly));
			const reach = Math.min(1, m / 120);
			look = { x: (lx / m) * reach, y: (ly / m) * reach };

			id = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(id);
	});

	function onpointermove(event: PointerEvent) {
		pointer.move(cat, event, mode === 'held');
	}

	function onpointerup(event: PointerEvent) {
		pointer.release(cat, event, mode === 'held');
	}

	function onpointerdown(event: PointerEvent & { currentTarget: HTMLElement }) {
		pointer.press(cat, event, mode === 'held');
	}

	function onmouseout(event: MouseEvent) {
		pointer.leave(cat, event, mode === 'held');
	}

	function onkeydown(event: KeyboardEvent) {
		// Escape sends it home like dropping it on its tile, even out of your hand. It also ends
		// petting, so a press-and-hold can't keep it here.
		if (event.key !== 'Escape' || mode === 'homing') return;
		if (mode === 'held') {
			// Escape while held: drop the drag cleanly first, including any throw it had picked up,
			// so the pointerup that follows has nothing left to drop, throw or poke with.
			cat.drag = { vx: 0, vy: 0, t: 0 };
			cat.trail = [];
			cat.turns = [];
			cat.flails = 0;
			// Let go of the pointer too, or the page under it gets no hover or clicks until you let go.
			if (cat.captured?.el.hasPointerCapture(cat.captured.id)) {
				cat.captured.el.releasePointerCapture(cat.captured.id);
			}
			cat.captured = undefined;
			// Over its tile, the tile stops saying it can take the cat.
			if (cat.over) {
				cat.over = false;
				cat.onover(false);
			}
		}
		cat.press = undefined;
		cat.petFrom = 0;
		cat.petLast = 0;
		petOn = false;
		impactAt = -1e9;
		// The machine ends any tantrum with the send home: it puts the page back, then says the
		// grudge before the cat reaches its tile.
		cat.send({ type: 'ESCAPE' });
	}

	/** The link under the cursor, for a word about it if the cursor stays there a moment. */
	let hovered: Element | undefined;
	/** When the frame loop should look at the hovered link again, and how many lines put it off. */
	let linkAt = 0;
	let linkTries = 0;

	function onpointerover(event: PointerEvent) {
		if (event.pointerType !== 'mouse') return;
		const link = (event.target as Element | null)?.closest?.('a[href]') ?? undefined;
		if (link === hovered) return;
		hovered = link;
		linkAt = link ? performance.now() + 600 : 0;
		linkTries = 0;
	}

	/** Still on that link after a moment: a word about it, once it isn't saying something else. */
	function considerLink(now: number) {
		const link = hovered;
		linkAt = 0;
		if (!link || linkTries > 8) return;
		const near = Math.hypot(cat.cursor.x - x, cat.cursor.y - y) < 250;
		if (mode !== 'company' || evilOn || !near) return;
		if (speech.line) {
			// Mid-sentence: look again in a moment, with the line in the way.
			linkTries += 1;
			linkAt = now + 600;
			return;
		}
		talk(script.next('link', feeling(), brain.meters.bond), 'link', 30_000);
	}

	function onvisibilitychange() {
		// The machine keeps whether the tab is away, so nothing is measured while it is.
		if (document.hidden) {
			awayAt = performance.now();
			cat.send({ type: 'TAB_AWAY' });
			return;
		}
		// The brain is told about the gap by its owner, Tabbyfin; don't also tick it.
		brainAt = performance.now();
		const missed = !!awayAt && performance.now() - awayAt > 3000;
		if (missed) {
			cat.cursor.moved = performance.now();
			// A nap doesn't survive you coming back, once you have been gone a while.
			feel('happy', 2000);
			talk(script.next('tabBack', feeling(), brain.meters.bond));
		}
		cat.send({ type: 'TAB_BACK', missed });
	}
</script>

<svelte:window
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	{onmouseout}
	{onkeydown}
	{onpointerover}
	onscroll={() => talk(script.next('scroll', feeling(), brain.meters.bond), 'scroll', 30_000)}
/>
<svelte:document
	{onvisibilitychange}
	onselectionchange={() => {
		if (mode === 'sleep' || evilOn) return;
		if (String(getSelection() ?? '').trim().length > 3) {
			talk(script.next('read', feeling(), brain.meters.bond), 'read', 30_000);
		}
	}}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={['jelly', { held: mode === 'held', gold: hone.level >= GOLD, evil: evilOn }]}
	style:translate="{x}px {y}px"
	style:width="{SIZE}px"
	style:height="{SIZE}px"
	{onpointerdown}
	oncontextmenu={(event) => event.preventDefault()}
>
	<!-- Splatting against the edge flattens it against that edge, whichever way it's facing. -->
	<div
		class="splat"
		style:scale="{1 - 0.4 * smash} {1 + 0.25 * smash}"
		style:transform-origin="{impactSide === 'right' ? '100%' : '0%'} 50%"
	>
		<div
			class="body"
			style:rotate="{angle + spin + (dizzy ? Math.sin(time * 5.5) * 15 : 0)}deg"
		>
			<JellyCat
				{squeeze}
				{time}
				{speed}
				{mood}
				{look}
				{blink}
				{still}
				evil={evilOn}
				talking={speech.talking}
			/>
		</div>
	</div>
	{#each zs as z (z.id)}
		<span
			class="z mono"
			style:left="{SIZE * 0.7 + z.dx}px"
			onanimationend={() => (zs = zs.filter((o) => o.id !== z.id))}
			{...{ onanimationcancel: () => (zs = zs.filter((o) => o.id !== z.id)) }}>z</span
		>
	{/each}
</div>

{#if speech.line}
	{@const current = speech.line}
	{#key current.id}
		<p
			class={['bubble', { below: y < 110, gold: hone.level >= GOLD }]}
			style:left="{bubbleX}px"
			style:top="{y < 110 ? y + SIZE / 2 + 14 : y - SIZE / 2 - 12}px"
			style:--tail="{tail}px"
			bind:offsetWidth={bubbleWidth}
			aria-label={current.text}
		>
			<span aria-hidden="true">{current.text.slice(0, current.shown)}</span><span
				class="unsaid"
				aria-hidden="true">{current.text.slice(current.shown)}</span
			>
		</p>
	{/key}
{/if}

<span class="sr" aria-live="polite">{announced}</span>

<style>
	.jelly {
		position: fixed;
		top: -32px;
		left: -32px;
		z-index: 65;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
		filter: drop-shadow(0 0 12px color-mix(in oklch, #c396e7 45%, transparent));
	}

	/* At +25 the whole page is gold, and so is it. */
	.jelly.gold {
		filter: drop-shadow(0 0 12px oklch(0.8 0.14 80 / 0.55));
	}

	/* Evil: a redder shadow than usual. The body's own colour shift is JellyCat's. */
	.jelly.evil {
		filter: drop-shadow(0 0 14px rgb(190 55 90 / 0.5));
	}

	.jelly.gold .body {
		filter: sepia(0.9) saturate(2.6) hue-rotate(-12deg) brightness(1.08);
	}

	.jelly.held {
		cursor: grabbing;
	}

	.splat {
		width: 100%;
		height: 100%;
	}

	.body {
		width: 100%;
		height: 100%;
		transform-origin: 50% 40%;
	}

	.z {
		position: absolute;
		top: 0;
		font-size: 13px;
		color: #c396e7;
		pointer-events: none;
		animation: drift 2.4s ease-out forwards;
	}

	@keyframes drift {
		from {
			opacity: 0;
			transform: translate(0, 0) scale(0.7);
		}
		20% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: translate(14px, -36px) scale(1.2);
		}
	}

	.bubble {
		position: fixed;
		z-index: 66;
		/* Sized to the line, not squeezed by how close to the screen edge it sits. */
		width: max-content;
		max-width: 240px;
		margin: 0;
		padding: 6px 10px;
		translate: -50% -100%;
		font-size: 13px;
		line-height: 1.35;
		text-align: center;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid #c396e7;
		border-radius: 12px;
		box-shadow: var(--shadow);
		pointer-events: none;
		transform-origin: calc(50% + var(--tail)) 100%;
		animation: pop 220ms cubic-bezier(0.25, 1, 0.5, 1);
	}

	/* The tail points at the cat, wherever the bubble had to shift to stay on screen. */
	.bubble::after {
		content: '';
		position: absolute;
		top: 100%;
		left: calc(50% + var(--tail));
		width: 10px;
		height: 10px;
		translate: -50% -50%;
		rotate: 45deg;
		background: var(--bg);
		border-right: 1px solid #c396e7;
		border-bottom: 1px solid #c396e7;
	}

	.bubble.gold,
	.bubble.gold::after {
		border-color: var(--gold);
	}

	.bubble.below {
		translate: -50% 0;
		transform-origin: calc(50% + var(--tail)) 0;
	}

	.bubble.below::after {
		top: 0;
		rotate: 225deg;
	}

	/* The rest of the line holds its space, so the bubble doesn't grow as it talks. */
	.unsaid {
		visibility: hidden;
	}

	@keyframes pop {
		from {
			opacity: 0;
			scale: 0.4;
		}
	}

	/* For the screen reader: each finished line is announced, but never seen. */
	.sr {
		position: fixed;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.z,
		.bubble {
			animation: none;
		}
	}
</style>
