import { describe, expect, it } from 'vitest';
import { Brain, CROSS, COOLDOWNS, EVIL, WARN_AT, type Senses } from './brain';

/** A brain on a fake clock, with no randomness unless asked. */
function setup(random = () => 0.5, storage?: Map<string, string>) {
	let now = 0;
	const store = storage
		? { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) }
		: undefined;
	const brain = new Brain({ clock: () => now, random, storage: store });
	/** Run `seconds` of life a second at a time, as the body would. */
	const live = (seconds: number, senses: Partial<Senses> = {}) => {
		const signals = [];
		for (let i = 0; i < seconds; i++) {
			now += 1000;
			signals.push(...brain.tick(1, { ...company, ...senses }));
		}
		return signals;
	};
	return { brain, live, at: () => now };
}

/** Hanging out with an attentive cursor. */
const company: Senses = {
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

describe('meters', () => {
	it('stay between 0 and 100', () => {
		const { brain, live } = setup();
		for (let i = 0; i < 20; i++) brain.on('shaken');
		live(1000, { swimming: 6 });
		for (const v of Object.values(brain.meters)) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(100);
		}
	});

	it('lose energy awake and swimming, and get it back napping', () => {
		const { brain, live } = setup();
		live(60, { swimming: 6 });
		const tired = brain.meters.energy;
		expect(tired).toBeLessThan(80 - 60 * 0.3);
		live(20, { napping: true });
		expect(brain.meters.energy).toBeCloseTo(tired + 30, 5);
	});

	it('gain company near the cursor, lose it when ignored or alone', () => {
		const { brain, live } = setup();
		live(10);
		expect(brain.meters.company).toBeCloseTo(85, 5);
		live(20, { cursorNear: false });
		expect(brain.meters.company).toBeCloseTo(77, 5);
		live(20, { cursorPresent: false, cursorNear: false });
		expect(brain.meters.company).toBeCloseTo(57, 5);
	});

	it('calm down faster when petted or left alone', () => {
		const calm = setup();
		const petted = setup();
		const alone = setup();
		for (const s of [calm, petted, alone]) s.brain.on('shaken');
		calm.live(5);
		petted.live(5, { petting: true });
		alone.live(5, { cursorPresent: false, cursorNear: false });
		expect(petted.brain.meters.temper).toBeLessThan(alone.brain.meters.temper);
		expect(alone.brain.meters.temper).toBeLessThan(calm.brain.meters.temper);
	});

	it('get dizzy from shaking and throws, and settle within seconds', () => {
		const { brain, live } = setup();
		brain.on('shaken');
		brain.on('thrown');
		expect(brain.meters.dizzy).toBe(60);
		brain.on('shaken');
		live(3);
		expect(brain.mood({ napping: false, gold: false })).toBe('dizzy');
		live(10);
		expect(brain.meters.dizzy).toBe(0);
	});

	it('get annoyed by poke spam, not by the odd poke', () => {
		const { brain } = setup();
		for (let i = 0; i < 5; i++) brain.on('poked');
		expect(brain.meters.temper).toBe(10);
		expect(brain.pokeSpam).toBe(false);
		brain.on('poked');
		expect(brain.meters.temper).toBe(12 + 6);
		expect(brain.pokeSpam).toBe(true);
	});
});

describe('warning', () => {
	it('warns once when temper reaches the threshold, and again after calming right down', () => {
		const { brain, live } = setup();
		const first = [...brain.on('shaken'), ...brain.on('shaken'), ...brain.on('shaken')];
		expect(brain.meters.temper).toBeGreaterThanOrEqual(WARN_AT);
		expect(first).toEqual(['warn']);
		expect(brain.on('shaken')).toEqual([]);
		live(100);
		expect([...brain.on('shaken'), ...brain.on('shaken'), ...brain.on('shaken')]).toEqual(['warn']);
	});
});

describe('mood', () => {
	const awake = { napping: false, gold: false };

	it('is cross with you from a grumpy temper, even when dizzy or sleepy', () => {
		const { brain } = setup();
		const m = brain.meters;
		m.temper = CROSS - 1;
		expect(brain.cross).toBe(false);
		m.temper = CROSS;
		m.dizzy = 90;
		expect(brain.mood(awake)).toBe('dizzy');
		expect(brain.cross).toBe(true);
	});

	it('is dizzy first, then sleepy, grumpy, lonely, smug, playful, content', () => {
		const { brain } = setup();
		const m = brain.meters;
		expect(brain.mood(awake)).toBe('content');
		m.company = 70;
		expect(brain.mood(awake)).toBe('playful');
		m.company = 50;
		expect(brain.mood(awake)).toBe('content');
		expect(brain.mood({ napping: false, gold: true })).toBe('smug');
		m.company = 20;
		expect(brain.mood(awake)).toBe('lonely');
		m.temper = 50;
		expect(brain.mood(awake)).toBe('grumpy');
		m.energy = 25;
		expect(brain.mood(awake)).toBe('sleepy');
		m.dizzy = 60;
		expect(brain.mood(awake)).toBe('dizzy');
	});
});

