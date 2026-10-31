// The upcoming week's spotting boards, written by pipeline/matchup.py.
import { asset } from '$app/paths';

export interface Person {
	id: string;
	name: string;
	last: string;
	jersey: number | null;
	pos: string | null;
	rookie: boolean;
	/** Injury report status this week ("Questionable", "Doubtful" …), if listed. */
	status: string | null;
	injury: string | null;
	/** Until the team's final injury report is out: this week's practice and whether he missed last game. */
	practice: 'dnp' | 'limited' | null;
	missed_last: boolean;
}

export interface QbStats {
	dropbacks: number;
	attempts: number;
	completions: number;
	pass_yards: number;
	pass_td: number;
	ints: number;
	sacks: number;
	adot: number;
	deep_rate: number;
	sack_rate: number;
	int_rate: number;
	run_rate: number;
	rush_yards: number;
	rush_ypg: number;
	rush_td: number;
	games: number;
}

export interface TargetStats {
	targets: number;
	share: number;
	ay_share: number;
	adot: number;
	rz_targets: number;
	rz_share: number;
	third_share: number;
	rec: number;
	rec_yards: number;
	rec_td: number;
	games: number;
	last3_share: number;
	early_share: number;
}

export interface BackStats {
	carries: number;
	rush_yards: number;
	rush_td: number;
	rb_share: number;
	inside5: number;
	inside5_share: number;
	targets: number;
	rec_yards: number;
	rb_third_share: number;
	games: number;
}

export interface Player<S> extends Person {
	stats: S;
	labels: string[];
	/** Labels earned since last week's board. */
	new: string[];
}

export interface OutPlayer extends Person {
	status: string;
	target_share: number | null;
	carry_share: number | null;
	dropbacks: number | null;
	labels: string[];
	next?: { name: string; share: number };
}

export interface Board {
	team: string;
	record: string;
	ppg: number;
	ppg_rank: number | null;
	epa_rank: number | null;
	early_pass: number | null;
	early_pass_rank: number | null;
	teams: number | null;
	games: number;
	/** changed: someone else played QB last game; returning: he's back from an injury. */
	qb: (Player<QbStats> & { changed: boolean; returning: boolean }) | null;
	targets: Player<TargetStats>[];
	backs: Player<BackStats>[];
	backfield: 'workhorse' | 'lead' | 'committee';
	out: OutPlayer[];
	/** The team's final injury report (game statuses) isn't out yet. */
	report_pending: boolean;
}

export interface Game {
	game_id: string;
	game_type: string;
	gameday: string;
	weekday: string;
	/** Kickoff, Eastern time ("20:15"). */
	gametime: string | null;
	away: string;
	home: string;
	away_score: number | null;
	home_score: number | null;
	/** Points the home team is favored by (negative: the away team is). */
	spread: number | null;
	total: number | null;
	implied: { home: number; away: number } | null;
	home_win_prob: number | null;
	div_game: boolean;
	roof: string | null;
	temp: number | null;
	wind: number | null;
	stadium: string | null;
	away_coach: string | null;
	home_coach: string | null;
	away_rest: number | null;
	home_rest: number | null;
	boards: { away: Board; home: Board };
}

export interface Matchups {
	season: number;
	week: number;
	games: Game[];
}

let cached: Promise<Matchups | null> | null = null;

/** null when there's no upcoming week (offseason) or the file is missing. */
export function loadMatchups(): Promise<Matchups | null> {
	cached ??= fetch(asset('data/matchups.json'))
		.then((r) => (r.ok ? (r.json() as Promise<Matchups>) : null))
		.catch(() => null);
	return cached;
}

/** Kickoff as a Date; gametime is Eastern time, with or without daylight saving. */
export function kickoff(g: Pick<Game, 'gameday' | 'gametime'>): Date {
	const [y, mo, d] = g.gameday.split('-').map(Number);
	const [h, mi] = (g.gametime ?? '13:00').split(':').map(Number);
	// Guess EST, then correct by the actual New York offset at that instant.
	const guess = new Date(Date.UTC(y, mo - 1, d, h + 5, mi));
	const ny = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' }));
	const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
	const offsetH = (utc.getTime() - ny.getTime()) / 3_600_000;
	return new Date(Date.UTC(y, mo - 1, d, h + offsetH, mi));
}

export const finished = (g: Game) => g.home_score !== null && g.away_score !== null;

/** The game to open by default: the next one not yet finished (in play counts), else the first. */
export function nextGame(games: Game[], now = new Date()): Game | undefined {
	const live = 4 * 3_600_000;
	return (
		games.find((g) => !finished(g) && kickoff(g).getTime() + live > now.getTime()) ??
		games.find((g) => !finished(g)) ??
		games[0]
	);
}

/** "Seattle by 3" / "pick'em", from the home team's point of view of nflverse spread_line. */
export function favorite(g: Game): { team: string; by: number } | null {
	if (g.spread === null) return null;
	if (g.spread === 0) return { team: '', by: 0 };
	return g.spread > 0 ? { team: g.home, by: g.spread } : { team: g.away, by: -g.spread };
}

export function gameFor(m: Matchups | null, team: string): Game | undefined {
	return m?.games.find((g) => g.home === team || g.away === team);
}
