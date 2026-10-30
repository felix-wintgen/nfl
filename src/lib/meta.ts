// Small JSON files written by pipeline/build.py, loaded once per page.
import { asset } from '$app/paths';

export interface SeasonInfo {
	season: number;
	rows: number;
	last_week: number;
	has_participation: boolean;
	has_ftn: boolean;
}

export interface Manifest {
	built_at: string;
	seasons: SeasonInfo[];
}

export interface Team {
	abbr: string;
	name: string;
	nick: string;
	conf: string;
	division: string;
	color: string;
	color2: string;
	logo: string;
}

export interface Meta {
	manifest: Manifest;
	teams: Team[];
	/** Seasons available, ascending. */
	seasons: number[];
	/** Default selection: the latest season and the one before. */
	defaultSeasons: number[];
}

let cached: Promise<Meta> | null = null;

async function getJson<T>(path: Parameters<typeof asset>[0]): Promise<T> {
	const res = await fetch(asset(path));
	if (!res.ok) throw new Error(`${path}: ${res.status}`);
	return res.json();
}

export function loadMeta(): Promise<Meta> {
	cached ??= (async () => {
		const [manifest, teams] = await Promise.all([
			getJson<Manifest>('data/manifest.json'),
			getJson<Team[]>('data/teams.json')
		]);
		const seasons = manifest.seasons.map((s) => s.season).sort();
		return { manifest, teams, seasons, defaultSeasons: seasons.slice(-2) };
	})();
	cached.catch(() => (cached = null));
	return cached;
}
