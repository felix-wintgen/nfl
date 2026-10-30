// DuckDB-WASM in the browser. Season files are fetched on demand and exposed
// through one `plays` view; callers only ever see plain JS rows.
import * as duckdb from '@duckdb/duckdb-wasm';
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
		const bundle = await duckdb.selectBundle(BUNDLES);
		const worker = new Worker(bundle.mainWorker!);
		db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
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

/** Make sure the `plays` view covers at least these seasons. */
export function ensureSeasons(seasons: number[]): Promise<void> {
	return enqueue(async () => {
		const c = await connect();
		const missing = seasons.filter((s) => !loaded.has(s));
		if (missing.length === 0) return;
		await Promise.all(
			missing.map(async (s) => {
				const res = await fetch(asset(`data/plays_${s}.parquet` as Parameters<typeof asset>[0]));
				if (!res.ok) throw new Error(`plays_${s}.parquet: ${res.status}`);
				await db!.registerFileBuffer(`plays_${s}.parquet`, new Uint8Array(await res.arrayBuffer()));
			})
		);
		missing.forEach((s) => loaded.add(s));
		const files = [...loaded].sort().map((s) => `'plays_${s}.parquet'`);
		await c.query(
			`CREATE OR REPLACE VIEW plays AS SELECT * FROM read_parquet([${files.join(', ')}])`
		);
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
