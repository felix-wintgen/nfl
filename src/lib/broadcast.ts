// Broadcast-style lines for the spotting board. The pipeline decides the
// labels (pipeline/matchup.py); this file only words them. Each label has a
// few variants, picked at random: the wording changes, the facts don't.
import { ordinal } from './format';
import type { BackStats, Board, OutPlayer, Person, Player, QbStats, TargetStats } from './matchups';

export type Rng = () => number;

export const LABELS: Record<string, string> = {
	gunslinger: 'Gunslinger',
	quick_game: 'Quick game',
	dual_threat: 'Dual threat',
	under_siege: 'Under siege',
	turnover_watch: 'Turnover watch',
	careful: 'Careful with the ball',
	go_to: 'Go-to guy',
	deep_threat: 'Deep threat',
	red_zone: 'Red-zone target',
	security_blanket: 'Security blanket',
	on_the_rise: 'On the rise',
	workhorse: 'Workhorse',
	three_down: 'Three-down back',
	lead: 'Lead back',
	passing_down: 'Passing-down back',
	goal_line: 'Goal-line back',
	rookie: 'Rookie',
	returning: 'Back from injury',
	changed: 'New starter',
	questionable: 'Questionable',
	doubtful: 'Doubtful',
	out: 'Out',
	injured_reserve: 'Injured reserve',
	missed_last: 'Missed last game',
	dnp: 'Did not practice',
	limited: 'Limited in practice'
};

/** What each tag means, in plain words; the bars match pipeline/matchup.py. Order = legend order. */
export const ABOUT: Record<string, string> = {
	gunslinger: 'Throws deep: 8.8+ air yards per pass on average.',
	quick_game: 'Gets the ball out short: 6.3 air yards per pass or less.',
	dual_threat: 'Runs a lot: 12%+ of his plays are runs or scrambles, or 30+ rushing yards a game.',
	under_siege: 'Sacked on 9%+ of his dropbacks.',
	turnover_watch: 'Intercepted on 3%+ of his throws.',
	careful: 'Intercepted on 1.2% of his throws or fewer.',
	go_to: "25%+ of the team's targets in the games he played.",
	deep_threat: "Targeted 13+ yards downfield on average, with 15%+ of the team's air yards.",
	red_zone: "30%+ of the team's targets inside the 20.",
	security_blanket:
		'A tight end or back the QB leans on: 15%+ of the targets, mostly short, and 18%+ on third down.',
	on_the_rise: 'His share of the targets over the last 3 games is well above his earlier share.',
	workhorse: 'Gets 76%+ of the running back carries in the games he played.',
	three_down: 'A workhorse who also gets the passing-down work.',
	lead: 'Gets the most running back carries, but not enough to be a workhorse.',
	passing_down: "Gets 60%+ of the backfield's third-down targets.",
	goal_line: "Gets 60%+ of the backs' carries inside the 5.",
	rookie: 'First NFL season.',
	returning: 'Missed recent games injured and is expected to start again.',
	changed: "Expected to start, but didn't start last game.",
	questionable: "On this week's injury report as questionable: may or may not play.",
	doubtful: "On this week's injury report as doubtful: unlikely to play.",
	out: 'Ruled out for this game.',
	injured_reserve: 'On injured reserve: out for at least several weeks.',
	// Shown only until the final injury report; rates from 2022–2025 (last practice day of the week).
	missed_last:
		"Ruled out or inactive for his team's last game; this week's final injury report isn't out yet. Such players sat again 52% of the time: 98% when still not practicing, 3% when practicing fully.",
	dnp: "Didn't practice this week; the final injury report isn't out yet. Such players sat 75% of the time, 98% if they also missed the last game.",
	limited:
		"Limited in practice this week; the final injury report isn't out yet. Such players sat 25% of the time."
};

/** "Injured reserve" → "injured_reserve", the key for LABELS and ABOUT. */
export const statusKey = (status: string) => status.toLowerCase().replaceAll(' ', '_');

/**
 * Health tags next to a name: questionable or doubtful (players ruled out are under
 * "Who's out"), and before the final report, last game and practice.
 */
export function healthTags(p: Person): { key: string; tone?: 'warn' }[] {
	const out: { key: string; tone?: 'warn' }[] = [];
	if (p.status === 'Questionable' || p.status === 'Doubtful')
		out.push({ key: statusKey(p.status), tone: 'warn' });
	if (p.missed_last) out.push({ key: 'missed_last', tone: 'warn' });
	if (p.practice === 'dnp') out.push({ key: 'dnp', tone: 'warn' });
	if (p.practice === 'limited') out.push({ key: 'limited' });
	return out;
}

/** Every tag a board shows, in legend order. */
export function boardTags(b: Board): string[] {
	const used = new Set<string>();
	const person = (p: Person) => {
		if (p.rookie) used.add('rookie');
		healthTags(p).forEach((t) => used.add(t.key));
	};
	if (b.qb) {
		person(b.qb);
		if (b.qb.returning) used.add('returning');
		else if (b.qb.changed) used.add('changed');
		tags(b.qb.labels).forEach((l) => used.add(l));
	}
	for (const t of b.targets) {
		person(t);
		tags(t.labels).forEach((l) => used.add(l));
	}
	b.backs.forEach((bk, i) => {
		person(bk);
		tags(bk.labels, i === 0 && b.backfield === 'lead').forEach((l) => used.add(l));
	});
	for (const o of b.out) used.add(statusKey(o.status));
	return Object.keys(ABOUT).filter((k) => used.has(k));
}

