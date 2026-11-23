const PRECOMPUTED_MAX_N = 66
const MAX_MEMO_SIZE = 4096
const MAX_FINITE_HALF_K = 514
const LN_MAX_VALUE_BOUND = 710

/**
 * Precomputed half-rows of Pascal's triangle for 0 <= n <= PRECOMPUTED_MAX_N.
 * Row n stores C(n, k) for 0 <= k <= floor(n / 2), computed via BigInt so each
 * Float64 entry is the exact nearest IEEE-754 double.
 * @type {Float64Array[]}
 */
const PASCAL_TABLE = (() => {
	const table = new Array(PRECOMPUTED_MAX_N + 1)
	let prev = [1n]
	table[0] = Float64Array.from([1])

	for (let n = 1; n <= PRECOMPUTED_MAX_N; n++) {
		const half = (n >> 1) + 1
		const curr = new Array(half)
		const row = new Float64Array(half)
		curr[0] = 1n
		row[0] = 1

		for (let k = 1; k < half; k++) {
			const left = prev[k - 1]
			const right = k < prev.length ? prev[k] : prev[n - 1 - k]
			const val = left + right
			curr[k] = val
			row[k] = Number(val)
		}

		table[n] = row
		prev = curr
	}

	return table
})()

/**
 * Bounded memoization cache for combinations with n > PRECOMPUTED_MAX_N.
 * @type {Map<string, number>}
 */
const MEMO_CACHE = new Map()

/**
 * Compute C(n, k) for validated non-negative integer inputs n and k.
 * Uses the precomputed Pascal table for n <= PRECOMPUTED_MAX_N and a bounded
 * memoization table backed by exact BigInt arithmetic for larger n.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function combinationsScalar(n, k) {
	if (k > n) return 0
	const r = k <= n - k ? k : n - k
	if (r === 0) return 1
	if (r === 1) return n

	if (n <= PRECOMPUTED_MAX_N) {
		return PASCAL_TABLE[n][r]
	}

	// For r >= 515, C(n, r) >= C(2r, r) >= C(1030, 515) > Number.MAX_VALUE.
	if (r > MAX_FINITE_HALF_K) return Infinity
	// Since C(n, r) >= (n / r)^r, r * ln(n / r) > 710 guarantees Float64 overflow.
	if (r * Math.log(n / r) > LN_MAX_VALUE_BOUND) return Infinity

	const key = `${n}:${r}`
	const cached = MEMO_CACHE.get(key)
	if (cached !== undefined) return cached

	const bn = BigInt(n)
	let acc = 1n
	for (let i = 1; i <= r; i++) {
		acc = (acc * (bn - BigInt(r - i))) / BigInt(i)
	}
	const result = Number(acc)

	if (MEMO_CACHE.size >= MAX_MEMO_SIZE) {
		const oldestKey = MEMO_CACHE.keys().next().value
		MEMO_CACHE.delete(oldestKey)
	}
	MEMO_CACHE.set(key, result)
	return result
}

/**
 * Computes discrete binomial coefficients C(ns[i], ks[i]) element-wise over
 * Float64Array inputs using a precomputed Pascal's triangle table and bounded
 * memoization cache.
 *
 * Each element pair (n, k) must consist of finite non-negative integers.
 * Returns 0 when k > n, and Infinity when the exact result exceeds Number.MAX_VALUE.
 *
 * @param {Float64Array} ns - Array of non-negative integer population sizes (n).
 * @param {Float64Array} ks - Array of non-negative integer selection sizes (k).
 * @returns {Float64Array} A new Float64Array of element-wise binomial coefficients C(n, k).
 * @throws {TypeError} If either `ns` or `ks` is not a Float64Array.
 * @throws {RangeError} If `ns` and `ks` have different lengths, or contain negative, non-integer, or non-finite values.
 */
export function combinationsTypedMemo(ns, ks) {
	if (!(ns instanceof Float64Array)) {
		throw new TypeError('ns must be a Float64Array')
	}
	if (!(ks instanceof Float64Array)) {
		throw new TypeError('ks must be a Float64Array')
	}
	const len = ns.length
	if (len !== ks.length) {
		throw new RangeError(
			`ns and ks must have the same length (received ${len} and ${ks.length})`,
		)
	}

	const out = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const n = ns[i]
		const k = ks[i]
		if (!Number.isInteger(n) || n < 0) {
			throw new RangeError(
				`ns[${i}] must be a non-negative integer (received ${n})`,
			)
		}
		if (!Number.isInteger(k) || k < 0) {
			throw new RangeError(
				`ks[${i}] must be a non-negative integer (received ${k})`,
			)
		}
		out[i] = combinationsScalar(n === 0 ? 0 : n, k === 0 ? 0 : k)
	}

	return out
}
