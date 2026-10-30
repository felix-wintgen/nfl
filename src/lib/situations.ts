// Fixed situation rows (overlapping on purpose: "3rd & 3-6" and "red zone" can
// both contain a play) and the SQL that splits plays by row and category for
// the scouted team and the league in one pass.
import { ensureSeasons, query } from './db';
import { situationWhere, teamWhere, where, type Filters, type Side } from './filters';

export const SITUATIONS = [
	{ key: '1st', label: '1st down', cond: 'down = 1' },
	{ key: '2s', label: '2nd & 1-6', cond: 'down = 2 AND ydstogo <= 6' },
	{ key: '2l', label: '2nd & 7+', cond: 'down = 2 AND ydstogo >= 7' },
	{ key: '3s', label: '3rd & 1-2', cond: 'down IN (3, 4) AND ydstogo <= 2' },
	{ key: '3m', label: '3rd & 3-6', cond: 'down IN (3, 4) AND ydstogo BETWEEN 3 AND 6' },
	{ key: '3l', label: '3rd & 7+', cond: 'down IN (3, 4) AND ydstogo >= 7' },
	{ key: 'rz', label: 'Red zone', cond: "field_zone IN ('red zone', 'goal to go')" },
	{ key: '2min', label: 'Two-minute', cond: 'two_min' }
] as const;

/** Base CTE: matching plays, one row per situation they fall into, flagged for the team. */
function base(f: Filters, side: Side, extra: string[]): string {
	const sits = SITUATIONS.map((s) => `CASE WHEN ${s.cond} THEN '${s.key}' END`).join(', ');
	const isTeam = teamWhere(f, side).join(' AND ');
	return `
WITH b AS (
  SELECT *, (${isTeam}) AS is_team, unnest([${sits}]) AS sit
  FROM plays ${where([...situationWhere(f, side), ...extra])}
)`;
}

/** Counts per situation and category; `team` false = league (all teams). */
export function mixSql(f: Filters, side: Side, category: string, extra: string[]): string {
	return `${base(f, side, extra)}
SELECT sit, (${category})::VARCHAR AS cat, count(*) FILTER (WHERE is_team) AS tn, count(*) AS ln
FROM b WHERE sit IS NOT NULL AND (${category}) IS NOT NULL
GROUP BY ALL`;
}

/** Metrics per situation for the team and the league. */
export function metricsSql(
	f: Filters,
	side: Side,
	metrics: Record<string, string>,
	extra: string[]
): string {
	const cols = Object.entries(metrics)
		.map(([k, e]) => `${e} AS "${k}"`)
		.join(', ');
	return `${base(f, side, extra)}
SELECT sit, GROUPING(is_team) = 1 AS league, is_team, count(*) AS n, ${cols}
FROM b WHERE sit IS NOT NULL
GROUP BY GROUPING SETS ((sit, is_team), (sit))`;
}

export interface MixRow {
	sit: string;
	cat: string;
	tn: number;
	ln: number;
}

export type MetricRow = {
	sit: string;
	league: boolean;
	is_team: boolean | null;
	n: number;
} & Record<string, number | null>;

export async function loadMix(
	f: Filters,
	side: Side,
	category: string,
	metrics: Record<string, string>,
	extra: string[] = []
): Promise<{ mix: MixRow[]; metrics: MetricRow[] }> {
	await ensureSeasons(f.seasons);
	const mix = await query<MixRow>(mixSql(f, side, category, extra));
	const m = Object.keys(metrics).length
		? await query<MetricRow>(metricsSql(f, side, metrics, extra))
		: [];
	return { mix, metrics: m };
}
