import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ ensureSeasons: vi.fn(), query: vi.fn() }));
const { baselineSql, summarize } = await import('./baseline.ts');
const { defaultFilters } = await import('./filters.ts');

const metrics = { epa: 'avg(epa)' };

describe('summarize', () => {
	it('compares the team to the league and ranks it among the other teams', () => {
		const rows = [
			{ scope: 'team', grp: null, n: 100, team: null, epa: 0.1 },
			{ scope: 'league', grp: null, n: 3000, team: null, epa: 0.0 },
			{ scope: 'per_team', grp: null, n: 120, team: 'KC', epa: 0.12 },
			{ scope: 'per_team', grp: null, n: 120, team: 'BUF', epa: 0.2 },
			{ scope: 'per_team', grp: null, n: 120, team: 'NYJ', epa: -0.1 },
			{ scope: 'per_team', grp: null, n: 120, team: 'MIA', epa: 0.05 }
		];
		// The team's own per_team row is excluded; its value is ranked against the rest.
		expect(summarize(rows, metrics, 'KC').get(null)).toEqual({
			epa: { value: 0.1, league: 0.0, rank: 2, of: 4, n: 100, leagueN: 3000 }
		});
	});

	it('keeps groups apart', () => {
		const rows = [
			{ scope: 'team', grp: true, n: 60, team: null, epa: 0.2 },
			{ scope: 'team', grp: false, n: 40, team: null, epa: -0.1 },
			{ scope: 'league', grp: true, n: 1800, team: null, epa: 0.05 },
			{ scope: 'league', grp: false, n: 1200, team: null, epa: -0.05 }
		];
		const s = summarize(rows, metrics, 'KC');
		expect(s.get(true)!.epa).toMatchObject({ value: 0.2, league: 0.05, n: 60 });
		expect(s.get(false)!.epa).toMatchObject({ value: -0.1, league: -0.05, n: 40 });
	});

	it('returns nulls when the team has no plays', () => {
		const rows = [{ scope: 'league', grp: null, n: 3000, team: null, epa: 0.0 }];
		expect(summarize(rows, metrics, 'KC').get(null)!.epa).toEqual({
			value: null,
			league: 0,
			rank: null,
			of: 1,
			n: 0,
			leagueN: 3000
		});
	});
});

describe('baselineSql', () => {
	it('scopes the team part by team and the league part by situation only', () => {
		const sql = baselineSql(
			metrics,
			{ ...defaultFilters([2025]), team: 'KC', downs: [3] },
			'defense'
		);
		expect(sql).toContain("FROM plays WHERE defteam = 'KC' AND season IN (2025) AND down IN (3)");
		expect(sql).toContain('FROM plays WHERE season IN (2025) AND down IN (3) GROUP BY ALL');
		expect(sql).toContain('GROUP BY defteam');
	});

	it('applies the games window to the team, the league and every per-team row', () => {
		const sql = baselineSql(
			metrics,
			{ ...defaultFilters([2025]), team: 'KC', games: 'last4' },
			'offense'
		);
		expect(sql.match(/posteam \|\| ' ' \|\| game_id IN/g)).toHaveLength(3);
	});

	it('applies extra conditions and the table to every part', () => {
		const sql = baselineSql(metrics, { ...defaultFilters([2025]), team: 'KC' }, 'offense', {
			groupBy: 'is_pass',
			extra: ['down = 4'],
			table: 'fourth_downs'
		});
		expect(sql.match(/FROM fourth_downs WHERE/g)).toHaveLength(3);
		expect(sql.match(/AND down = 4/g)).toHaveLength(3);
		expect(sql).toContain('GROUP BY posteam, grp');
	});
});
