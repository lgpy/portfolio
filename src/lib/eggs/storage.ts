/**
 * localStorage, guarded. A browser can refuse it (blocked cookies, private modes, a sandboxed
 * frame); the eggs then simply remember nothing instead of taking the whole page down.
 */

/** The bit of Storage the eggs need, so a guarded stand-in can be passed to Brain. */
export type Stored = Pick<Storage, 'getItem' | 'setItem'>;

export function getStored(key: string): string | null {
	try {
		return globalThis.localStorage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

export function setStored(key: string, value: string): void {
	try {
		globalThis.localStorage?.setItem(key, value);
	} catch {
		// Not remembered: the next visit starts fresh.
	}
}

/** The guarded storage Brain saves its bond through. */
export const browserStorage: Stored = { getItem: getStored, setItem: setStored };
