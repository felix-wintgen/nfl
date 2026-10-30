// Team value vs. league baseline for a set of metrics under the same filters.
import { ensureSeasons, query } from './db';
import { situationWhere, teamColumn, teamWhere, where, type Filters, type Side } from './filters';

/** Metric name -> SQL aggregate over `plays` (or `table`). */
export type Metrics = Record<string, string>;

export interface Compared {
	value: number | null;
	/** League value over all plays matching the situation (play-weighted). */
	league: number | null;
	/** 1 = highest value among all teams (ties share the better rank). */
	rank: number | null;
	/** Number of teams ranked (including this one). */
	of: number;
	/** Team plays behind `value`. */
	n: number;
	/** League plays behind `league`. */
	leagueN: number;
}

export interface CompareOptions {
	/** Split every number by this SQL expression (e.g. is_pass). */
	groupBy?: string;
	/** Extra conditions applied to team, league and per-team rows alike. */
	extra?: string[];
	/** View to read; defaults to `plays`. */
	table?: 'plays' | 'fourth_downs';
}

/**
 * One query: the team's rows (with games window), the league's rows and each
 * team's value under the situation filters (for ranks).
 */
export function baselineSql(
	metrics: Metrics,
	f: Filters,
	side: Side,
	{ groupBy, extra = [], table = 'plays' }: CompareOptions = {}
): string {
	const cols = Object.entries(metrics)
		.map(([k, expr]) => `${expr} AS "${k}"`)
		.join(', ');
	const g = groupBy ? `${groupBy} AS grp` : 'NULL AS grp';
	const gb = groupBy ? ', grp' : '';
	const sit = where([...situationWhere(f, side), ...extra]);
	const team = where([...teamWhere(f, side), ...extra]);
	return `
WITH
  t AS (SELECT 'team' AS scope, ${g}, count(*) AS n, ${cols} FROM ${table} ${team} GROUP BY ALL),
  l AS (SELECT 'league' AS scope, ${g}, count(*) AS n, ${cols} FROM ${table} ${sit} GROUP BY ALL),
  p AS (SELECT 'per_team' AS scope, ${g}, count(*) AS n, ${cols}, ${teamColumn(side)} AS team
        FROM ${table} ${sit} GROUP BY ${teamColumn(side)}${gb})
SELECT *, NULL AS team FROM t UNION ALL BY NAME
SELECT *, NULL AS team FROM l UNION ALL BY NAME
SELECT * FROM p`;
}

type Raw = { scope: string; grp: unknown; n: number; team: string | null } & Record<
	string,
	unknown
>;

