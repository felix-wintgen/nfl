import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({ asset: (p: string) => p }));
const { withoutParticipation } = await import('./meta.ts');

const meta = {
	manifest: {
		built_at: '2026-10-30T10:00:00+00:00',
		seasons: [
			{ season: 2024, rows: 1, last_week: 22, has_participation: true, has_ftn: true },
			{ season: 2025, rows: 1, last_week: 22, has_participation: true, has_ftn: true },
			{ season: 2026, rows: 1, last_week: 8, has_participation: false, has_ftn: true }
		]
	},
	teams: [],
	seasons: [2024, 2025, 2026],
	defaultSeasons: [2025, 2026]
};

describe('withoutParticipation', () => {
	it('lists the selected seasons that lack participation data', () => {
		expect(withoutParticipation(meta, [2025, 2026])).toEqual([2026]);
		expect(withoutParticipation(meta, [2024, 2025])).toEqual([]);
	});
});
