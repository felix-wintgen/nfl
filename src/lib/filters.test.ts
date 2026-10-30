import { describe, expect, it } from 'vitest';
import {
	defaultFilters,
	describeFilters,
	parseFilters,
	serializeFilters,
	situationWhere,
	teamWhere,
	type Filters
} from './filters.ts';

const AVAILABLE = [2022, 2023, 2024, 2025, 2026];
const DEFAULTS = defaultFilters([2025, 2026]);

const parse = (qs: string) => parseFilters(new URLSearchParams(qs), AVAILABLE, DEFAULTS);
const withTeam = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULTS, team: 'KC', ...over });

describe('parseFilters', () => {
	it('returns defaults for an empty query', () => {
		expect(parse('')).toEqual(DEFAULTS);
	});

	it('reads every field', () => {
		expect(
			parse(
				'team=BUF&seasons=2024,2023&games=last4&stype=REG&down=3,1&dist=7-10&zone=red+zone&score=one+score&clock=two_min&venue=away'
			)
		).toEqual({
			team: 'BUF',
			seasons: [2023, 2024],
			games: 'last4',
			seasonType: 'REG',
			downs: [1, 3],
			dist: ['7-10'],
			zones: ['red zone'],
			score: ['one score'],
			clock: 'two_min',
			venue: 'away'
		});
	});

	it('drops invalid values instead of passing them to SQL', () => {
		const f = parse(
			"team=KC';DROP&seasons=1999,abc&games=last99&down=0,5&dist=x&zone=moon&clock=now&venue=mars"
		);
		expect(f).toEqual(DEFAULTS);
	});
});

describe('serializeFilters', () => {
	it('omits defaults', () => {
		expect(serializeFilters(DEFAULTS, DEFAULTS).toString()).toBe('');
	});

	it('round-trips through parseFilters', () => {
		const f: Filters = withTeam({
			seasons: [2022],
			games: 'last8',
			downs: [3],
			dist: ['1-2', '11+'],
			zones: ['goal to go'],
			score: ['trailing 9+'],
			clock: 'not_two_min',
			venue: 'home'
		});
		expect(parse(serializeFilters(f, DEFAULTS).toString())).toEqual(f);
	});
});

describe('situationWhere', () => {
	it('only filters seasons by default', () => {
		expect(situationWhere(DEFAULTS, 'offense')).toEqual(['season IN (2025, 2026)']);
	});

	it('builds one condition per filter', () => {
		const f = withTeam({
			downs: [3, 4],
			dist: ['1-2'],
			zones: ['red zone'],
			score: ['one score'],
			clock: 'two_min',
			seasonType: 'POST'
		});
		expect(situationWhere(f, 'offense')).toEqual([
			'season IN (2025, 2026)',
			"season_type = 'POST'",
			'down IN (3, 4)',
			"dist_bucket IN ('1-2')",
			"field_zone IN ('red zone')",
			"score_state IN ('one score')",
			'two_min'
		]);
	});

	it("gives every team its own games window, keyed by the scouted side's team", () => {
		const off = situationWhere(withTeam({ games: 'last8' }), 'offense').at(-1)!;
		const def = situationWhere(withTeam({ games: 'last8' }), 'defense').at(-1)!;
		expect(off).toMatch(/^posteam \|\| ' ' \|\| game_id IN /);
		expect(def).toMatch(/^defteam \|\| ' ' \|\| game_id IN /);
		expect(off).toContain('<= 8');
		// The window is about games, not the scouted team or the situation.
		expect(off).not.toContain("'KC'");
		expect(
			situationWhere(withTeam({ games: 'last8', downs: [3] }), 'offense').at(-1)
		).not.toContain('down');
		expect(situationWhere(withTeam(), 'offense').join(' ')).not.toContain('game_id');
	});

	it('flips venue for the defense', () => {
		expect(situationWhere(withTeam({ venue: 'home' }), 'offense')).toContain('is_home');
		expect(situationWhere(withTeam({ venue: 'home' }), 'defense')).toContain('NOT is_home');
		expect(situationWhere(withTeam({ venue: 'away' }), 'defense')).toContain('is_home');
	});
});

describe('teamWhere', () => {
	it('uses posteam for the offense and defteam for the defense', () => {
		expect(teamWhere(withTeam(), 'offense')[0]).toBe("posteam = 'KC'");
		expect(teamWhere(withTeam(), 'defense')[0]).toBe("defteam = 'KC'");
	});

	it('limits to the last N games of the team', () => {
		const w = teamWhere(withTeam({ games: 'last4' }), 'offense');
		expect(w[0]).toBe("posteam = 'KC'");
		expect(w.at(-1)).toMatch(/^posteam \|\| ' ' \|\| game_id IN /);
		expect(w.at(-1)).toContain('PARTITION BY team ORDER BY game_id DESC) <= 4');
	});

	it('rejects a missing or malformed team', () => {
		expect(() => teamWhere(DEFAULTS, 'offense')).toThrow();
		expect(() => teamWhere(withTeam({ team: "KC' OR 1=1" }), 'offense')).toThrow();
	});
});

describe('describeFilters', () => {
	it('summarizes defaults as the season range', () => {
		expect(describeFilters(DEFAULTS)).toBe('2025–2026');
	});

	it('lists every active filter', () => {
		const f = withTeam({
			seasons: [2022, 2024],
			games: 'last4',
			seasonType: 'REG',
			downs: [3, 4],
			dist: ['1-2'],
			zones: ['red zone'],
			score: ['one score'],
			clock: 'two_min',
			venue: 'away'
		});
		expect(describeFilters(f)).toBe(
			'2022, 2024 · last 4 games · regular season · 3rd/4th down · 1-2 to go · red zone · one score · two-minute · away'
		);
	});
});
