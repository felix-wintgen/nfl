import { describe as group, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ ensureSeasons: vi.fn(), query: vi.fn() }));
const { describe, dimsOf, pickTells, tellsSql } = await import('./tells.ts');
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

group('pickTells', () => {
	it('ranks by how unlikely the gap is, not just its size', () => {
		const tells = pickTells([
			row(0b00111, { pers: '12', align: 'under center' }, 80, 0.2, 0.45),
			row(0b11001, { down: '3', dist: '1-2' }, 15, 0.9, 0.55)
		]);
		expect(tells.map((t) => t.dims)).toEqual([
			{ pers: '12', align: 'under center' },
			{ down: '3', dist: '1-2' }
		]);
	});

	it('drops small gaps and rows with missing grouped values', () => {
		const tells = pickTells([
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
