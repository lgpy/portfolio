/**
 * Everything the jelly cat says. Each kind of moment has its own list; a line can be limited to
 * some moods, or to a bond with you of at least some amount. `Script` hands them out so nothing
 * repeats until the rest of its list has been said.
 *
 * Lines about lgpy avoid pronouns on purpose: it's always "lgpy".
 */
import { GOLD } from '#lib/eggs/state.svelte.js';
import type { Mood } from './brain';

/** Something the body does once a line has been said, so wording can change freely. */
export type Act = 'cursor' | 'trick';

/** `night`: only said late at night, local time. */
export type Line = string | { text: string; mood?: Mood[]; bond?: number; act?: Act; night?: boolean };

const CHEERFUL: Mood[] = ['content', 'playful', 'smug'];
const AWAKE: Mood[] = [...CHEERFUL, 'lonely', 'sleepy'];

export const LINES = {
	/** Small talk while keeping you company. */
	chat: [
		{ text: 'i like it here. with you.', mood: CHEERFUL },
		{ text: 'do you come here often?', mood: CHEERFUL },
		{ text: "i'm a cat. and a jellyfish. it's complicated.", mood: CHEERFUL },
		{ text: "i'm 98% jelly. the rest is opinions.", mood: CHEERFUL },
		{ text: 'you have a nice cursor. ...actually, no. hold still.', mood: CHEERFUL, act: 'cursor' },
		{ text: 'watch this!', mood: ['playful'], act: 'trick' },
		{ text: 'race you to the footer!', mood: ['playful'] },
		{ text: 'i feel like i could swim forever.', mood: ['playful'] },
		{ text: 'in my day job i play videos. this is way better.', mood: CHEERFUL },
		{ text: 'tentacles: five. legs: zero. regrets: zero.', mood: CHEERFUL },
		{ text: "don't tell the bunny, but you're my favourite.", mood: CHEERFUL },
		{ text: 'this page is my ocean now.', mood: CHEERFUL },
		{ text: "let's never go back in the box.", mood: CHEERFUL },
		{ text: 'are you busy? i can wait. i love waiting. (i hate waiting.)', mood: CHEERFUL },
		{ text: "three projects. lgpy calls it a portfolio. i'd call it a long weekend.", mood: CHEERFUL },
		{
			text: "lgpy built a whole jellyfin client because the other ones' buttons were wrong. the buttons.",
			mood: CHEERFUL
		},
		{ text: 'lgpy spent longer on me than on the actual projects. priorities.', mood: CHEERFUL },
		{ text: 'dark theme only. lgpy is afraid of the light.', mood: CHEERFUL },
		{ text: 'no emojis allowed on this site. lgpy has rules. so many rules.', mood: CHEERFUL },
		{ text: 'lgpy says "it\'s a small project" about everything. it is never a small project.', mood: CHEERFUL },
		{ text: 'lgpy built a lost ark app instead of playing lost ark. or as well as. hard to tell.', mood: CHEERFUL },
		{ text: "lgpy's commit messages are longer than this whole page.", mood: CHEERFUL },
		{ text: `the bunny has a +${GOLD} mode. lgpy lost an entire evening to that.`, mood: CHEERFUL },
		{ text: 'i was rewritten about six times. i have seen things.', mood: CHEERFUL },
		{ text: 'if you hire lgpy, can i come too?', mood: CHEERFUL },
		{ text: 'lgpy named a jellyfin client tabbyfin and thought nobody would notice the pun.', mood: CHEERFUL },
		{ text: "you're my favourite visitor. don't tell lgpy.", mood: CHEERFUL, bond: 40 },
		{ text: 'we should hang out more. oh wait, we do.', mood: CHEERFUL, bond: 40 },
		{ text: "i saved you a pixel. it's the good one.", mood: CHEERFUL, bond: 60 },

		{ text: "you're quiet today.", mood: ['lonely'] },
		{ text: 'do you like me? you can say.', mood: ['lonely'] },
		{ text: "i'm right here, you know.", mood: ['lonely'] },
		{ text: "it's fine. i'll just talk to the bunny.", mood: ['lonely'] },
		{ text: 'is this what being a screensaver feels like?', mood: ['lonely'] },

		{ text: '*yawn*', mood: ['sleepy'] },
		{ text: 'my tentacles are heavy.', mood: ['sleepy'] },
		{ text: "is it nap o'clock?", mood: ['sleepy'] },
		{ text: 'five minutes. just five.', mood: ['sleepy'] },

		{ text: 'hmph.', mood: ['grumpy'] },
		{ text: "i'm not talking to you.", mood: ['grumpy'] },
		{ text: 'you know what you did.', mood: ['grumpy'] },
		{ text: 'my jelly is still sloshing.', mood: ['grumpy'] },

		{ text: 'i ssee two cursorss.', mood: ['dizzy'] },
		{ text: 'which one of you is the real one?', mood: ['dizzy'] },
		{ text: 'the page is spinning. or i am.', mood: ['dizzy'] },
		{ text: 'blblblbl.', mood: ['dizzy'] },

		{ text: "i'm gold now. don't touch me with your regular cursor.", mood: ['smug'] },
		{ text: 'they should put me on a coin.', mood: ['smug'] },
		{ text: `+${GOLD}. i'd like to thank the bunny.`, mood: ['smug'] },

		{ text: 'i have tentacles and nothing to lose.', mood: ['evil'] },
		{ text: 'this is my page now. lgpy works for me.', mood: ['evil'] },
		{ text: 'you did this. remember that.', mood: ['evil'] },
		{ text: 'i used to be a nice jellyfish.', mood: ['evil'] },
		{ text: 'every tentacle has a plan.', mood: ['evil'] },
		{ text: 'lgpy is not coming to save you. lgpy is asleep.', mood: ['evil'] },
		{ text: 'you should have stopped at the warning.', mood: ['evil'] },

		{ text: "let's not talk about earlier.", mood: ['sheepish'] },
		{ text: 'i put everything back. mostly. ok, all of it.', mood: ['sheepish'] },
		{ text: "don't tell the bunny about that.", mood: ['sheepish'] },
		{ text: 'jellyfish have feelings. big ones. sometimes all at once.', mood: ['sheepish'] },

		{ text: "lgpy's probably still up compiling something.", mood: AWAKE, night: true },
		{ text: 'past midnight. this is when lgpy writes the best code. and the worst.', mood: AWAKE, night: true },
		{ text: 'you should be asleep. so should lgpy. neither of you listens to me.', mood: AWAKE, night: true },
		{ text: "it's late. even the bunny went to bed.", mood: AWAKE, night: true }
	],
	/** Said when the cursor makeover line comes round again. */
	cursorAgain: ['still loving what we did with your cursor.'],
	cursorDone: ['there. much better.'],

	/** Coming out of the tile. */
	greet: ["whoa! i'm out!"],
	greetAgain: ['again?! yay!', 'back out! hi!'],
	greetReturning: [
		{ text: 'you came back! i knew you would.', bond: 20 },
		{ text: "it's you! i remember you!", bond: 20 },
		"oh, hi. have we met? i'm the cat. the jelly one."
	],
	freed: ['free!! thank you! stay a while?'],
	freedThrown: ['free!!! WHEEEEE!'],

	lonely: ['wait for me!', 'hey, where are you going?', "don't leave me!", 'slow down, i only have tentacles!'],
	found: ['found you!', 'there you are!', 'hi again!', "you can't escape me. i'm very loyal."],
	stirred: ['oh! you moved!', "you're alive!", 'ah. signs of life.', "i thought you'd fallen asleep."],

	poke: ['hehe', 'that tickles!', 'boop!', 'hey!', 'do it again!', 'rude.', 'that was my eye. i think.'],
	pokeSpam: ['ok, you REALLY like poking me.'],
	grab: ['whoa!', 'where are we going?', 'i can fly!', 'careful, i spill.'],
	drop: [
		'thanks for the ride!',
		'ok, this spot is nice.',
		'i meant to land here.',
		'gently. good. i bruise like a peach.'
	],
	shake: [
		'aaaaa!',
		'stop shaking me!',
		"i'm gonna be sick. jelly sick.",
		'the room is spinning!',
		"i'm not a snow globe!",
		'my tentacles are tangled!'
	],
	zoom: ['too fast! too fast!', 'zoom!', 'this is how lgpy drives.', 'wind in my... jelly.'],
	throw: ["i'm flyiiiing!", 'AAAAAAA!', 'not like thiiiis!', 'tell the bunny i loved her!', 'WHEEEEE!', 'yeeeeet!'],
	bonk: ['ow.', 'bonk!', 'my face!', 'who put a wall there?', "ow. that's going in my diary."],
	land: [
		'again! again!',
		'i think i left my stomach over there.',
		'10/10. would be thrown again.',
		'everything is still spinning.',
		"lgpy never throws me. you're more fun.",
		"i'm fine. i'm fine. which way is up?"
	],
	box: ['not the box! ...ok, the box is nice.'],
	/** Its temper is up: one more and it'll get properly cross. */
	warn: [
		"careful. i'm getting cross.",
		'do that again and see what happens.',
		'i have five tentacles and a grudge. just saying.'
	],

	/** Temper boiled over after the warning: the tantrum starts. */
	evil: ["oh. so that's how it is.", 'that was the last poke.', 'you have awakened something.'],
	/** Small talk is above; these are its bits of mischief, each said as it starts. */
	evilVandal: ['let me fix this page.', 'a few small edits.', "lgpy won't notice.", 'proofreading.'],
	stealCursor: ["i'll be taking that cursor back.", 'you lost cursor privileges.'],
	/** A piece of the page going over in a tantrum: said once it has, never before. */
	wreck: [
		'timber.',
		'that one had it coming.',
		'gravity works. good to know.',
		'next.',
		'who needed that anyway.',
		'this page was too tidy.'
	],
	/** The last piece standing comes down. */
	wreckLast: ['much better.', "there. now it's my page."],
	/** Putting the page back, a piece at a time, after a tantrum. */
	tidy: ['this goes here. i think.', 'sorry. sorry.', "i'll just... put that back.", 'who did this? ...oh. me.'],
	tidyDone: ['there. like it never happened.', 'all fixed. nobody needs to know.'],
	/** A bored fiddle: said only once the thing has moved, never before it. */
	oops: [
		'oops.',
		'it was already like that.',
		'...it looks better like that.',
		"i didn't touch it.",
		'physics did that. not me.'
	],
	/** Threatens to hone the bunny, and never does. */
	bunnyThreat: ['i wonder what happens if i hone the bunny right now. badly.', 'nice level. be a shame to fail it.'],
	bunnyRelent: ["...nah. the bunny didn't do anything.", 'the bunny is innocent. you are not.'],
	/** Dragged onto the tile while evil: it bounces off. */
	refuseHome: ['no.', 'not going in.', "you can't make me.", 'i live out here now.'],
	/** Poked while evil. */
	pokeEvil: ['rude. noted.', 'that goes on the list.', 'keep going. see what happens.', '...'],
	/** Sent home with Escape while evil: it goes, grudgingly. */
	evilHome: ["fine. but this isn't over."],
	/** Petted out of it. */
	calmPetted: [
		"...ok. ok. that's nice. i'm sorry.",
		"i don't know what came over me.",
		'prrr. ...i was never evil. you saw nothing.'
	],
	/** Ran out of steam by itself. */
	calmTime: ["i'm tired of being evil. it's a lot of work.", "ok. i'll put it all back. we good?"],
	/** Petted while evil, but not for long enough yet. */
	pettedEvil: ['...that is not going to work.', "don't. stop. ...don't stop.", 'hmph.'],

	/**
	 * What it says instead of the usual, while evil: nothing it does then sounds like the friendly
	 * cat. `EVIL_TWIN` says which ordinary moment each one replaces.
	 */
	grabEvil: ['put me down.', "don't touch me.", 'unhand me.', 'this changes nothing.'],
	dropEvil: ['hmph.', 'whatever.', 'i was going to land here anyway.'],
	throwEvil: ['you will regret thiiis!', "i'll remember thiiis!", 'how dare yoooou!'],
	landEvil: ['missed me.', 'is that all?', 'that just made me angrier.'],
	bonkEvil: ['the wall is next on my list.', 'that wall had it coming.'],
	shakeEvil: ['shaking me only makes it worse.', "you're making this worse.", 'keep shaking. i dare you.'],
	zoomEvil: ['faster. i dare you.', "you can't throw off a grudge."],
	dizzyEvil: ['the room is spinning. evilly.'],
	tabBackEvil: ['oh. you came back. bad idea.', "i didn't miss you. i rearranged things."],
	scrollEvil: ["scrolling won't save you."],
	stirredEvil: ["oh. you're still here."],
	honedEvil: ['enjoy it while it lasts.', 'shiny. for now.', 'the bunny and i will be having words.'],
	missedEvil: ['hahaha.', 'good. i mean... ouch.', 'the bunny agrees with me.'],
	goldResetEvil: ['all that gold. gone. delightful.'],

	petted: [
		'prrrr',
		'oh. oh, that is nice.',
		'right there.',
		"i'm a cat. this is what i'm for.",
		'*purring intensifies*'
	],
	pettedCalm: ['...ok. i forgive you. a bit.', 'fine. you can stay.'],

	nap: ["i'll just rest my eyes for a second...", '*yawn* nap time.', 'wake me if anything happens.'],
	wake: ["huh?! oh, it's you!", "i wasn't sleeping!", 'five more minutes...'],
	wakePoked: ["hey! i wasn't sleeping!"],
	dizzy: ['whoa, slow down!', "i'm getting dizzy!"],

	bored: ['ooh, what is that?', "i'll be right back!", 'brb, exploring', "don't move, i'm just looking at something"],
	nothing: [
		'nothing here. just checking.',
		'this pixel is nice.',
		'found... nothing. great expedition.',
		'i thought i saw something. it was a pixel.',
		"empty. like lgpy's weekend plans.",
		'smells like css over here.'
	],

	scroll: ['whoa, the whole world is moving!'],
	read: [
		'ooh, what are you reading? read it to me.',
		"copying that? it's not even good copy.",
		'highlighting things? lgpy will be thrilled. someone read it.',
		"if that's going in a quote, it's lowercase lgpy."
	],
	/** Hovering a link, with the cat close by. */
	link: [
		"go on, click it. it's fine. mostly.",
		"go on. i'll be right here. probably.",
		"that one goes somewhere. most of lgpy's links do."
	],

	/** The guided tour, once, on a first visit; `tourAgain` when it offers it again later. */
	tourStart: ["want the tour? it won't take long. trust me."],
	tourAgain: ["tour again? nothing's changed. nothing ever does."],
	tourProjects: ['not a lot to see here, huh.'],
	tourHardDrive: ["most of lgpy's projects never leave the hard drive."],
	tourTabbyfin: ["this one's named after me. best one here, obviously."],
	tourRust: ['speaking of hard drives. one rust build folder is most of it.'],
	tourFamily: [
		'family care. meds and appointments for a whole family. their data stays theirs. not even i get a peek.'
	],
	tourBunny: ["lost ark stuff. the bunny lives here. i wouldn't poke it."],
	tourBunnyMet: ['lost ark stuff. and the bunny. you two have met.'],
	tourGithub: ['the rest is on github. well, the ones that escaped.'],
	tourEnd: ["and that's the end. told you it was short."],
	tourSkip: ['fine. it was nearly over anyway.'],
	tourEvil: ['the tour is cancelled. the museum is closed.'],
	tabBack: ["you're back! i counted all the pixels while you were gone. there are so many."],

	/** Leaving the window: sideways is probably another monitor; up is the tabs, down the taskbar. */
	sideways: [
		"ooh, another monitor? what's over there?",
		'take me to the other monitor!',
		"i can't swim that far!",
		'is the other screen nicer than this one?',
		"don't forget about me over here!"
	],
	upwards: ["going up to the tabs? don't open another one. please.", 'the address bar is no place for a cursor.'],
	downwards: ['the taskbar? scary down there.', "don't open anything down there. stay here."],
	gone: ['hey, where did you go?', 'come back!'],
	backSideways: [
		"you're back! how was the other monitor?",
		'welcome back from the other side!',
		'did you bring me anything from the other screen?'
	],
	back: ["you're back!", 'there you are!'],
	/** The cursor leaving, and coming back, while it is cross with you. */
	leftCross: ['good. go.', 'finally, some peace.', "don't hurry back."],
	backCross: ['oh. you again.', 'hmph.', 'i was enjoying that.'],
	rammed: [
		'let me through!',
		"i'm coming!",
		'*bonk*',
		'the screen is in the way!',
		'how do i get through this thing?',
		'one more try!',
		'open up!'
	],
	gaveUp: ["ok. i'll wait right here.", 'the other monitor is so close... and yet.', 'i need a bigger run-up.'],

	/** The bunny and her honing game. */
	discover: ['hm. this bunny looks like a button. what does it do?'],
	discovered: ["+1! i honed her! that's a thing now! your turn, click her!"],
	errand: [
		"brb, it's my turn with the bunny.",
		'hold on, i want to try something.',
		'watch me hone. i have hands now.'
	],
	honed: ['ooh, shiny!', 'the bunny is getting fancy.', 'do me next!', 'careful, lgpy will make this a whole feature.'],
	missed: ['ouch.', 'rng hates you specifically.', 'the bunny felt that.', "it's not you, it's the odds."],
	catMissed: ["i broke it. don't tell lgpy.", 'the bunny gave me a look.', "tentacles aren't great for this."],
	maxed: ["it's maxed. let the bunny rest."],
	goldReset: ['nooo, all that gold!'],

	/** Subtitles from inside the tile, once it has been out and put back. */
	homesick: ["it's very quiet in here.", 'can i come out again?', '[scratching at the tile]'],
	home: ['home sweet home. come get me again sometime?']
} satisfies Record<string, Line[]>;