const p = (v: number) => `${Math.round(v * 100)}%`;
const n1 = (v: number) => v.toFixed(1);

function pick<T>(options: T[], rng: Rng): T {
	return options[Math.floor(rng() * options.length) % options.length];
}

type Line<S> = (pl: Player<S>) => string;

const QB: Record<string, Line<QbStats>[]> = {
	gunslinger: [
		(q) => `He'll let it rip: ${n1(q.stats.adot)} air yards per throw.`,
		(q) => `A gunslinger. ${p(q.stats.deep_rate)} of his passes travel 20+ yards in the air.`,
		(q) =>
			`No checkdown merchant: ${q.last} pushes it downfield, ${n1(q.stats.adot)} air yards a throw.`
	],
	quick_game: [
		(q) => `Gets the ball out quick: just ${n1(q.stats.adot)} air yards per throw.`,
		() => `Death by paper cuts: short, fast, on time.`,
		(q) =>
			`The quick game is the game plan. ${q.last} averages ${n1(q.stats.adot)} air yards a throw.`
	],
	dual_threat: [
		(q) => `Dangerous with his legs: ${Math.round(q.stats.rush_ypg)} rushing yards a game.`,
		(q) =>
			`A dual threat: ${q.stats.rush_yards} rushing yards${q.stats.rush_td ? ` and ${q.stats.rush_td} rushing TD${q.stats.rush_td === 1 ? '' : 's'}` : ''} this season.`,
		(q) =>
			`When the pocket breaks down, ${q.last} takes off: ${q.stats.rush_yards} yards on the ground.`
	],
	under_siege: [
		(q) => `Under siege all year: sacked on ${p(q.stats.sack_rate)} of dropbacks.`,
		(q) => `The line hasn't protected him: ${q.stats.sacks} sacks already.`,
		(q) => `Watch the pass rush: ${q.last} has gone down ${q.stats.sacks} times.`
	],
	turnover_watch: [
		(q) => `Turnover watch: ${q.stats.ints} interceptions on ${q.stats.attempts} attempts.`,
		(q) => `He's been loose with the ball: ${q.stats.ints} picks this season.`,
		(q) => `Interceptions have been a story: ${q.stats.ints} of them already.`
	],
	careful: [
		(q) => `Protects the football: ${q.stats.ints} INT on ${q.stats.attempts} attempts.`,
		(q) =>
			`Takes care of the ball: ${q.stats.ints} interception${q.stats.ints === 1 ? '' : 's'} all season.`,
		(q) => `${q.last} doesn't give it away: ${q.stats.ints} INT in ${q.stats.attempts} throws.`
	]
};

const TARGET: Record<string, Line<TargetStats>[]> = {
	go_to: [
		(t) => `His go-to guy: ${p(t.stats.share)} of the targets${airYards(t)}.`,
		(t) =>
			`Everything runs through ${t.last}: ${t.stats.targets} targets, ${p(t.stats.share)} of the team's${airYards(t)}.`,
		(t) => `The engine of this passing game: ${p(t.stats.share)} of the targets${airYards(t)}.`
	],
	deep_threat: [
		(t) => `The deep threat: ${n1(t.stats.adot)} yards downfield per target.`,
		(t) =>
			`Takes the top off the defense: ${p(t.stats.ay_share)} of the air yards on ${p(t.stats.share)} of the targets.`,
		(t) => `If they take a shot, it's to ${t.last}: ${n1(t.stats.adot)} air yards per target.`
	],
	red_zone: [
		(t) => `Inside the 20, look for ${t.last}: ${p(t.stats.rz_share)} of red-zone targets.`,
		(t) => `Their red-zone weapon: ${t.stats.rz_targets} targets inside the 20.`,
		(t) => `When they get close, it's ${t.last}: ${p(t.stats.rz_share)} of the red-zone looks.`
	],
	security_blanket: [
		(t) => `The security blanket: ${p(t.stats.third_share)} of third-down targets.`,
		(t) => `On third down, the QB looks for ${t.last}.`,
		(t) =>
			`Reliable, short and steady: ${n1(t.stats.adot)} yards per target, ${p(t.stats.third_share)} of third-down looks.`
	],
	on_the_rise: [
		(t) =>
			`On the rise: ${p(t.stats.last3_share)} of the targets the last three games, up from ${p(t.stats.early_share)}.`,
		(t) =>
			`He's really emerged lately: ${p(t.stats.last3_share)} of the targets in the last three games.`,
		(t) =>
			`Keep an eye on ${t.last}: his role has grown, ${p(t.stats.early_share)} → ${p(t.stats.last3_share)} of the targets.`
	]
};

function airYards(t: Player<TargetStats>): string {
	return t.stats.ay_share >= 0.4 ? ` and ${p(t.stats.ay_share)} of the air yards` : '';
}

