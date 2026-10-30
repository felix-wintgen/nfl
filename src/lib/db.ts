// DuckDB-WASM in the browser. Season files are fetched on demand and exposed
// through the `plays` and `fourth_downs` views; callers only ever see plain JS rows.
// Type-only here: the package is imported lazily so prerendering never loads it.
import type * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { asset } from '$app/paths';

const BUNDLES: duckdb.DuckDBBundles = {
	mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
	eh: { mainModule: ehWasm, mainWorker: ehWorker }
};

let conn: Promise<duckdb.AsyncDuckDBConnection> | null = null;
let db: duckdb.AsyncDuckDB | null = null;
const loaded = new Set<number>();
// Serializes view (re)creation and queries on the single connection.
let queue: Promise<unknown> = Promise.resolve();

function connect(): Promise<duckdb.AsyncDuckDBConnection> {
	conn ??= (async () => {
		const { selectBundle, AsyncDuckDB, VoidLogger } = await import('@duckdb/duckdb-wasm');
		const bundle = await selectBundle(BUNDLES);
		const worker = new Worker(bundle.mainWorker!);
		db = new AsyncDuckDB(new VoidLogger(), worker);
		await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
		return db.connect();
	})();
	return conn;
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
	const run = queue.then(job, job);
	queue = run.catch(() => undefined);
	return run;
}

const TABLES = { plays: 'plays', fourth_downs: 'fourth' } as const;

/** Make sure the `plays` and `fourth_downs` views cover at least these seasons. */
export function ensureSeasons(seasons: number[]): Promise<void> {
	return enqueue(async () => {
		const c = await connect();
		const missing = seasons.filter((s) => !loaded.has(s));
		if (missing.length === 0) return;
		const files = missing.flatMap((s) => Object.values(TABLES).map((t) => `${t}_${s}.parquet`));
		await Promise.all(
			files.map(async (name) => {
				const res = await fetch(asset(`data/${name}` as Parameters<typeof asset>[0]));
				if (!res.ok) throw new Error(`${name}: ${res.status}`);
				await db!.registerFileBuffer(name, new Uint8Array(await res.arrayBuffer()));
			})
		);
		missing.forEach((s) => loaded.add(s));
		const all = [...loaded].sort();
		for (const [view, prefix] of Object.entries(TABLES)) {
			const list = all.map((s) => `'${prefix}_${s}.parquet'`).join(', ');
			await c.query(`CREATE OR REPLACE VIEW ${view} AS SELECT * FROM read_parquet([${list}])`);
		}
	});
}

export type Row = Record<string, string | number | boolean | null>;

/** Run SQL and return plain rows (BIGINT/DECIMAL converted to number). */
export function query<T = Row>(sql: string): Promise<T[]> {
	return enqueue(async () => {
		const c = await connect();
		const table = await c.query(sql);
		return table.toArray().map((r) => {
			const o = r.toJSON() as Record<string, unknown>;
			for (const k in o) if (typeof o[k] === 'bigint') o[k] = Number(o[k]);
			return o as T;
		});
	});
}
