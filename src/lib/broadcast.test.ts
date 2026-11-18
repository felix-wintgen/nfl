import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({ asset: (p: string) => p }));
const {
	ABOUT,
	LABELS,
	backLine,
	boardTags,
	defOutLine,
	healthTags,
	mainLabel,
	outLine,
	statusKey,
	targetLine,
	teamLine,
	teamOutLine
} = await import('./broadcast.ts');
const { favorite, kickoff, nextGame } = await import('./matchups.ts');

const person = {
	id: 'p',
	name: 'Jaxon Smith-Njigba',
	last: 'Smith-Njigba',
	jersey: 11,
	pos: 'WR',
	rookie: false,
	status: null,
	injury: null,
	practice: null,
	missed_last: false
};
const tstats = {
	targets: 78,
	share: 0.36,
	ay_share: 0.51,
	adot: 10.4,
	rz_targets: 9,
	rz_share: 0.41,
	third_share: 0.45,
	rec: 55,
	rec_yards: 867,
	rec_td: 5,
	games: 7,
	last3_share: 0.35,
	early_share: 0.37
};

describe('lines', () => {
	it('words the main label with its fact, whatever variant comes up', () => {
		for (const r of [0, 0.5, 0.99]) {
			const line = targetLine({ ...person, stats: tstats, labels: ['go_to'], new: [] }, () => r);
			expect(line).toMatch(/36%/);
			expect(line).toMatch(/51% of the air yards/);
		}
	});

	it('says nothing without a label (the facts row covers it)', () => {
		expect(targetLine({ ...person, stats: tstats, labels: [], new: [] })).toBe('');
	});

	it('makes a workhorse with the passing downs a three-down back', () => {
		expect(mainLabel(['workhorse', 'passing_down'])).toBe('three_down');
		const back = {
			...person,
			pos: 'RB',
			stats: {
				carries: 120,
				rush_yards: 540,
				rush_td: 4,
				rb_share: 0.8,
				inside5: 6,
				inside5_share: 0.7,
				targets: 30,
				rec_yards: 200,
				rb_third_share: 0.7,
				games: 7
			},
			labels: ['workhorse', 'passing_down'],
			new: []
		};
		expect(backLine(back, false, () => 0)).toMatch(/three-down back/);
	});

	it('describes the early-down lean by rank', () => {
		const b = {
			record: '4-3',
			ppg: 24,
			ppg_rank: 13,
			early_pass: 0.49,
			early_pass_rank: 26,
			teams: 32,
			games: 7
		} as never;
		expect(teamLine(b, 'Seahawks')).toBe(
			'The Seahawks (4-3) score 24.0 points a game, 13th in the league. They lean on the run on early downs: 49% passes, 26th of 32.'
		);
	});

	it('claims no points before the first game', () => {
		const b = {
			record: '0-0',
			ppg: 0,
			ppg_rank: null,
			early_pass: null,
			early_pass_rank: null,
			games: 0
		};
		expect(teamLine(b as never, 'Patriots')).toBe("The Patriots haven't played yet this season.");
	});

	it("names who's next for an absent go-to guy", () => {
		const o = {
			...person,
			status: 'Out',
			injury: 'Ankle',
			target_share: 0.27,
			carry_share: null,
			dropbacks: null,
			labels: ['go_to'],
			next: { name: 'Rome Odunze', share: 0.18 }
		};
		expect(outLine(o)).toBe(
			'their go-to guy, 27% of the targets · ankle. Next in line: Rome Odunze (18%).'
		);
	});

	it('describes a blocker listed for his snaps', () => {
		const o = {
			...person,
			status: 'Injured reserve',
			injury: 'Knee',
			target_share: 0.06,
			carry_share: null,
			dropbacks: null,
			snap_share: 0.61,
			by_snaps: true,
			labels: []
		};
		expect(outLine(o)).toBe('61% of the offensive snaps · knee.');
	});
});

