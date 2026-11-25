import { afterEach, describe, expect, it } from 'vitest';
import { browserStorage, getStored, setStored } from './storage';

const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function fakeStorage(value: unknown) {
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value });
}

afterEach(() => {
	if (real) Object.defineProperty(globalThis, 'localStorage', real);
	else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('guarded storage', () => {
	it('reads and writes when storage works', () => {
		const data = new Map<string, string>();
		fakeStorage({
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => data.set(key, value)
		});
		setStored('k', 'v');
		expect(getStored('k')).toBe('v');
		expect(browserStorage.getItem('k')).toBe('v');
	});

	it('degrades to not remembered when storage throws', () => {
		fakeStorage({
			getItem() {
				throw new DOMException('blocked', 'SecurityError');
			},
			setItem() {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
		expect(() => setStored('k', 'v')).not.toThrow();
		expect(getStored('k')).toBeNull();
		expect(browserStorage.getItem('k')).toBeNull();
	});

	it('survives a localStorage getter that throws', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
		expect(getStored('k')).toBeNull();
		expect(() => setStored('k', 'v')).not.toThrow();
	});
});
