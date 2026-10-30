import { getContext, setContext } from 'svelte';
import type { Meta } from './meta';

// Meta loads asynchronously, so the context holds a getter.
const KEY = Symbol('meta');

export const setMeta = (get: () => Meta) => setContext(KEY, get);
export const getMeta = () => getContext<() => Meta>(KEY)();