const BACK: Record<string, Line<BackStats>[]> = {
	three_down: [
		(b) =>
			`A three-down back: ${p(b.stats.rb_share)} of the carries and the passing-down work too.`,
		(b) =>
			`${b.last} never leaves the field: ${b.stats.carries} carries, ${b.stats.targets} targets.`
	],
	workhorse: [
		(b) => `The workhorse: ${p(b.stats.rb_share)} of the running back carries.`,
		(b) => `A bell cow: ${b.stats.carries} carries, ${p(b.stats.rb_share)} of the backfield work.`,
		(b) => `They lean on ${b.last}: ${b.stats.carries} carries, ${b.stats.rush_yards} yards.`
	],
	lead: [
		(b) => `The lead back, with ${p(b.stats.rb_share)} of the carries.`,
		(b) =>
			`${b.last} gets the bulk of the work: ${b.stats.carries} carries, ${b.stats.rush_yards} yards.`
	],
	passing_down: [
		(b) =>
			`The passing-down back: ${p(b.stats.rb_third_share)} of the backfield's third-down targets.`,
		(b) => `On third down, ${b.last} is the back on the field: ${b.stats.targets} targets so far.`
	],
	goal_line: [
		(b) => `At the goal line it's ${b.last}: ${b.stats.inside5} carries inside the 5.`,
		(b) =>
			`Their hammer near the end zone: ${b.stats.inside5} carries inside the 5, ${b.stats.rush_td} TD.`
	]
};

/**
 * Labels to show, main one first. A workhorse who also has the passing downs
 * is a three-down back; the top back of a non-workhorse backfield is the lead back.
 */
export function tags(labels: string[], lead = false): string[] {
	let out = [...labels];
	if (out.includes('workhorse') && out.includes('passing_down')) {
		out = ['three_down', ...out.filter((l) => l !== 'workhorse' && l !== 'passing_down')];
	}
	if (lead && !out.includes('workhorse') && !out.includes('three_down')) out = ['lead', ...out];
	return out;
}

export const mainLabel = (labels: string[], lead = false): string | undefined =>
	tags(labels, lead)[0];

export function qbLine(q: Player<QbStats>, rng: Rng = Math.random): string {
	const l = mainLabel(q.labels);
	if (l && QB[l]) return pick(QB[l], rng)(q);
	return ''; // the facts row under the name says it already
}

/** Second QB line for a second label (style + risk read best together). */
export function qbSecondLine(q: Player<QbStats>, rng: Rng = Math.random): string | null {
	const l = q.labels[1];
	return l && QB[l] ? pick(QB[l], rng)(q) : null;
}

export function targetLine(t: Player<TargetStats>, rng: Rng = Math.random): string {
	const l = mainLabel(t.labels);
	if (l && TARGET[l]) return pick(TARGET[l], rng)(t);
	return '';
}

export function backLine(b: Player<BackStats>, lead: boolean, rng: Rng = Math.random): string {
	const l = mainLabel(b.labels, lead);
	if (l && BACK[l]) return pick(BACK[l], rng)(b);
	return '';
}

export function backfieldLine(board: Board, rng: Rng = Math.random): string | null {
	if (board.backfield !== 'committee') return null;
	return pick(
		[
			'A committee backfield: nobody gets half the carries.',
			'Running back by committee. Expect a rotation.',
			'No bell cow here: they spread the carries around.'
		],
		rng
	);
}

/** "Seattle (4-3) scores 24.0 a game, 13th. On early downs they lean on the run." */
export function teamLine(b: Board, name: string): string {
	const parts = [`The ${name} (${b.record}) score ${n1(b.ppg)} points a game`];
	if (b.ppg_rank) parts[0] += `, ${ordinal(b.ppg_rank)} in the league`;
	const r = b.early_pass_rank;
	const of = b.teams ?? 32;
	if (r !== null && b.early_pass !== null) {
		parts.push(
			r <= 8
				? `Pass-first on early downs: ${p(b.early_pass)} passes, ${ordinal(r)} most`
				: r > of - 8
					? `They lean on the run on early downs: ${p(b.early_pass)} passes, ${ordinal(r)} of ${of}`
					: `Balanced on early downs: ${p(b.early_pass)} passes`
		);
	}
	return parts.join('. ') + '.';
}

export function outLine(o: OutPlayer): string {
	const role = o.labels.length ? LABELS[mainLabel(o.labels)!]?.toLowerCase() : null;
	const usage =
		o.dropbacks !== null && o.dropbacks >= 30
			? `${o.dropbacks} dropbacks this season`
			: o.target_share !== null && o.target_share >= (o.carry_share ?? 0)
				? `${p(o.target_share)} of the targets`
				: o.carry_share !== null
					? `${p(o.carry_share)} of the RB carries`
					: '';
	const what = [role ? `their ${role}` : null, usage].filter(Boolean).join(', ');
	const next = o.next ? ` Next in line: ${o.next.name} (${p(o.next.share)}).` : '';
	return `${what}${o.injury ? ` · ${o.injury.toLowerCase()}` : ''}.${next}`;
}
