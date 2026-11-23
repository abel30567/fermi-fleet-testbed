/**
 * Maximum integer index precomputed in the static lookup table.
 * Values `0 <= n <= PRECOMPUTED_MAX` are served directly in O(1) time.
 */
const PRECOMPUTED_MAX = 1024

/**
 * Maximum number of dynamically memoized entries retained for `n > PRECOMPUTED_MAX`.
 * Bounded to prevent unbounded memory growth under diverse workloads.
 */
const MAX_MEMO_SIZE = 4096

/**
 * Precomputed lookup table for discrete summations:
 * `PRECOMPUTED_TABLE[n] = sum_{k=1}^{n} k` for `0 <= n <= PRECOMPUTED_MAX`.
 *
 * Built iteratively via recurrence `T[k] = T[k - 1] + k`.
 */
const PRECOMPUTED_TABLE = (() => {
	const table = new Float64Array(PRECOMPUTED_MAX + 1)
	table[0] = 0
	for (let k = 1; k <= PRECOMPUTED_MAX; k++) {
		table[k] = table[k - 1] + k
	}
	return table
})()

/**
 * Dynamic memoization cache for inputs exceeding `PRECOMPUTED_MAX`.
 * Uses Map insertion order for bounded FIFO eviction.
 * @type {Map<number, number>}
 */
const memoCache = new Map()

/**
 * Compute the discrete summation `sum_{k=1}^{n} k` for a validated non-negative integer `n`,
 * using the precomputed table for `n <= PRECOMPUTED_MAX` and a bounded memoization cache
 * for larger values.
 *
 * @param {number} n - Validated finite non-negative integer.
 * @returns {number} Discrete sum `sum_{k=1}^{n} k`.
 */
function lookupOrComputeSum(n) {
	if (n <= PRECOMPUTED_MAX) {
		return PRECOMPUTED_TABLE[n]
	}

	const cached = memoCache.get(n)
	if (cached !== undefined) {
		return cached
	}

	// Divide the even factor first to avoid unnecessary precision loss / intermediate overflow.
	const sum = n % 2 === 0 ? (n / 2) * (n + 1) : n * ((n + 1) / 2)

	if (memoCache.size >= MAX_MEMO_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(n, sum)

	return sum
}

/**
 * Computes the discrete summation `S(n) = sum_{k=1}^{n} k` element-wise over a
 * `Float64Array` of non-negative integers using a precomputed lookup table
 * (`0 <= n <= 1024`) backed by a bounded memoization cache for larger inputs.
 *
 * Does not mutate the input array; always returns a newly allocated `Float64Array`
 * of the same length.
 *
 * @param {Float64Array} input - A `Float64Array` whose elements are finite non-negative integers.
 * @returns {Float64Array} A new `Float64Array` where each entry `i` equals `sum_{k=1}^{input[i]} k`.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `input` is non-finite, negative, or not an integer.
 */
export function summationTypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('summationTypedMemo: expected input to be a Float64Array')
	}

	const len = input.length
	const result = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const raw = input[i]
		if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
			throw new RangeError(
				`summationTypedMemo: element at index ${i} must be a finite non-negative integer, got ${raw}`
			)
		}
		// Normalize -0 to +0 for consistent lookup and cache keys.
		const n = raw === 0 ? 0 : raw
		result[i] = lookupOrComputeSum(n)
	}

	return result
}