describe('pastimes', () => {
	it('never explores while you are actively moving the cursor', () => {
		const { brain, live } = setup();
		live(120, { cursorIdle: 1 });
		expect(brain.meters.curiosity).toBeGreaterThan(70);
		expect(brain.choose({ ...company, cursorIdle: 1 })).toBeUndefined();
	});

	it('explores once you go quiet and it is curious enough, then cools down', () => {
		const { brain, live } = setup();
		live(20, { cursorIdle: 10 });
		expect(brain.choose({ ...company, cursorIdle: 10 })).toBe('explore');
		brain.on('explored');
		live(15, { cursorIdle: 10 });
		brain.meters.curiosity = 90;
		// Too soon to look again: it fiddles with something instead.
		expect(brain.choose({ ...company, cursorIdle: 10 })).toBe('fiddle');
		live(10, { cursorIdle: 10 });
		brain.meters.curiosity = 90;
		expect(brain.choose({ ...company, cursorIdle: 10 })).toBe('explore');
	});

	it('goes exploring when you leave', () => {
		const { brain } = setup();
		brain.meters.curiosity = 30;
		expect(brain.choose({ ...company, cursorPresent: false, cursorNear: false })).toBe('explore');
	});

	it('naps after half a minute of a still cursor, or when exhausted', () => {
		const { brain } = setup();
		brain.meters.curiosity = 0;
		expect(brain.choose({ ...company, cursorIdle: 29 })).toBeUndefined();
		expect(brain.choose({ ...company, cursorIdle: 30 })).toBe('nap');
		brain.meters.energy = 25;
		expect(brain.choose({ ...company, cursorIdle: 0 })).toBeUndefined();
		brain.meters.energy = 10;
		expect(brain.choose({ ...company, cursorIdle: 0 })).toBe('nap');
	});

	it('only hones once you have honed yourself, a while ago, and not when gold', () => {
		const { brain, live } = setup();
		const honing = { ...company, honeFound: true };
		brain.meters.curiosity = 90;
		expect(brain.choose(honing)).toBeUndefined();
		live(1, { ...honing, honedByYou: true });
		expect(brain.choose({ ...honing, honedByYou: true })).toBeUndefined();
		live(20, { ...honing, honedByYou: true });
		brain.meters.curiosity = 90;
		expect(brain.choose({ ...honing, honedByYou: true })).toBe('hone');
		brain.on('honed');
		live(30, { ...honing, honedByYou: true });
		brain.meters.curiosity = 90;
		expect(brain.choose({ ...honing, honedByYou: true })).toBeUndefined();
		live(50, { ...honing, honedByYou: true });
		brain.meters.curiosity = 90;
		expect(brain.choose({ ...honing, honedByYou: true, gold: true })).toBeUndefined();
	});

	it('does nothing by itself at home or asleep', () => {
		const { brain } = setup();
		brain.meters.energy = 5;
		expect(brain.choose({ ...company, home: true })).toBeUndefined();
		expect(brain.choose({ ...company, napping: true })).toBeUndefined();
	});

	it('fiddles when the cursor is quiet and it is curious, a little less than it wants to look', () => {
		const { brain } = setup();
		const quiet = { ...company, cursorIdle: 10 };
		brain.meters.curiosity = 80;
		const scores = brain.scores(quiet);
		expect(scores.fiddle).toBeGreaterThan(0);
		expect(scores.fiddle).toBeLessThan(scores.explore!);
		// Looking is the older habit: it goes first, and only when that is not on does it fiddle.
		expect(brain.choose(quiet)).toBe('explore');
		brain.meters.curiosity = 80;
		expect(brain.choose(quiet)).toBe('fiddle');
	});

	it('never fiddles while cross with you', () => {
		const { brain } = setup();
		brain.meters.curiosity = 90;
		brain.meters.temper = CROSS;
		expect(brain.scores({ ...company, cursorIdle: 10 }).fiddle).toBe(0);
	});

	it('cools down for about three quarters of a minute between fiddles', () => {
		const { brain, live } = setup();
		const quiet = { ...company, cursorIdle: 10 };
		brain.meters.curiosity = 80;
		expect(brain.choose(quiet)).toBe('explore');
		// Too soon to look again, and bored: a fiddle.
		live(10);
		brain.meters.curiosity = 80;
		expect(brain.choose(quiet)).toBe('fiddle');
		// Its own cooldown is longer than a look's.
		brain.meters.curiosity = 80;
		expect(brain.scores(quiet).fiddle).toBe(0);
		live(COOLDOWNS.fiddle - 1);
		brain.meters.curiosity = 80;
		expect(brain.scores(quiet).fiddle).toBe(0);
		live(1);
		brain.meters.curiosity = 80;
		expect(brain.scores(quiet).fiddle).toBeGreaterThan(0);
	});
});

