export type ProjectId = 'tabbyfin' | 'family-care' | 'la-utils';

export type Project = {
	id: ProjectId;
	name: string;
	blurb: string;
	short: string;
	tags: string[];
	accent: string;
	site?: string;
	code: string;
};

export const projects: Project[] = [
	{
		id: 'tabbyfin',
		name: 'Tabbyfin',
		blurb:
			'Native Jellyfin client for Linux, Windows, macOS and Android. egui on wgpu, video in mpv straight from the GPU.',
		short: 'native Jellyfin client, video in mpv',
		tags: ['rust', 'egui', 'libmpv'],
		accent: '#c396e7',
		site: 'https://tabbyfin.lgpy.dev',
		code: 'https://github.com/lgpy/tabbyfin'
	},
	{
		id: 'family-care',
		name: 'Family Care',
		blurb:
			'A private Android app for a family sharing the care of their relatives: medicines with reminders, stock, appointments, allergies. Offline-first.',
		short: 'Android app for family caregivers',
		tags: ['kotlin', 'android'],
		accent: '#8fd0a8',
		code: 'https://github.com/lgpy/family-care'
	},
	{
		id: 'la-utils',
		name: 'LA Utils',
		blurb:
			'Lost Ark companion: character tracking, crafting profits, market prices and a friends dashboard.',
		short: 'Lost Ark companion',
		tags: ['typescript', 'next.js', 'prisma'],
		accent: '#f08cb0',
		site: 'https://la-utils.vercel.app',
		code: 'https://github.com/lgpy/la-utils'
	}
];
