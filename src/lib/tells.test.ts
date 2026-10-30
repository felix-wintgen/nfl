import { describe as group, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ ensureSeasons: vi.fn(), query: vi.fn() }));
const { describe, dimsOf, pickTells, shrink, SHRINK_PLAYS, tellsSql } = await import('./tells.ts');
const { defaultFilters } = await import('./filters.ts');

// gid bits (pers, align, down, dist, zone): 1 = not grouped.
const row = (
	gid: number,
	dims: Record<string, string | null>,
	n: number,
	p: number,
	lp: number
) => ({
	gid,
	pers: null,
	align: null,
	down: null,
	dist: null,
	zone: null,
	...dims,
	n,
	p,
	ln: 1000,
	lp
});

group('dimsOf', () => {
	it('decodes GROUPING() bitmasks', () => {
		expect(dimsOf(0b00111)).toEqual(['pers', 'align']);
		expect(dimsOf(0b11001)).toEqual(['down', 'dist']);
		expect(dimsOf(0b01010)).toEqual(['pers', 'down', 'zone']);
	});
});

group('shrink', () => {
	it('blends the team rate with SHRINK_PLAYS league-average plays', () => {
		expect(shrink(SHRINK_PLAYS, 0.9, 0.5)).toBeCloseTo(0.7);
		expect(shrink(0, 0.9, 0.5)).toBe(0.5);
	});
});

group('pickTells', () => {
	it('ranks by the shrunk gap, so a big steady sample beats a tiny extreme one', () => {
		const tells = pickTells([
			// 15 plays, all passes: raw gap 50 points, shrunk ~7.
			row(0b11001, { down: '3', dist: '1-2' }, 15, 1, 0.5),
			// 300 plays, 10 points under the league: shrunk ~7.7.
			row(0b00111, { pers: '12', align: 'under center' }, 300, 0.4, 0.5)
		]);
		expect(tells.map((t) => t.dims)).toEqual([
			{ pers: '12', align: 'under center' },
			{ down: '3', dist: '1-2' }
		]);
	});

	it('reports the raw and the expected rate', () => {
		const [t] = pickTells([row(0b00111, { pers: '12', align: 'under center' }, 90, 0.2, 0.5)]);
		expect(t.passRate).toBe(0.2);
		expect(t.expected).toBeCloseTo(0.35);
		expect(t.leaguePassRate).toBe(0.5);
	});

	it('drops gaps that shrink below MIN_GAP and rows with missing grouped values', () => {
		const tells = pickTells([
			// Raw gap 40 points, but only 12 plays: shrunk ~4.7.
			row(0b11001, { down: '3', dist: '1-2' }, 12, 1, 0.6),
			row(0b00111, { pers: '11', align: 'shotgun' }, 300, 0.7, 0.65),
			row(0b00111, { pers: null, align: 'shotgun' }, 300, 0.95, 0.65)
		]);
		expect(tells).toEqual([]);
	});

	it('skips narrower tells pointing the same way as a chosen one', () => {
		const tells = pickTells([
			row(0b00111, { pers: '12', align: 'under center' }, 100, 0.15, 0.45),
			row(0b00011, { pers: '12', align: 'under center', down: '1' }, 40, 0.1, 0.4),
			row(0b00011, { pers: '12', align: 'under center', down: '3' }, 30, 0.8, 0.5)
		]);
		expect(tells.map((t) => t.dims.down)).toEqual([undefined, '3']);
	});

	it('skips wider tells pointing the same way as a chosen one', () => {
		const tells = pickTells([
			row(0b11001, { down: '2', dist: '7-10' }, 260, 0.3, 0.45),
			row(0b01001, { pers: '11', down: '2', dist: '7-10' }, 100, 0.15, 0.45),
			row(0b01011, { pers: '11', down: '2' }, 210, 0.35, 0.47)
		]);
		expect(tells.map((t) => t.dims)).toEqual([{ pers: '11', down: '2', dist: '7-10' }]);
	});
});

group('describe', () => {
	it('reads like a call sheet line', () => {
		const t = { dims: { pers: '12', align: 'under center', down: '1', dist: '7-10' } } as never;
		expect(describe(t)).toBe('12 personnel · under center · 1st & 7-10');
		expect(describe({ dims: { down: '3', zone: 'red zone' } } as never)).toBe(
			'3rd down · red zone'
		);
	});
});

group('tellsSql', () => {
	it('aggregates team and league with the same grouping sets', () => {
		const sql = tellsSql({ ...defaultFilters([2025]), team: 'KC' });
		expect(sql.match(/GROUPING SETS/g)).toHaveLength(2);
		expect(sql).toContain("posteam = 'KC'");
		expect(sql).toContain('t.gid = l.gid');
	});
});