describe('time away', () => {
	it('loses company but not below a floor, rests, and calms down', () => {
		const { brain } = setup();
		brain.on('shaken');
		brain.on('shaken');
		brain.meters.energy = 20;
		brain.away(3600);
		expect(brain.meters.company).toBe(15);
		expect(brain.meters.energy).toBe(60);
		expect(brain.meters.temper).toBe(0);
		expect(brain.meters.dizzy).toBe(0);
	});
});

describe('evil', () => {
	const awake = { napping: false, gold: false };
	type Live = ReturnType<typeof setup>['live'];

	/** Warn it, let the warning lapse and the dizziness settle, then boil over after the grace. */
	function becomeEvil(brain: Brain, live: Live) {
		live(61);
		brain.on('shaken');
		brain.on('shaken');
		brain.on('shaken'); // 54: the warning
		live(60); // dizzy settles, temper drops below 10 and the warning lapses
		brain.meters.temper = 80;
		live(1); // warns again
		brain.meters.temper = 80;
		live(EVIL.warnHold); // evil, once the warning has had time to be read
	}

	it('needs a warning first, and gives it time to be read', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 80;
		expect(live(1)).toEqual(['warn']);
		brain.meters.temper = 80;
		expect(live(EVIL.warnHold - 1)).toEqual([]);
		expect(brain.evil).toBe(false);
		expect(live(1)).toEqual(['evil']);
		expect(brain.evil).toBe(true);
	});

	it('does not count an old warning, and warns again when annoyed', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 60;
		expect(live(1)).toEqual(['warn']);
		// It stays cross without boiling over, longer than a warning lasts.
		for (let i = 0; i < EVIL.warnWithin + 1; i++) {
			brain.meters.temper = 60;
			expect(live(1)).toEqual([]);
		}
		brain.meters.temper = 85;
		expect(live(1)).not.toContain('evil');
		expect(brain.on('poked')).toEqual(['warn']);
		brain.meters.temper = 85;
		expect(live(EVIL.warnHold)).toContain('evil');
	});

	it('never starts in its tile or asleep', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 90;
		live(1);
		for (const rest of [{ home: true }, { napping: true }]) {
			for (let i = 0; i < 5; i++) {
				brain.meters.temper = 90;
				expect(live(1, rest)).not.toContain('evil');
			}
		}
		expect(brain.evil).toBe(false);
		brain.meters.temper = 90;
		expect(live(1)).toContain('evil');
	});

	it('never starts a tantrum or a warning while catching up after time away', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 60;
		live(1); // warned
		live(EVIL.warnHold);
		brain.meters.temper = 95;
		expect(brain.away(3)).toEqual([]);
		expect(brain.evil).toBe(false);
	});

	it('gives a warning that had to wait its turn the full time once it is heard', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 60;
		live(1); // warned, but still waiting behind another line
		brain.warningWaiting();
		for (let i = 0; i < EVIL.warnHold + 3; i++) {
			brain.meters.temper = 90;
			expect(live(1)).not.toContain('evil');
		}
		brain.warningHeard();
		brain.meters.temper = 90;
		expect(live(EVIL.warnHold - 1)).not.toContain('evil');
		brain.meters.temper = 90;
		expect(live(1)).toContain('evil');
	});

	it('says hello before it says anything cross, coming out of its tile', () => {
		const { brain, live } = setup();
		live(61, { home: true });
		brain.meters.temper = 90;
		expect(live(1)).toEqual([]);
		brain.meters.temper = 90;
		expect(live(2)).toEqual(['warn']);
	});

	it('starts nothing on the way home', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 60;
		live(1); // warned
		brain.rest();
		for (let i = 0; i < 5; i++) {
			brain.meters.temper = 95;
			expect(live(1, { home: true })).toEqual([]);
		}
		expect(brain.evil).toBe(false);
	});

	it('does not count a warning raised on the way into its tile', () => {
		const { brain, live } = setup();
		live(61);
		brain.meters.temper = 45;
		brain.rest();
		expect(brain.on('forced-home')).toEqual([]);
		live(5, { home: true });
		// Out again: annoyed past the threshold, it has to warn before it can boil over.
		brain.meters.temper = 90;
		expect(live(3)).toEqual(['warn']);
		expect(brain.evil).toBe(false);
	});

	it('needs a fresh warning for the next tantrum', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		brain.meters.temper = 25;
		live(1);
		expect(brain.evil).toBe(false);
		live(EVIL.cooldown);
		brain.meters.temper = 90;
		expect(live(1)).toEqual(['warn']);
	});

	it('only pays for a tantrum once, however it is stopped', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		brain.meters.bond = 20;
		brain.stopEvil();
		brain.stopEvil();
		expect(brain.meters.bond).toBeCloseTo(20 - EVIL.bondCost, 6);
	});

	it('lets petting wear off slowly when it stops', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		const signals = [...live(2, { petting: true }), ...live(1), ...live(1, { petting: true })];
		brain.meters.temper = 90;
		expect(signals).not.toContain('calm');
		expect(live(1, { petting: true })).toContain('calm');
	});

	it('never happens in the first minute of a visit', () => {
		const { brain, live } = setup();
		live(30);
		brain.meters.temper = 80;
		brain.tick(1, company); // the warning
		for (let i = 0; i < 29; i++) {
			brain.meters.temper = 90;
			expect(live(1)).not.toContain('evil');
			expect(brain.evil).toBe(false);
		}
		// 60s into the visit it can finally boil over.
		brain.meters.temper = 90;
		expect(live(1)).toContain('evil');
	});

	it('needs the temper to reach evilAt, which a closer bond raises', () => {
		const stranger = setup();
		stranger.live(61);
		stranger.brain.meters.bond = 0;
		stranger.brain.meters.temper = 60;
		expect(stranger.live(1)).toEqual(['warn']);
		stranger.brain.meters.temper = 78;
		expect(stranger.live(EVIL.warnHold)).toContain('evil');

		const friend = setup();
		friend.live(61);
		friend.brain.meters.bond = 100;
		friend.brain.meters.temper = 60;
		expect(friend.live(1)).toEqual(['warn']);
		expect(friend.brain.evilAt).toBe(95);
		friend.brain.meters.temper = 90;
		expect(friend.live(EVIL.warnHold)).not.toContain('evil');
		friend.brain.meters.temper = 100;
		expect(friend.live(1)).toContain('evil');
	});

	it('is petted down after three seconds of petting, and says it was that', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		expect(brain.evil).toBe(true);
		expect(live(3, { petting: true })).toContain('calm');
		expect(brain.evil).toBe(false);
		expect(brain.calmedBy).toBe('petted');
	});

	it('gives up after two minutes even at full temper', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		let seconds = 0;
		while (brain.evil && seconds < 200) {
			brain.meters.temper = 100;
			live(1);
			seconds += 1;
		}
		expect(brain.evil).toBe(false);
		expect(brain.calmedBy).toBe('time');
		expect(seconds).toBe(EVIL.max);
	});

	it('stops when the temper falls below thirty, and costs three bond', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		brain.meters.bond = 20;
		const bond = brain.meters.bond;
		brain.meters.temper = 25;
		const signals = brain.tick(1, { ...company, cursorPresent: false, cursorNear: false });
		expect(signals).toContain('calm');
		expect(brain.evil).toBe(false);
		expect(brain.calmedBy).toBe('time');
		expect(bond - brain.meters.bond).toBeCloseTo(EVIL.bondCost, 6);
	});

	it('waits ten minutes before it can happen again', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		brain.meters.temper = 25;
		live(1); // calm
		expect(brain.evil).toBe(false);
		let waited = 0;
		while (!brain.evil && waited < 700) {
			brain.meters.temper = 100;
			brain.on('poked'); // keeps annoying it, so the warning stays fresh
			live(1);
			waited += 1;
		}
		expect(brain.evil).toBe(true);
		expect(waited).toBeGreaterThanOrEqual(EVIL.cooldown);
	});

	it('is evil while it lasts, then sheepish for forty seconds', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		expect(brain.mood(awake)).toBe('evil');
		brain.meters.temper = 25;
		brain.tick(1, company);
		expect(brain.mood(awake)).toBe('sheepish');
		live(EVIL.sheepish);
		expect(brain.mood(awake)).not.toBe('sheepish');
	});

	it('has no pastimes of its own while it is evil', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		expect(brain.choose({ ...company, cursorIdle: 10 })).toBeUndefined();
	});

	it('wrecks while anything is standing, with something else after every two wrecks', () => {
		const { brain } = setup(() => 0);
		const acts = ['wreck', 'vandal', 'stealCursor'] as const;
		// The page is what it came for: two wrecks, then something else, then back to the page.
		expect(brain.evilAct(acts)).toBe('wreck');
		expect(brain.evilAct(acts)).toBe('wreck');
		expect(brain.evilAct(acts)).toBe('vandal');
		expect(brain.evilAct(acts)).toBe('wreck');
		expect(brain.evilAct(acts)).toBe('wreck');
		// Never the same other act twice running when there is a choice.
		expect(brain.evilAct(acts)).toBe('stealCursor');
		// With nothing else left standing it wrecks again all the same.
		expect(brain.evilAct(['wreck'])).toBe('wreck');
		expect(brain.evilAct([])).toBeUndefined();
	});

	it('is talked out of it by twenty seconds away', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		expect(brain.away(19)).not.toContain('calm');
		expect(brain.evil).toBe(true);
		expect(brain.away(20)).toEqual(['calm']);
		expect(brain.evil).toBe(false);
		expect(brain.calmedBy).toBe('time');
	});

	it('can be sent home mid-tantrum without a signal', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		brain.stopEvil('time');
		expect(brain.evil).toBe(false);
		expect(brain.calmedBy).toBe('time');
		expect(brain.mood(awake)).toBe('sheepish');
	});

	it('tells a listener about each signal as it is made, including the calm time away brings', () => {
		const { brain, live } = setup();
		const heard: string[] = [];
		const stop = brain.listen((signal) => heard.push(signal));
		live(61);
		brain.meters.temper = 80;
		live(1);
		expect(heard).toEqual(['warn']);
		brain.meters.temper = 80;
		live(EVIL.warnHold);
		expect(heard).toEqual(['warn', 'evil']);

		// The same calm `away` hands back is heard as it is made, whoever asked.
		expect(brain.away(25)).toEqual(['calm']);
		expect(heard).toEqual(['warn', 'evil', 'calm']);

		// Unsubscribed, it hears nothing more.
		stop();
		brain.meters.temper = 80;
		live(1);
		expect(heard).toEqual(['warn', 'evil', 'calm']);
	});

	it('tells a listener that arrives mid-tantrum about it, once', () => {
		const { brain, live } = setup();
		becomeEvil(brain, live);
		const heard: string[] = [];
		brain.listen((signal) => heard.push(signal));
		expect(heard).toEqual(['evil']);
	});
});