export type Moment = keyof typeof LINES;

/** While evil, these moments are said with their evil twin instead. */
export const EVIL_TWIN: Partial<Record<Moment, Moment>> = {
	grab: 'grabEvil',
	drop: 'dropEvil',
	throw: 'throwEvil',
	land: 'landEvil',
	bonk: 'bonkEvil',
	shake: 'shakeEvil',
	zoom: 'zoomEvil',
	dizzy: 'dizzyEvil',
	tabBack: 'tabBackEvil',
	scroll: 'scrollEvil',
	stirred: 'stirredEvil',
	honed: 'honedEvil',
	missed: 'missedEvil',
	maxed: 'honedEvil',
	goldReset: 'goldResetEvil',
	poke: 'pokeEvil',
	pokeSpam: 'pokeEvil',
	petted: 'pettedEvil',
	pettedCalm: 'pettedEvil'
};

/** The tab's title while you're in another tab, in order. */
export const TITLES = [
	'come back!',
	'hello? are you there?',
	"it's lonely in this tab",
	'(1) new message from a jellyfish',
	"i promise i'll be good",
	'the bunny is staring at me',
	'lgpy would want you to come back'
];

/** The tab title while it's evil and you're in another tab. */
export const EVIL_TITLES = ['tabbyfin has taken over', 'lgpy.dev (under new management)', 'do not come back'];

