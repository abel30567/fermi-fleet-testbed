const SMALL_TABLE_LIMIT = 20
const PRECOMPUTED_FACTORIAL_LIMIT = 64
const MAX_CACHED_FACTORIAL = 2048
const MAX_MEMO_ENTRIES = 4096

/**
 * Precomputed factorial table storing `i!` as exact BigInt for `0 <= i <= PRECOMPUTED_FACTORIAL_LIMIT`,
 * dynamically extended on demand up to `MAX_CACHED_FACTORIAL`.
 * @type {bigint[]}
 */
const factorialCache = [1n]
for (let i = 1; i <= PRECOMPUTED_FACTORIAL_LIMIT; i++) {
	factorialCache[i] = factorialCache[i - 1] * BigInt(i)
}

/**
 * Precomputed 2D lookup table of exact permutations P(n, k) for `0 <= k <= n <= SMALL_TABLE_LIMIT`.
 * @type {bigint[][]}
 */
const SMALL_PERM_TABLE = Array.from({ length: SMALL_TABLE_LIMIT + 1 }, (_, n) => {
	const row = new Array(n + 1)
	row[0] = 1n
	for (let k = 1; k <= n; k++) {
		row[k] = row[k - 1] * BigInt(n - k + 1)
	}
	return row
})

/**
 * Bounded LRU memoization cache for computed P(n, k) values outside the small precomputed table.
 * @type {Map<string, bigint>}
 */
const memoCache = new Map()

/**
 * Returns `n!` from the precomputed/dynamically extended factorial table.
 * Caller must ensure `0 <= n <= MAX_CACHED_FACTORIAL`.
 * @param {number} n
 * @returns {bigint}
 */
function getFactorial(n) {
	for (let i = factorialCache.length; i <= n; i++) {
		factorialCache[i] = factorialCache[i - 1] * BigInt(i)
	}
	return factorialCache[n]
}

/**
 * Computes the exact integer product `lo * (lo + 1) * ... * hi` using binary splitting
 * for balanced BigInt multiplication.
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function productRange(lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return lo
	if (hi - lo <= 16n) {
		let acc = lo
		for (let x = lo + 1n; x <= hi; x++) {
			acc *= x
		}
		return acc
	}
	const mid = lo + ((hi - lo) >> 1n)
	return productRange(lo, mid) * productRange(mid + 1n, hi)
}

/**
 * Retrieves a value from the bounded LRU memo cache, refreshing its recency.
 * @param {string} key
 * @returns {bigint | undefined}
 */
function getMemoized(key) {
	const value = memoCache.get(key)
	if (value !== undefined) {
		memoCache.delete(key)
		memoCache.set(key, value)
	}
	return value
}

/**
 * Inserts a value into the bounded LRU memo cache, evicting the oldest entry if full.
 * @param {string} key
 * @param {bigint} value
 */
function setMemoized(key, value) {
	if (!memoCache.has(key) && memoCache.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, value)
}

/**
 * Computes the exact number of k-permutations of n distinct items,
 * P(n, k) = n! / (n - k)!, over exact BigInt integers using precomputed
 * small-input and factorial tables together with bounded LRU memoization.
 *
 * Returns `0n` when `k > n >= 0n`, and `1n` when `k === 0n` (including P(0n, 0n) = 1n).
 * When `k` is omitted, defaults to `n` (computing `n!`).
 *
 * @param {bigint} n - Total number of items (non-negative BigInt).
 * @param {bigint} [k=n] - Number of items to arrange (non-negative BigInt).
 * @returns {bigint} Exact permutation count P(n, k) as a BigInt.
 * @throws {TypeError} If `n` or `k` is not a BigInt.
 * @throws {RangeError} If `n` or `k` is negative.
 */
export function permutationsBigIntMemo(n, k = n) {
	if (typeof n !== 'bigint') {
		throw new TypeError('Expected n to be a BigInt')
	}
	if (typeof k !== 'bigint') {
		throw new TypeError('Expected k to be a BigInt')
	}
	if (n < 0n) {
		throw new RangeError('Expected n to be a non-negative BigInt')
	}
	if (k < 0n) {
		throw new RangeError('Expected k to be a non-negative BigInt')
	}

	if (k === 0n) return 1n
	if (k > n) return 0n
	if (k === 1n) return n

	if (n <= BigInt(SMALL_TABLE_LIMIT)) {
		return SMALL_PERM_TABLE[Number(n)][Number(k)]
	}

	const cacheKey = `${n}:${k}`
	const cached = getMemoized(cacheKey)
	if (cached !== undefined) {
		return cached
	}

	let result
	if (n <= BigInt(MAX_CACHED_FACTORIAL)) {
		const nNum = Number(n)
		if (k === n) {
			result = getFactorial(nNum)
		} else if (k >= (n >> 1n)) {
			result = getFactorial(nNum) / getFactorial(nNum - Number(k))
		} else {
			result = productRange(n - k + 1n, n)
		}
	} else {
		result = productRange(n - k + 1n, n)
	}

	setMemoized(cacheKey, result)
	return result
}
