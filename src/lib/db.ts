// DuckDB-WASM in the browser. Season files are fetched on demand and exposed
// through the `plays` and `fourth_downs` views; callers only ever see plain JS rows.
// Type-only here: the package is imported lazily so prerendering never loads it.
import type * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { asset } from '$app/paths';
import { writable } from 'svelte/store';

// Self-hosted copy, used when jsDelivr is unreachable. jsDelivr is preferred:
// brotli makes the wasm ~15% smaller and it is cached for a year (Pages: 10 min).
const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
	mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
	eh: { mainModule: ehWasm, mainWorker: ehWorker }
};

export type EngineState =
	| { phase: 'idle' | 'ready' }
	| { phase: 'loading'; bytes: number }
	| { phase: 'error'; message: string };

/** Query engine download/startup state, for a one-time loading notice. */
export const engine = writable<EngineState>({ phase: 'idle' });

let conn: Promise<duckdb.AsyncDuckDBConnection> | null = null;
let db: duckdb.AsyncDuckDB | null = null;
const loaded = new Set<number>();
// Serializes view (re)creation and queries on the single connection.
let queue: Promise<unknown> = Promise.resolve();

/** Download the wasm with progress and hand DuckDB a blob URL, so it is fetched once. */
async function downloadWasm(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		bytes += value.length;
		engine.set({ phase: 'loading', bytes });
	}
	return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/wasm' }));
}

async function start(source: 'cdn' | 'local'): Promise<duckdb.AsyncDuckDBConnection> {
	const m = await import('@duckdb/duckdb-wasm');
	const bundle = await m.selectBundle(source === 'cdn' ? m.getJsDelivrBundles() : LOCAL_BUNDLES);
	// Browsers refuse cross-origin worker scripts, so wrap the CDN one in a same-origin blob.
	const workerUrl =
		source === 'cdn'
			? URL.createObjectURL(
					new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], {
						type: 'text/javascript'
					})
				)
			: bundle.mainWorker!;
	const wasmUrl = await downloadWasm(bundle.mainModule);
	const worker = new Worker(workerUrl);
	try {
		db = new m.AsyncDuckDB(new m.VoidLogger(), worker);
		await db.instantiate(wasmUrl, bundle.pthreadWorker);
		return await db.connect();
	} catch (e) {
		worker.terminate();
		throw e;
	} finally {
		URL.revokeObjectURL(wasmUrl);
	}
}

function connect(): Promise<duckdb.AsyncDuckDBConnection> {
	conn ??= (async () => {
		engine.set({ phase: 'loading', bytes: 0 });
		try {
			const c = await start('cdn').catch(() => start('local'));
			engine.set({ phase: 'ready' });
			return c;
		} catch (e) {
			conn = null; // allow a retry on the next query
			engine.set({ phase: 'error', message: String(e) });
			throw e;
		}
	})();
	return conn;
}

/** Start downloading the engine early (e.g. while the user picks a team). */
export function warmUp(): void {
	connect().catch(() => undefined);
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