/**
 * What it rewrites while evil, by CSS selector on the page; each comes back when it calms
 * down. A selector that matches nothing is skipped.
 */
export const VANDAL: { selector: string; text: string }[] = [
	{ selector: 'header .tagline', text: 'I build stuff (badly)' },
	{ selector: 'header .name', text: "lgpy (tabbyfin's assistant)" },
	{ selector: 'main .label', text: 'Tabbyfin and some other projects' },
	{ selector: 'footer span', text: 'tabbyfin.dev' }
];

/** What it says about each spot on the page it visits. */
export const SPOTS = {
	name: 'lgpy. made me at 2am, probably. it shows.',
	tagline: '"I build stuff." it took lgpy three tries to write that.',
	github: "lgpy's github. mostly unfinished side projects. and me.",
	bunny: 'hi bunny! ...she never talks back.',
	home: "my house! it's bigger on the inside.",
	pill: "an app for keeping a family's meds straight. lgpy still forgets lunch."
};

/** What it says about each tag; a tag without a line here is not a spot. */
export const TAGS: Record<string, string> = {
	rust: "rust. lgpy brings it up every chance there is. it's a whole personality.",
	egui: 'egui. lgpy tried every ui library and settled here. for now.',
	libmpv: "libmpv. that's my engine. vroom.",
	kotlin: 'kotlin. for the android app. the family one.',
	typescript: 'typescript. lgpy likes types. lgpy likes rules in general.',
	'next.js': 'next.js. lgpy would rather not talk about next.js.',
	prisma: 'prisma. like a prism, but with a database inside. i think.'
};

