/**
 * Discrete summation over exact {@link BigInt} values using a recursive
 * divide-and-conquer algorithm with O(log n) recursion depth.
 *
 * Because BigInt addition is exact and associative, this function also works
 * directly on fixed-point BigInt values scaled by `10n ** 18n` (or any common
 * scale factor) without floating-point rounding error.
 *
 * Supports two call signatures:
 * 1. Array form: `summationBigIntRecursive(items)`
 *    Sums every `bigint` element in `items`. Returns `0n` for an empty array.
 * 2. Range form: `summationBigIntRecursive(start, end, [termFn])`
 *    Computes `sum_{k = start}^{end} termFn(k)` where `start` and `end` are
 *    inclusive `bigint` bounds and `termFn` defaults to the identity function
 *    `(k) => k`. Returns `0n` when `start > end`.
 *
 * @overload
 * @param {readonly bigint[]} items - Non-sparse array of `bigint` terms to sum.
 * @returns {bigint} Exact sum of all elements in `items` (`0n` if empty).
 *
 * @overload
 * @param {bigint} start - Inclusive lower bound of the summation index.
 * @param {bigint} end - Inclusive upper bound of the summation index.
 * @param {(k: bigint) => bigint} [termFn] - Optional term generator evaluated
 *   at each integer `k` in `[start, end]`. Must return a `bigint`.
 * @returns {bigint} Exact discrete sum over `[start, end]` (`0n` if `start > end`).
 *
 * @throws {TypeError} If argument count is invalid, inputs have wrong types,
 *   the input array is sparse or contains non-`bigint` elements, or `termFn`
 *   is not a function / does not return a `bigint`.
 */
export function summationBigIntRecursive(...args) {
	if (args.length === 1) {
		const [items] = args
		if (!Array.isArray(items)) {
			throw new TypeError(
				`Expected an array of bigints, got ${items === null ? 'null' : typeof items}`
			)
		}
		return sumArrayDivideAndConquer(items, 0, items.length)
	}

	if (args.length === 2 || args.length === 3) {
		const [start, end] = args
		if (typeof start !== 'bigint') {
			throw new TypeError(`Expected start to be a bigint, got ${typeof start}`)
		}
		if (typeof end !== 'bigint') {
			throw new TypeError(`Expected end to be a bigint, got ${typeof end}`)
		}

		const termFn = args.length === 3 ? args[2] : (k) => k
		if (typeof termFn !== 'function') {
			throw new TypeError(`Expected termFn to be a function, got ${typeof termFn}`)
		}

		if (start > end) {
			return 0n
		}
		return sumRangeDivideAndConquer(start, end, termFn)
	}

	throw new TypeError(
		`Expected 1 argument (items) or 2-3 arguments (start, end, [termFn]), got ${args.length}`
	)
}

/**
 * Recursively sums `items[lo .. hi - 1]` by splitting at the midpoint.
 * Guarantees O(log n) call-stack depth.
 *
 * @param {readonly bigint[]} items
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {bigint}
 */
function sumArrayDivideAndConquer(items, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return 0n
	}
	if (len === 1) {
		if (!(lo in items)) {
			throw new TypeError(`Sparse array hole at index ${lo}`)
		}
		const val = items[lo]
		if (typeof val !== 'bigint') {
			throw new TypeError(
				`Expected bigint at index ${lo}, got ${val === null ? 'null' : typeof val}`
			)
		}
		return val
	}

	const mid = lo + Math.floor(len / 2)
	return (
		sumArrayDivideAndConquer(items, lo, mid) +
		sumArrayDivideAndConquer(items, mid, hi)
	)
}

/**
 * Recursively sums `termFn(k)` for `k` in `[lo, hi]` by halving the interval.
 * Guarantees O(log(hi - lo + 1)) call-stack depth.
 *
 * @param {bigint} lo - Inclusive lower bound (`lo <= hi`).
 * @param {bigint} hi - Inclusive upper bound (`lo <= hi`).
 * @param {(k: bigint) => bigint} termFn
 * @returns {bigint}
 */
function sumRangeDivideAndConquer(lo, hi, termFn) {
	if (lo === hi) {
		const val = termFn(lo)
		if (typeof val !== 'bigint') {
			throw new TypeError(
				`Expected termFn(${lo}n) to return a bigint, got ${val === null ? 'null' : typeof val}`
			)
		}
		return val
	}

	const mid = lo + ((hi - lo) >> 1n)
	return (
		sumRangeDivideAndConquer(lo, mid, termFn) +
		sumRangeDivideAndConquer(mid + 1n, hi, termFn)
	)
}
