/**
 * In another tab, the title asks you to come back; the real title is put back when you do.
 * While the cat is evil the titles change their tune, so the cycle reads `evil` each tick.
 */
import { EVIL_TITLES, TITLES } from '../lines';

export function createTitle(evil: () => boolean = () => false) {
	let real = '';
	let timer: ReturnType<typeof setInterval> | undefined;

	return {
		/** Start the cycle, unless it is already running: repeated hidden events must not orphan one. */
		missYou() {
			if (timer !== undefined) return;
			real = document.title;
			let i = 0;
			const show = () => {
				const titles = evil() ? EVIL_TITLES : TITLES;
				document.title = titles[i++ % titles.length];
			};
			show();
			timer = setInterval(show, 2000);
		},
		stopMissing() {
			clearInterval(timer);
			timer = undefined;
			if (real) document.title = real;
			real = '';
		}
	};
}
