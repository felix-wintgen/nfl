// "Tells": situation combinations where an offense's run/pass mix departs most
// from the league in the same combination.
import { alignment } from './baseline';
import { ensureSeasons, query } from './db';
import { situationWhere, teamWhere, where, type Filters } from './filters';
import { ordinal } from './format';

export const DIMS = ['pers', 'align', 'down', 'dist', 'zone'] as const;
export type Dim = (typeof DIMS)[number];

const dimExpr = (splitPistol: boolean): Record<Dim, string> => ({
	pers: 'off_personnel',
	align: alignment(splitPistol),
	down: 'down',
	dist: 'dist_bucket',
	zone: 'field_zone'
});

// Combinations a coordinator would actually call out.
export const SETS: Dim[][] = [
	['pers', 'align'],
	['pers', 'down'],
	['align', 'down'],
	['pers', 'align', 'down'],
	['down', 'dist'],
	['pers', 'down', 'dist'],
	['align', 'down', 'dist'],
	['pers', 'zone'],
	['align', 'zone'],
	['down', 'dist', 'zone']
];

export interface Tell {
	dims: Partial<Record<Dim, string>>;
	n: number;
	/** The team's raw pass rate in this situation. */
	passRate: number;
	/** The raw rate pulled toward the league: what to expect next time. */
	expected: number;
	leaguePassRate: number;
}

export const MIN_PLAYS = 12;
/**
 * Shrinkage strength: the team rate is blended with this many league-average
 * plays. Fitted by pipeline/tells_backtest.py (tells from weeks 1-9 predicting
 * weeks 10-18): 75, 65 and 90 for 2023-2025. Without it, the 2023-2025 tells
 * kept only 32-44% of their gap in the second half; with it, 79-105%.
 */
export const SHRINK_PLAYS = 90;
/** Minimum gap between the expected rate and the league rate. */
export const MIN_GAP = 0.05;

export const shrink = (n: number, rate: number, league: number) =>
	(n * rate + SHRINK_PLAYS * league) / (n + SHRINK_PLAYS);

/** `splitPistol`: every selected season has formation data (see `alignment`). */
export function tellsSql(f: Filters, splitPistol: boolean): string {
	const expr = dimExpr(splitPistol);
	const cols = DIMS.map((d) => `${expr[d]}::VARCHAR AS ${d}`).join(', ');
	const sets = SETS.map((s) => `(${s.join(', ')})`).join(', ');
	const agg = (w: string[]) => `
    SELECT GROUPING(${DIMS.join(', ')}) AS gid, ${DIMS.join(', ')}, count(*) AS n, avg(is_pass::INT) AS p
    FROM (SELECT ${cols}, is_pass FROM plays ${where(w)})
    GROUP BY GROUPING SETS (${sets})`;
	const on = DIMS.map((d) => `t.${d} IS NOT DISTINCT FROM l.${d}`).join(' AND ');
	return `
WITH t AS (${agg(teamWhere(f, 'offense'))}),
     l AS (${agg(situationWhere(f, 'offense'))})
SELECT t.*, l.n AS ln, l.p AS lp FROM t JOIN l ON t.gid = l.gid AND ${on}
WHERE t.n >= ${MIN_PLAYS}`;
}

type Row = Record<Dim, string | null> & {
	gid: number;
	n: number;
	p: number;
	ln: number;
	lp: number;
};

/** Dimensions in a grouping set: GROUPING() sets a bit for each dim NOT grouped. */
export function dimsOf(gid: number): Dim[] {
	return DIMS.filter((_, i) => ((gid >> (DIMS.length - 1 - i)) & 1) === 0);
}

export function pickTells(rows: Row[], limit = 8): Tell[] {
	const candidates: Tell[] = [];
	for (const r of rows) {
		const dims = dimsOf(r.gid);
		// A NULL inside a grouped dim means missing data (e.g. no personnel), not "all".
		if (dims.some((d) => r[d] === null)) continue;
		const expected = shrink(r.n, r.p, r.lp);
		if (Math.abs(expected - r.lp) < MIN_GAP) continue;
		candidates.push({
			dims: Object.fromEntries(dims.map((d) => [d, r[d]!])),
			n: r.n,
			passRate: r.p,
			expected,
			leaguePassRate: r.lp
		});
	}
	// Rank by the expected gap: big samples with moderate gaps beat tiny
	// samples with extreme ones, which mostly regress.
	const gap = (t: Tell) => t.expected - t.leaguePassRate;
	candidates.sort((a, b) => Math.abs(gap(b)) - Math.abs(gap(a)));

	// Skip a tell that narrows or widens an already chosen one in the same
	// direction ("1st down" and "1st & 7-10" are the same tell said twice).
	const within = (a: Tell, b: Tell) =>
		Object.entries(a.dims).every(([k, v]) => b.dims[k as Dim] === v);
	const chosen: Tell[] = [];
	for (const c of candidates) {
		const redundant = chosen.some(
			(p) => Math.sign(gap(p)) === Math.sign(gap(c)) && (within(p, c) || within(c, p))
		);
		if (!redundant) chosen.push(c);
		if (chosen.length === limit) break;
	}
	return chosen;
}

export function describe(t: Tell): string {
	const d = t.dims;
	const parts: string[] = [];
	if (d.pers) parts.push(`${d.pers} personnel`);
	if (d.align) parts.push(d.align);
	if (d.down && d.dist) parts.push(`${ordinal(Number(d.down))} & ${d.dist}`);
	else if (d.down) parts.push(`${ordinal(Number(d.down))} down`);
	else if (d.dist) parts.push(`${d.dist} to go`);
	if (d.zone) parts.push(d.zone);
	return parts.join(' · ');
}

export async function loadTells(f: Filters, splitPistol: boolean): Promise<Tell[]> {
	await ensureSeasons(f.seasons);
	return pickTells(await query<Row>(tellsSql(f, splitPistol)));
}
