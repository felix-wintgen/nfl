// Scouting filters: URL (de)serialization and SQL WHERE clauses for the
// `plays` view. Pure functions, unit-tested in filters.test.ts.

export type Side = 'offense' | 'defense';

export const DOWNS = [1, 2, 3, 4] as const;
export const DIST_BUCKETS = ['1-2', '3-6', '7-10', '11+'] as const;
export const FIELD_ZONES = [
	'own 1-20',
	'own 21-50',
	'opp 49-21',
	'red zone',
	'goal to go'
] as const;
export const SCORE_STATES = ['trailing 9+', 'one score', 'leading 9+'] as const;
export const GAME_WINDOWS = ['all', 'last4', 'last8'] as const;
export const CLOCKS = ['all', 'two_min', 'not_two_min'] as const;
export const VENUES = ['all', 'home', 'away'] as const;
export const SEASON_TYPES = ['all', 'REG', 'POST'] as const;

export type DistBucket = (typeof DIST_BUCKETS)[number];
export type FieldZone = (typeof FIELD_ZONES)[number];
export type ScoreState = (typeof SCORE_STATES)[number];

export interface Filters {
	team: string | null;
	seasons: number[];
	games: (typeof GAME_WINDOWS)[number];
	seasonType: (typeof SEASON_TYPES)[number];
	downs: number[]; // empty = all
	dist: DistBucket[];
	zones: FieldZone[];
	score: ScoreState[];
	clock: (typeof CLOCKS)[number];
	venue: (typeof VENUES)[number];
}

export function defaultFilters(seasons: number[]): Filters {
	return {
		team: null,
		seasons: [...seasons],
		games: 'all',
		seasonType: 'all',
		downs: [],
		dist: [],
		zones: [],
		score: [],
		clock: 'all',
		venue: 'all'
	};
}

const TEAM_RE = /^[A-Z]{2,3}$/;

function list(params: URLSearchParams, key: string): string[] {
	const v = params.get(key);
	return v ? v.split(',').filter(Boolean) : [];
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

function subset<T extends string | number>(values: T[], allowed: readonly T[]): T[] {
	return allowed.filter((a) => values.includes(a));
}

/** Parse URL params; unknown or invalid values fall back to the defaults. */
export function parseFilters(
	params: URLSearchParams,
	available: number[],
	defaults: Filters
): Filters {
	const team = params.get('team');
	const seasons = list(params, 'seasons')
		.map(Number)
		.filter((s) => available.includes(s));
	return {
		team: team && TEAM_RE.test(team) ? team : defaults.team,
		seasons: seasons.length ? [...new Set(seasons)].sort() : defaults.seasons,
		games: oneOf(params.get('games'), GAME_WINDOWS, defaults.games),
		seasonType: oneOf(params.get('stype'), SEASON_TYPES, defaults.seasonType),
		downs: subset(list(params, 'down').map(Number), DOWNS),
		dist: subset(list(params, 'dist') as DistBucket[], DIST_BUCKETS),
		zones: subset(list(params, 'zone') as FieldZone[], FIELD_ZONES),
		score: subset(list(params, 'score') as ScoreState[], SCORE_STATES),
		clock: oneOf(params.get('clock'), CLOCKS, defaults.clock),
		venue: oneOf(params.get('venue'), VENUES, defaults.venue)
	};
}

/** Serialize only the values that differ from the defaults. */
export function serializeFilters(f: Filters, defaults: Filters): URLSearchParams {
	const p = new URLSearchParams();
	const same = (a: unknown[], b: unknown[]) =>
		a.length === b.length && a.every((x, i) => x === b[i]);
	if (f.team) p.set('team', f.team);
	if (!same(f.seasons, defaults.seasons)) p.set('seasons', f.seasons.join(','));
	if (f.games !== defaults.games) p.set('games', f.games);
	if (f.seasonType !== defaults.seasonType) p.set('stype', f.seasonType);
	if (f.downs.length) p.set('down', f.downs.join(','));
	if (f.dist.length) p.set('dist', f.dist.join(','));
	if (f.zones.length) p.set('zone', f.zones.join(','));
	if (f.score.length) p.set('score', f.score.join(','));
	if (f.clock !== defaults.clock) p.set('clock', f.clock);
	if (f.venue !== defaults.venue) p.set('venue', f.venue);
	return p;
}

const str = (v: string) => `'${v.replaceAll("'", "''")}'`;
const inList = (col: string, values: (string | number)[]) =>
	`${col} IN (${values.map((v) => (typeof v === 'number' ? String(v) : str(v))).join(', ')})`;

export const teamColumn = (side: Side) => (side === 'offense' ? 'posteam' : 'defteam');

/**
 * Situation conditions shared by the team and the league baseline: seasons,
 * season type, down, distance, zone, score, clock. `venue` is relative to the
 * scouted side, so it is applied here too (home offense vs. home defense).
 */
export function situationWhere(f: Filters, side: Side): string[] {
	const w: string[] = [];
	if (f.seasons.length) w.push(inList('season', f.seasons));
	if (f.seasonType !== 'all') w.push(`season_type = ${str(f.seasonType)}`);
	if (f.downs.length) w.push(inList('down', f.downs));
	if (f.dist.length) w.push(inList('dist_bucket', f.dist));
	if (f.zones.length) w.push(inList('field_zone', f.zones));
	if (f.score.length) w.push(inList('score_state', f.score));
	if (f.clock === 'two_min') w.push('two_min');
	if (f.clock === 'not_two_min') w.push('NOT two_min');
	if (f.venue !== 'all') {
		// is_home is from the offense's point of view.
		const offenseHome = (f.venue === 'home') === (side === 'offense');
		w.push(offenseHome ? 'is_home' : 'NOT is_home');
	}
	return w;
}

/** Situation conditions plus the scouted team and its games window. */
export function teamWhere(f: Filters, side: Side): string[] {
	if (!f.team || !TEAM_RE.test(f.team)) throw new Error(`invalid team: ${f.team}`);
	const w = [`${teamColumn(side)} = ${str(f.team)}`, ...situationWhere(f, side)];
	if (f.games !== 'all') {
		const n = f.games === 'last4' ? 4 : 8;
		const scope = [`(posteam = ${str(f.team)} OR defteam = ${str(f.team)})`];
		if (f.seasons.length) scope.push(inList('season', f.seasons));
		if (f.seasonType !== 'all') scope.push(`season_type = ${str(f.seasonType)}`);
		// game_id is "YYYY_WW_AWAY_HOME", so it sorts chronologically.
		w.push(
			`game_id IN (SELECT game_id FROM plays WHERE ${scope.join(' AND ')} ` +
				`GROUP BY game_id ORDER BY game_id DESC LIMIT ${n})`
		);
	}
	return w;
}

export const where = (conds: string[]) => (conds.length ? `WHERE ${conds.join(' AND ')}` : '');
