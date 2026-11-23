/**
 * Precomputed prefix-sum table limit for identity summation over [0n, PRECOMPUTED_LIMIT].
 * Entry i stores sum_{k=0}^{i} k as an exact BigInt.
 */
const PRECOMPUTED_LIMIT = 1024n;
const PRECOMPUTED_SIZE = Number(PRECOMPUTED_LIMIT) + 1;

/** @type {BigInt64Array | bigint[]} */
const IDENTITY_PREFIX_TABLE = (() => {
	const table = new Array(PRECOMPUTED_SIZE);
	let acc = 0n;
	for (let i = 0; i < PRECOMPUTED_SIZE; i++) {
		acc += BigInt(i);
		table[i] = acc;
	}
	return Object.freeze(table);
})();

const MAX_IDENTITY_RANGE_CACHE = 4096;
const MAX_FN_RANGE_CACHE = 4096;
const MAX_FN_BLOCK_CACHE = 4096;
const MAX_FN_TERM_CACHE = 16384;

const BLOCK_SHIFT = 6n;
const BLOCK_SIZE = 1n << BLOCK_SHIFT; // 64n
const BLOCK_MASK = BLOCK_SIZE - 1n; // 63n

/** @type {Map<string, bigint>} */
const identityRangeCache = new Map();

/**
 * Per-function memoization state keyed by pure term function reference.
 * @type {WeakMap<Function, { rangeCache: Map<string, bigint>, blockCache: Map<bigint, bigint>, termCache: Map<bigint, bigint> }>}
 */
const fnMemoCache = new WeakMap();

/**
 * Inserts into a bounded Map, evicting the oldest entry when full.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} limit
 */
function cacheSet(cache, key, value, limit) {
	if (cache.size >= limit && !cache.has(key)) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Retrieves or initializes the memoization state for a term function.
 *
 * @param {(k: bigint) => bigint} termFn
 */
function getFnState(termFn) {
	let state = fnMemoCache.get(termFn);
	if (!state) {
		state = {
			rangeCache: new Map(),
			blockCache: new Map(),
			termCache: new Map(),
		};
		fnMemoCache.set(termFn, state);
	}
	return state;
}

/**
 * Evaluates termFn(k) with exact BigInt validation and per-index memoization.
 *
 * @param {{ termCache: Map<bigint, bigint> }} state
 * @param {(k: bigint) => bigint} termFn
 * @param {bigint} k
 * @returns {bigint}
 */
function evalTerm(state, termFn, k) {
	const cached = state.termCache.get(k);
	if (cached !== undefined) {
		return cached;
	}
	const value = termFn(k);
	if (typeof value !== 'bigint') {
		throw new TypeError(`termFn(${k}n) must return a BigInt, got ${typeof value}`);
	}
	cacheSet(state.termCache, k, value, MAX_FN_TERM_CACHE);
	return value;
}

/**
 * Computes the exact discrete summation sum_{k=start}^{end} termFn(k) over BigInt integers
 * using a precomputed prefix-sum table and multi-level memoization.
 *
 * - When `termFn` is omitted, sums the identity sequence `k` over `[start, end]`:
 *   - Uses a precomputed O(1) prefix-sum table for ranges within `[0n, 1024n]`.
 *   - Uses a memoized exact BigInt arithmetic-series formula for arbitrary ranges.
 * - When a pure `termFn` is provided, uses a per-function WeakMap containing:
 *   - An exact `(start, end)` range-sum cache.
 *   - A 64-element aligned block-sum table (populated only for full blocks inside `[start, end]`).
 *   - A per-index term cache so repeated evaluations of `termFn(k)` are reused.
 * - Never evaluates `termFn(k)` outside `[start, end]`.
 * - Linearity preserves fixed-point scaling (e.g., terms scaled by `10n ** 18n` produce an
 *   exact sum scaled by `10n ** 18n`).
 * - Returns `0n` for an empty range (`start > end`).
 *
 * @param {bigint} start - Inclusive lower bound of the summation index.
 * @param {bigint} end - Inclusive upper bound of the summation index.
 * @param {(k: bigint) => bigint} [termFn] - Optional pure function mapping each BigInt index `k` to a BigInt term. Defaults to the identity `k => k`.
 * @returns {bigint} The exact BigInt sum.
 * @throws {TypeError} If `start` or `end` is not a BigInt, if `termFn` is provided and not a function, or if `termFn` returns a non-BigInt.
 */
export function summationBigIntMemo(start, end, termFn) {
	if (typeof start !== 'bigint') {
		throw new TypeError(`Expected BigInt for start, got ${typeof start}`);
	}
	if (typeof end !== 'bigint') {
		throw new TypeError(`Expected BigInt for end, got ${typeof end}`);
	}
	if (termFn !== undefined && typeof termFn !== 'function') {
		throw new TypeError(`Expected function or undefined for termFn, got ${typeof termFn}`);
	}

	if (start > end) {
		return 0n;
	}

	if (termFn === undefined) {
		if (start >= 0n && end <= PRECOMPUTED_LIMIT) {
			const endSum = IDENTITY_PREFIX_TABLE[Number(end)];
			const beforeStartSum = start === 0n ? 0n : IDENTITY_PREFIX_TABLE[Number(start - 1n)];
			return endSum - beforeStartSum;
		}

		const key = `${start}:${end}`;
		const cached = identityRangeCache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const count = end - start + 1n;
		const sum = (count * (start + end)) / 2n;
		cacheSet(identityRangeCache, key, sum, MAX_IDENTITY_RANGE_CACHE);
		return sum;
	}

	const state = getFnState(termFn);
	const key = `${start}:${end}`;
	const cachedRange = state.rangeCache.get(key);
	if (cachedRange !== undefined) {
		return cachedRange;
	}

	let total = 0n;
	let k = start;
	while (k <= end) {
		if ((k & BLOCK_MASK) === 0n && k + BLOCK_MASK <= end) {
			const blockId = k >> BLOCK_SHIFT;
			let blockSum = state.blockCache.get(blockId);
			if (blockSum === undefined) {
				blockSum = 0n;
				for (let offset = 0n; offset < BLOCK_SIZE; offset++) {
					blockSum += evalTerm(state, termFn, k + offset);
				}
				cacheSet(state.blockCache, blockId, blockSum, MAX_FN_BLOCK_CACHE);
			}
			total += blockSum;
			k += BLOCK_SIZE;
		} else {
			total += evalTerm(state, termFn, k);
			k += 1n;
		}
	}

	cacheSet(state.rangeCache, key, total, MAX_FN_RANGE_CACHE);
	return total;
}
