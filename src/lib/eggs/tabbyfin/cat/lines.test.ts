import { describe, expect, it } from 'vitest';
import { EVIL_TWIN, LINES, Script } from './lines';

describe('Script', () => {
	it('says every line once before repeating any', () => {
		const script = new Script();
		const said = Array.from({ length: LINES.poke.length }, () => script.next('poke'));
		expect(new Set(said).size).toBe(LINES.poke.length);
	});

	it('only says lines that fit the mood', () => {
		const script = new Script();
		const grumpy = Array.from({ length: 12 }, () => script.next('chat', 'grumpy'));
		const allowed = LINES.chat.filter((l) => (l.mood as readonly string[]).includes('grumpy')).map((l) => l.text);
		for (const line of grumpy) expect(allowed).toContain(line);
	});

	it('keeps lines that need a closer bond until you have one', () => {
		const script = new Script();
		const strangers = Array.from({ length: 200 }, () => script.next('chat', 'content', 0));
		expect(strangers).not.toContain("i saved you a pixel. it's the good one.");
		const friends = Array.from({ length: 200 }, () => script.next('chat', 'content', 80));
		expect(friends).toContain("i saved you a pixel. it's the good one.");
	});

	it('hands out the act a line carries', () => {
		const script = new Script();
		const picks = Array.from({ length: 60 }, () => script.pick('chat', 'playful'));
		expect(picks.find((p) => p.act === 'trick')?.text).toBe('watch this!');
		expect(picks.find((p) => p.act === 'cursor')?.text).toMatch(/cursor/);
	});

	it('skips lines that do not fit without using them up', () => {
		const script = new Script(() => 0, () => 12);
		for (let i = 0; i < 4; i++) script.next('chat', 'dizzy');
		const fitting = LINES.chat.filter(
			(l) => (l.mood as readonly string[]).includes('content') && !('bond' in l) && !('night' in l)
		).length;
		const content = new Set(Array.from({ length: fitting }, () => script.next('chat', 'content')));
		expect(content.size).toBe(fitting);
	});

	it('only says the late-night lines late at night', () => {
		const night = LINES.chat.filter((l) => 'night' in l).map((l) => l.text);
		const day = new Script(Math.random, () => 14);
		const late = new Script(Math.random, () => 2);
		const byDay = Array.from({ length: 200 }, () => day.next('chat', 'content'));
		const byNight = Array.from({ length: 200 }, () => late.next('chat', 'content'));
		for (const line of night) expect(byDay).not.toContain(line);
		for (const line of night) expect(byNight).toContain(line);
	});

	it('says the evil twin of a moment while evil, and only then', () => {
		const script = new Script();
		for (const [moment, twin] of Object.entries(EVIL_TWIN) as [keyof typeof LINES, keyof typeof LINES][]) {
			const twins = LINES[twin].map((l) => (typeof l === 'string' ? l : l.text));
			expect(twins).toContain(script.next(moment, 'evil'));
			if (moment !== 'pettedCalm') expect(twins).not.toContain(script.next(moment, 'content'));
		}
	});
});