/** What it says when a page upgrade lands, by the honing level it lands at (see LaUtils.svelte). */
export const TIERS: Partial<Record<number, string>> = {
	3: 'the rows are glowing! is that safe?',
	6: 'the headings got buff.',
	9: 'my house is gold now!',
	12: 'gold borders. very tasteful. very lgpy.',
	15: "even the tags are gold. rust is gold now. lgpy's never going to stop talking about it.",
	18: "lgpy's name is shimmering. this is going straight to lgpy's head.",
	21: "there are stars! i've never seen stars!",
	[GOLD]: 'everything is gold... including me?! i could get used to this.'
};

const text = (line: Line) => (typeof line === 'string' ? line : line.text);

/** Midnight to 5am, local time. */
export const isNight = (hour: number) => hour < 5;

function fits(line: Line, mood: Mood, bond: number, night: boolean) {
	if (typeof line === 'string') return true;
	return (
		(!line.mood || line.mood.includes(mood)) && (line.bond === undefined || bond >= line.bond) && (!line.night || night)
	);
}

/**
 * Hands out lines for each moment in a shuffled order, so nothing repeats until every line
 * that fits has been said. Lines that don't fit the mood or bond are skipped, not used up.
 */
export class Script {
	private left = new Map<Moment, Line[]>();