describe('who is out', () => {
	const d = (status: string, isNew: boolean, last = { season: 2026, week: 8 }) => ({
		...person,
		pos: 'LB',
		status,
		injury: 'Hip',
		snap_share: 0.94,
		last_played: last,
		new: isNew
	});

	it('counts regulars out for sure across offense and defense, and how many are new', () => {
		const board = (out: object[], def: object[]) =>
			({ out, def_out: def }) as unknown as Parameters<typeof teamOutLine>[0];
		const off = { ...person, status: 'Out', new: false };
		expect(
			teamOutLine(
				board([off], [d('Out', true), d('Injured reserve', false), d('Questionable', false)]),
				'Lions'
			)
		).toBe('The Lions are without 3 regulars, 1 of them new this week; 1 more is in doubt.');
		expect(teamOutLine(board([], [d('Out', true)]), 'Lions')).toBe(
			'The Lions are without one regular, new this week.'
		);
		expect(
			teamOutLine(board([], [d('Injured reserve', false), d('Missed last game', false)]), 'Bears')
		).toBe('The Bears are without one regular; 1 more is in doubt.');
		expect(teamOutLine(board([], [d('Questionable', false)]), 'Lions')).toBe(
			'The Lions have one regular in doubt.'
		);
		expect(teamOutLine(board([], []), 'Lions')).toBe('');
	});

	it('says when he last played', () => {
		expect(defOutLine(d('Out', false), 2026)).toBe(
			'94% of the defensive snaps · hip · last played Week 8.'
		);
		expect(defOutLine(d('Out', true), 2026)).toBe(
			'94% of the defensive snaps · hip · played last game.'
		);
		expect(defOutLine(d('Injured reserve', false, { season: 2025, week: 15 }), 2026)).toBe(
			'94% of the defensive snaps · hip · last played in 2025.'
		);
	});

	it('explains a missed last game like the offense does', () => {
		expect(statusKey('Missed last game')).toBe('missed_last');
	});
});

describe('tags', () => {
	it('explains every tag it can show', () => {
		for (const k of Object.keys(ABOUT)) expect(LABELS[k], k).toBeTruthy();
	});

	it('shows last game and practice before the final report', () => {
		const p = { ...person, missed_last: true, practice: 'dnp' as const };
		expect(healthTags(p).map((t) => t.key)).toEqual(['missed_last', 'dnp']);
		expect(healthTags({ ...person, status: 'Questionable' })).toEqual([
			{ key: 'questionable', tone: 'warn' }
		]);
		expect(healthTags({ ...person, status: 'Out' })).toEqual([]); // under "Who's out" instead
	});

	it("lists a board's tags in legend order, statuses included", () => {
		const back = { ...person, pos: 'RB', labels: ['goal_line'], new: [], stats: {} };
		const b = {
			qb: { ...person, pos: 'QB', labels: ['gunslinger'], new: [], returning: true, changed: true },
			targets: [{ ...person, status: 'Questionable', labels: ['go_to'], new: [] }],
			backs: [back],
			backfield: 'lead',
			out: [{ ...person, status: 'Injured reserve', labels: [] }]
		} as never;
		expect(boardTags(b)).toEqual([
			'gunslinger',
			'go_to',
			'lead',
			'goal_line',
			'returning',
			'questionable',
			'injured_reserve'
		]);
	});
});

describe('games', () => {
	it('reads kickoff as Eastern time, with and without daylight saving', () => {
		expect(kickoff({ gameday: '2026-10-29', gametime: '20:15' }).toISOString()).toBe(
			'2026-10-30T00:15:00.000Z'
		);
		expect(kickoff({ gameday: '2026-11-02', gametime: '20:15' }).toISOString()).toBe(
			'2026-11-03T01:15:00.000Z'
		);
	});

	const g = (id: string, day: string, score: number | null) =>
		({
			game_id: id,
			gameday: day,
			gametime: '13:00',
			home_score: score,
			away_score: score
		}) as never;

	it('opens the next unfinished game', () => {
		const games = [
			g('a', '2026-10-29', 20),
			g('b', '2026-11-01', null),
			g('c', '2026-11-02', null)
		];
		expect(nextGame(games, new Date('2026-10-31T12:00:00Z'))?.game_id).toBe('b');
		expect(nextGame(games, new Date('2026-11-01T19:00:00Z'))?.game_id).toBe('b'); // in play
	});

	it('reads the spread from the home side', () => {
		expect(favorite({ spread: 3, home: 'SEA', away: 'CHI' } as never)).toEqual({
			team: 'SEA',
			by: 3
		});
		expect(favorite({ spread: -6.5, home: 'SEA', away: 'CHI' } as never)).toEqual({
			team: 'CHI',
			by: 6.5
		});
	});
});
