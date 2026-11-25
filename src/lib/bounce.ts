/** Squash-and-stretch a pressed mascot, unless the visitor asked for less motion. */
export function bounce(target: Element | null) {
	if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	target.animate(
		[
			{ transform: 'none' },
			{ transform: 'translateY(-4px) scale(1.08, 0.94)', offset: 0.4 },
			{ transform: 'none' }
		],
		{ duration: 300, easing: 'ease-out' }
	);
}

