// Team value vs. league baseline for a set of metrics under the same filters.
import { ensureSeasons, query } from './db';
import { situationWhere, teamColumn, teamWhere, where, type Filters, type Side } from './filters';

/** Metric name -> SQL aggregate over `plays`. */
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
}

/**
 * One query: the team's rows (with games window), the league's rows and each
 * team's value under the situation filters (for ranks).
 * `groupBy` optionally splits every number by a column (e.g. is_pass).
 */
export function baselineSql(metrics: Metrics, f: Filters, side: Side, groupBy?: string): string {
	const cols = Object.entries(metrics)
		.map(([k, expr]) => `${expr} AS "${k}"`)
		.join(', ');
	const g = groupBy ? `${groupBy} AS grp` : 'NULL AS grp';
	const gb = groupBy ? ', grp' : '';
	const sit = where(situationWhere(f, side));
	return `
WITH
  t AS (SELECT 'team' AS scope, ${g}, count(*) AS n, ${cols} FROM plays ${where(teamWhere(f, side))} GROUP BY ALL),
  l AS (SELECT 'league' AS scope, ${g}, count(*) AS n, ${cols} FROM plays ${sit} GROUP BY ALL),
  p AS (SELECT 'per_team' AS scope, ${g}, count(*) AS n, ${cols}, ${teamColumn(side)} AS team
        FROM plays ${sit} GROUP BY ${teamColumn(side)}${gb})
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
				n: t?.n ?? 0
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
	groupBy?: string
): Promise<Map<unknown, Record<string, Compared>>> {
	await ensureSeasons(f.seasons);
	const rows = await query<Raw>(baselineSql(metrics, f, side, groupBy));
	return summarize(rows, metrics, f.team!);
}

/** Common metric expressions. */
export const M = {
	passRate: 'avg(is_pass::INT)',
	passOe: 'avg(is_pass::INT - xpass)',
	epa: 'avg(epa)',
	success: 'avg(success::INT)',
	ypp: 'avg(yards_gained)',
	explosive: 'avg(is_explosive::INT)'
} as const;
