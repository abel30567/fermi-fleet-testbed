/**
 * Maximum `n` precomputed in the static Pascal's triangle lookup table.
 * Storing only the half-row `0 <= k <= floor(n / 2)` requires 1,089 float64 entries (~8.7 KB).
 */
const PRECOMPUTED_MAX_N = 64

/**
 * Smallest `r = min(k, n - k)` for which C(n, r) is guaranteed to overflow IEEE-754 float64.
 * Since C(1030, 515) ≈ 2.84e308 > Number.MAX_VALUE (≈ 1.7977e308), any r >= 515 overflows.
 */
const OVERFLOW_MIN_R = 515

/**
 * Maximum number of dynamic entries retained in the runtime memoization cache.
 */
const MAX_CACHE_SIZE = 4096

/**
 * Builds the half-row Pascal's triangle table for `0 <= n <= maxN` using exact BigInt
 * arithmetic, then rounds each entry once to IEEE-754 float64 (`Float64Array`).
 *
 * @param {number} maxN
 * @returns {Float64Array[]}
 */
function buildPascalTable(maxN) {
	const table = new Array(maxN + 1)
	let prev = [1n]
	table[0] = Float64Array.from([1])

	for (let n = 1; n <= maxN; n++) {
		const half = n >>> 1
		const currBig = new Array(half + 1)
		const currFloat = new Float64Array(half + 1)

		currBig[0] = 1n
		currFloat[0] = 1

		for (let k = 1; k <= half; k++) {
			const left = prev[k - 1]
			const right = k < prev.length ? prev[k] : prev[prev.length - 1]
			const val = left + right
			currBig[k] = val
			currFloat[k] = Number(val)
		}

		table[n] = currFloat
		prev = currBig
	}

	return table
}

const PASCAL_TABLE = buildPascalTable(PRECOMPUTED_MAX_N)
const memoCache = new Map()

/**
 * Computes the greatest common divisor of two positive safe integers.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gcd(a, b) {
	let x = a
	let y = b
	while (y !== 0) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Computes the binomial coefficient ("n choose k") over IEEE-754 float64 Numbers,
 * using a precomputed half-row Pascal's triangle table for `n <= 64` and a bounded
 * memoization cache backed by an overflow-resistant multiplicative evaluation for larger inputs.
 *
 * For non-negative safe integers `n` and `k`:
 * - Returns `0` when `k > n`.
 * - Returns `1` when `k === 0` or `k === n`.
 * - Returns exact integer values for all results `<= Number.MAX_SAFE_INTEGER`.
 * - Returns `Infinity` when the true value exceeds `Number.MAX_VALUE`.
 *
 * @param {number} n - Total number of items (non-negative safe integer).
 * @param {number} k - Number of chosen items (non-negative safe integer).
 * @returns {number} The binomial coefficient C(n, k) as an IEEE-754 float64 Number.
 * @throws {TypeError} If `n` or `k` is not a number.
 * @throws {RangeError} If `n` or `k` is not a non-negative finite safe integer.
 */
export function combinationsFloatMemo(n, k) {
	if (typeof n !== 'number' || typeof k !== 'number') {
		throw new TypeError('n and k must be numbers')
	}
	if (!Number.isFinite(n) || !Number.isFinite(k)) {
		throw new RangeError('n and k must be finite integers')
	}
	if (!Number.isInteger(n) || !Number.isInteger(k)) {
		throw new RangeError('n and k must be integers')
	}
	if (!Number.isSafeInteger(n) || !Number.isSafeInteger(k)) {
		throw new RangeError('n and k must be safe integers')
	}
	if (n < 0 || k < 0) {
		throw new RangeError('n and k must be non-negative integers')
	}

	if (k > n) {
		return 0
	}

	const r = k < n - k ? k : n - k

	if (r === 0) {
		return 1
	}
	if (r === 1) {
		return n
	}
	if (n <= PRECOMPUTED_MAX_N) {
		return PASCAL_TABLE[n][r]
	}
	if (r >= OVERFLOW_MIN_R) {
		return Infinity
	}

	const key = `${n},${r}`
	const cached = memoCache.get(key)
	if (cached !== undefined) {
		return cached
	}

	let result = 1
	for (let i = 1; i <= r; i++) {
		const num = n - r + i
		const den = i

		if (Number.isSafeInteger(result)) {
			const g = gcd(num, den)
			const numReduced = num / g
			const denReduced = den / g
			result = (result / denReduced) * numReduced
		} else if (result > Number.MAX_VALUE / num) {
			result = (result / den) * num
		} else {
			result = (result * num) / den
		}

		if (!Number.isFinite(result)) {
			result = Infinity
			break
		}
	}

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, result)

	return result
}