describe('memory', () => {
	it('remembers the bond and how long you have been away', () => {
		const store = new Map<string, string>();
		const first = setup(undefined, store);
		expect(first.brain.daysAway).toBeUndefined();
		first.brain.meters.bond = 42;
		first.brain.save();
		const saved = JSON.parse(store.get('tabbyfin-cat')!);
		store.set('tabbyfin-cat', JSON.stringify({ ...saved, lastVisit: Date.now() - 3 * 86_400_000 }));
		const second = setup(undefined, store);
		expect(second.brain.meters.bond).toBe(42);
		expect(second.brain.daysAway).toBe(3);
	});

	it('builds bond in a visit: a few minutes with some petting is enough to be remembered', () => {
		const { brain, live } = setup();
		brain.on('freed');
		live(300);
		live(30, { petting: true });
		expect(brain.meters.bond).toBeGreaterThanOrEqual(20);
	});

	it('adds to what another tab saved, instead of overwriting it', () => {
		const store = new Map<string, string>();
		const a = setup(undefined, store);
		const b = setup(undefined, store);
		a.brain.meters.bond = 30;
		a.brain.save();
		b.brain.meters.bond = 5;
		b.brain.save();
		expect(JSON.parse(store.get('tabbyfin-cat')!).bond).toBe(35);
		expect(b.brain.meters.bond).toBe(35);
		a.brain.save();
		expect(JSON.parse(store.get('tabbyfin-cat')!).bond).toBe(35);
	});

	it('ignores saves from another version or garbage', () => {
		const store = new Map([['tabbyfin-cat', JSON.stringify({ v: 99, bond: 80, lastVisit: 0 })]]);
		expect(setup(undefined, store).brain.meters.bond).toBe(0);
		store.set('tabbyfin-cat', '{nope');
		expect(setup(undefined, store).brain.meters.bond).toBe(0);
	});
});