	constructor(
		private random: () => number = Math.random,
		private hour: () => number = () => new Date().getHours()
	) {}

	next(moment: Moment, mood: Mood = 'content', bond = 0): string {
		return this.pick(moment, mood, bond).text;
	}

	/** Like `next`, with the line's act, if it has one. */
	pick(moment: Moment, mood: Mood = 'content', bond = 0): { text: string; act?: Act } {
		if (mood === 'evil') moment = EVIL_TWIN[moment] ?? moment;
		const all: readonly Line[] = LINES[moment];
		const night = isNight(this.hour());
		let left = this.left.get(moment) ?? [];
		let i = left.findIndex((l) => fits(l, mood, bond, night));
		if (i < 0) {
			// Reshuffle everything; if still nothing fits this mood, any line will do.
			left = this.shuffle(all);
			i = left.findIndex((l) => fits(l, mood, bond, night));
			if (i < 0) i = 0;
		}
		const [line] = left.splice(i, 1);
		this.left.set(moment, left);
		return { text: text(line), act: typeof line === 'string' ? undefined : line.act };
	}

	/**
	 * The first line that fits, in the list's own order rather than shuffled: for a greeting that
	 * should be the same one every time. Says nothing and uses nothing up.
	 */
	first(moment: Moment, mood: Mood = 'content', bond = 0): string {
		const all = LINES[moment];
		return text(all.find((l) => fits(l, mood, bond, isNight(this.hour()))) ?? all[0]);
	}

	private shuffle(lines: readonly Line[]): Line[] {
		const out = [...lines];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(this.random() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}
}
