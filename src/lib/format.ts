const dash = '–';

export const pct = (v: number | null, digits = 0) =>
	v === null ? dash : `${(v * 100).toFixed(digits)}%`;

/** Signed percentage points, e.g. "+4.2 pp". */
export const pp = (v: number | null) =>
	v === null ? dash : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} pp`;

export const epa = (v: number | null) =>
	v === null ? dash : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export const num = (v: number | null, digits = 1) => (v === null ? dash : v.toFixed(digits));

/** "1st", "2nd", ... for a percentile turned into a rank out of `of`. */
export function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Below this many plays, numbers are shown greyed out. */
export const SMALL_SAMPLE = 30;

/** nflverse week number as a label: weeks 19–22 are the playoff rounds. */
export function weekLabel(week: number): string {
	const playoffs: Record<number, string> = {
		19: 'wild card round',
		20: 'divisional round',
		21: 'conference championships',
		22: 'Super Bowl'
	};
	return playoffs[week] ?? `week ${week}`;
}
