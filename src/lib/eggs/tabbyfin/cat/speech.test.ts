import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/eggs/state.svelte.js', () => ({ reducedMotion: () => false }));

const { createSpeech } = await import('./speech.svelte');

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => vi.useRealTimers());

describe('speech', () => {
	it('lets a blurt cut off an ordinary line', () => {
		const speech = createSpeech();
		speech.talk('a long line about nothing much');
		vi.advanceTimersByTime(200);
		speech.blurt('ow');
		expect(speech.line?.text).toBe('ow');
	});

	it('keeps a held line up, and says what interrupted it afterwards', () => {
		const speech = createSpeech();
		speech.blurt('careful.', undefined, 0, undefined, 2000);
		vi.advanceTimersByTime(300);
		speech.blurt('boop!');
		expect(speech.line?.text).toBe('careful.');
		vi.advanceTimersByTime(2000);
		expect(speech.line?.text).toBe('boop!');
	});

	it('does not let a lesser line replace a held one waiting its turn', () => {
		const speech = createSpeech();
		speech.blurt('careful.', undefined, 0, undefined, 2000);
		vi.advanceTimersByTime(300);
		speech.blurt('so that is how it is.', undefined, 0, undefined, 1500);
		speech.blurt('boop!');
		speech.talk('anyway');
		vi.advanceTimersByTime(2000);
		expect(speech.line?.text).toBe('so that is how it is.');
		vi.advanceTimersByTime(500);
		speech.blurt('boop!');
		expect(speech.line?.text).toBe('so that is how it is.');
	});

	it('lets a closing line through at once after a cut, and drops what was waiting', () => {
		const speech = createSpeech();
		speech.blurt('careful.', undefined, 0, undefined, 2000);
		speech.blurt('so that is how it is.', undefined, 0, undefined, 1500);
		speech.cut();
		speech.blurt('fine. but this is not over.');
		expect(speech.line?.text).toBe('fine. but this is not over.');
		vi.advanceTimersByTime(10_000);
		expect(speech.line).toBeUndefined();
	});

	it('drops the then of a line that gets cut off', () => {
		const speech = createSpeech();
		const then = vi.fn();
		speech.talk('watch this!', undefined, 0, then);
		vi.advanceTimersByTime(100);
		speech.blurt('ow');
		vi.advanceTimersByTime(10_000);
		expect(then).not.toHaveBeenCalled();
	});

	it('does not drop a held line waiting its turn when the hold before it has just ended', () => {
		const speech = createSpeech();
		speech.blurt('careful.', undefined, 0, undefined, 500);
		vi.advanceTimersByTime(100);
		speech.blurt('so that is how it is.', undefined, 0, undefined, 1500);
		// The first hold is over, but the speech has not yet moved on to the waiting line.
		vi.advanceTimersByTime(405);
		speech.blurt('missed me.');
		vi.advanceTimersByTime(3000);
		expect(speech.line?.text).toBe('so that is how it is.');
	});
});