export function summarize(
	rows: Raw[],
	metrics: Metrics,
	team: string
): Map<unknown, Record<string, Compared>> {
	const out = new Map<unknown, Record<string, Compared>>();
	const groups = new Set(rows.map((r) => r.grp));
	for (const g of groups) {
		const inG = rows.filter((r) => r.grp === g);
		const t = inG.find((r) => r.scope === 'team');
		const l = inG.find((r) => r.scope === 'league');
		const others = inG.filter((r) => r.scope === 'per_team' && r.team !== team);
		const res: Record<string, Compared> = {};
		for (const k of Object.keys(metrics)) {
			const value = num(t?.[k]);
			const vals = others.map((r) => num(r[k])).filter((v): v is number => v !== null);
			res[k] = {
				value,
				league: num(l?.[k]),
				rank: value === null ? null : vals.filter((v) => v > value).length + 1,
				of: vals.length + 1,
				n: t?.n ?? 0,
				leagueN: l?.n ?? 0
			};
		}
		out.set(g, res);
	}
	return out;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function compare(
	metrics: Metrics,
	f: Filters,
	side: Side,
	opts: CompareOptions = {}
): Promise<Map<unknown, Record<string, Compared>>> {
	await ensureSeasons(f.seasons);
	const rows = await query<Raw>(baselineSql(metrics, f, side, opts));
	return summarize(rows, metrics, f.team!);
}

/** Common metric expressions over `plays`. */
export const M = {
	passRate: 'avg(is_pass::INT)',
	passOe: 'avg(is_pass::INT - xpass)',
	epa: 'avg(epa)',
	success: 'avg(success::INT)',
	ypp: 'avg(yards_gained)',
	explosive: 'avg(is_explosive::INT)',
	// Early downs in neutral game script: the standard "pass-happy" measure.
	earlyPass:
		'avg(is_pass::INT) FILTER (WHERE down <= 2 AND NOT two_min AND wp BETWEEN 0.2 AND 0.8)',
	noHuddle: 'avg(is_no_huddle::INT)',
	motion: 'avg(is_motion::INT)',
	playAction: 'avg(is_play_action::INT) FILTER (WHERE is_pass)',
	screen: 'avg(is_screen::INT) FILTER (WHERE is_pass)',
	rpo: 'avg(is_rpo::INT)',
	shotgun: 'avg(is_shotgun::INT)'
} as const;

/**
 * QB alignment. Play-by-play flags pistol snaps as shotgun; only participation
 * data (formation) tells them apart. Split pistol out only when every selected
 * season has that data. Otherwise fold it in for every season, so a row means
 * the same thing in each season it covers.
 */
export const alignment = (splitPistol: boolean) =>
	splitPistol
		? `CASE WHEN formation = 'PISTOL' THEN 'pistol' WHEN is_shotgun THEN 'shotgun' ELSE 'under center' END`
		: `CASE WHEN is_shotgun THEN 'shotgun or pistol' ELSE 'under center' END`;
export const ALIGNMENTS = ['shotgun', 'shotgun or pistol', 'pistol', 'under center'] as const;

/** Run lane from left end to right end. */
export const RUN_LANE = `CASE WHEN run_dir = 'middle' THEN 'middle' WHEN run_dir IS NOT NULL AND run_gap IS NOT NULL THEN run_dir || ' ' || run_gap END`;
export const RUN_LANES = [
	'left end',
	'left tackle',
	'left guard',
	'middle',
	'right guard',
	'right tackle',
	'right end'
] as const;

/** Team-only query (no league baseline); `sql` receives the WHERE clause. */
export async function teamQuery<T>(
	f: Filters,
	side: Side,
	extra: string[],
	sql: (whereClause: string) => string
): Promise<T[]> {
	await ensureSeasons(f.seasons);
	return query<T>(sql(where([...teamWhere(f, side), ...extra])));
}

/** Defense-side metric expressions over `plays`. */
export const D = {
	pressure: 'avg(is_pressure::INT) FILTER (WHERE is_pass)',
	sack: 'avg(is_sack::INT) FILTER (WHERE is_pass)',
	qbHit: 'avg(is_qb_hit::INT) FILTER (WHERE is_pass)',
	blitz: 'avg(is_blitz::INT) FILTER (WHERE is_pass)',
	rushers: 'avg(ftn_pass_rushers) FILTER (WHERE is_pass)',
	man: "avg((man_zone = 'MAN_COVERAGE')::INT) FILTER (WHERE is_pass)",
	boxRun: 'avg(ftn_box) FILTER (WHERE NOT is_pass)',
	int: 'avg(is_int::INT) FILTER (WHERE is_pass)',
	firstDown: 'avg(is_first_down::INT)',
	td: 'avg(is_td::INT)',
	comp: 'avg(is_complete::INT) FILTER (WHERE is_pass)'
} as const;

/** Coverage codes in a sensible reading order (man first, then zone shells). */
export const COVERAGES = [
	'COVER_0',
	'COVER_1',
	'2_MAN',
	'COVER_2',
	'COVER_3',
	'COVER_4',
	'COVER_6',
	'COVER_9',
	'COMBO',
	'BLOWN'
] as const;

export function coverageLabel(code: string): string {
	if (code === '2_MAN') return '2-Man';
	if (code.startsWith('COVER_')) return `Cover ${code.slice(6)}`;
	return code.charAt(0) + code.slice(1).toLowerCase();
}
