/**
 * The cat's makeover of your cursor. It lasts until the cat goes home.
 */
export function createCursor() {
	let restyled = false;

	return {
		get restyled() {
			return restyled;
		},
		restyle() {
			restyled = true;
			document.documentElement.classList.add('jelly-cursor');
		},
		undo() {
			// Stolen back by the cat, or gone home: either way the makeover is no longer on.
			restyled = false;
			document.documentElement.classList.remove('jelly-cursor');
		}
	};
}
