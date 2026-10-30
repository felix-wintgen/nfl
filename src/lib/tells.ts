// "Tells": situation combinations where an offense's run/pass mix departs most
// from the league in the same combination.
import { ALIGNMENT } from './baseline';
import { ensureSeasons, query } from './db';
import { situationWhere, teamWhere, where, type Filters } from './filters';
import { ordinal } from './format';

export const DIMS = ['pers', 'align', 'down', 'dist', 'zone'] as const;
export type Dim = (typeof DIMS)[number];

const DIM_EXPR: Record<Dim, string> = {
	pers: 'off_personnel',
	align: ALIGNMENT,
	down: 'down',
	dist: 'dist_bucket',
	zone: 'field_zone'
};

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
	passRate: number;
	leaguePassRate: number;
	/** Standard score of the team rate against the league rate at this n. */
	z: number;
}

export const MIN_PLAYS = 12;
export const MIN_GAP = 0.12;

export function tellsSql(f: Filters): string {
	const cols = DIMS.map((d) => `${DIM_EXPR[d]}::VARCHAR AS ${d}`).join(', ');
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
		if (Math.abs(r.p - r.lp) < MIN_GAP) continue;
		const se = Math.sqrt(Math.max(r.lp * (1 - r.lp), 0.01) / r.n);
		candidates.push({
			dims: Object.fromEntries(dims.map((d) => [d, r[d]!])),
			n: r.n,
			passRate: r.p,
			leaguePassRate: r.lp,
			z: (r.p - r.lp) / se
		});
	}
	candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

	// Skip a tell that only narrows an already chosen one in the same direction.
	const chosen: Tell[] = [];
	for (const c of candidates) {
		const redundant = chosen.some(
			(p) =>
				Math.sign(p.z) === Math.sign(c.z) &&
				Object.entries(p.dims).every(([k, v]) => c.dims[k as Dim] === v)
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

export async function loadTells(f: Filters): Promise<Tell[]> {
	await ensureSeasons(f.seasons);
	return pickTells(await query<Row>(tellsSql(f)));
}
