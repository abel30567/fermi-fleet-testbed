/**
 * Exact discrete product over BigInt terms or an integer index range using a
 * divide-and-conquer binary splitting product tree.
 *
 * Because the product of exact integers is always an exact integer, all
 * operations stay in arbitrary-precision BigInt arithmetic with zero rounding
 * error and zero external dependencies.
 *
 * Supported call signatures:
 *
 * 1. Array form: `productBigIntSeries(terms)`
 *    Computes `∏ terms[i]` over an array of `bigint` values using a balanced
 *    binary product tree. The empty product (`[]`) returns `1n`.
 *
 * 2. Range / series form: `productBigIntSeries(start, end, termFn)`
 *    Computes `∏_{k = start}^{end} termFn(k)` where `start` and `end` are
 *    `bigint` bounds and `termFn` is an optional `(k: bigint) => bigint`
 *    callback defaulting to the identity function `k => k`.
 *    - Empty range (`start > end`) returns `1n`.
 *    - For the default identity series (`termFn` omitted), if `start <= 0n && end >= 0n`,
 *      the range contains `0n` and short-circuits to `0n` in O(1) time.
 *
 * @overload
 * @param {readonly bigint[]} terms - Array of BigInt factors to multiply.
 * @returns {bigint} Exact product of all elements in `terms` (`1n` if empty).
 *
 * @overload
 * @param {bigint} start - Inclusive lower bound of the index range.
 * @param {bigint} end - Inclusive upper bound of the index range.
 * @param {(k: bigint) => bigint} [termFn] - Optional term generator returning a BigInt for each index `k` (defaults to `k => k`).
 * @returns {bigint} Exact product over `k` from `start` to `end` (`1n` if `start > end`).
 *
 * @throws {TypeError} If arguments or generated terms have invalid types or arity.
 */
export function productBigIntSeries(first, end, termFn) {
	if (arguments.length === 0) {
		throw new TypeError(
			'productBigIntSeries requires either (terms: bigint[]) or (start: bigint, end: bigint, termFn?: (k: bigint) => bigint)'
		)
	}

	if (Array.isArray(first)) {
		if (arguments.length > 1) {
			throw new TypeError('productBigIntSeries(terms) accepts only a single array argument')
		}

		const len = first.length
		if (len === 0) {
			return 1n
		}

		let hasZero = false
		for (let i = 0; i < len; i++) {
			if (!(i in first) || typeof first[i] !== 'bigint') {
				throw new TypeError(`terms[${i}] must be a BigInt`)
			}
			if (first[i] === 0n) {
				hasZero = true
			}
		}

		if (hasZero) {
			return 0n
		}

		return productArrayTree(first, 0, len - 1)
	}

	if (arguments.length < 2 || arguments.length > 3) {
		throw new TypeError(
			'Range form productBigIntSeries(start, end, termFn?) requires 2 or 3 arguments'
		)
	}

	if (typeof first !== 'bigint') {
		throw new TypeError('start must be a BigInt (or pass an Array of BigInts)')
	}

	if (typeof end !== 'bigint') {
		throw new TypeError('end must be a BigInt')
	}

	if (termFn !== undefined && typeof termFn !== 'function') {
		throw new TypeError('termFn must be a function when provided')
	}

	if (first > end) {
		return 1n
	}

	if (termFn === undefined) {
		if (first <= 0n && end >= 0n) {
			return 0n
		}
		return productRangeIdentityTree(first, end)
	}

	return productRangeFnTree(first, end, termFn)
}

/**
 * Divide-and-conquer binary product tree over `terms[lo..hi]`.
 *
 * @param {readonly bigint[]} terms
 * @param {number} lo
 * @param {number} hi
 * @returns {bigint}
 */
function productArrayTree(terms, lo, hi) {
	if (lo === hi) {
		return terms[lo]
	}
	if (lo + 1 === hi) {
		return terms[lo] * terms[hi]
	}
	const mid = lo + ((hi - lo) >>> 1)
	return productArrayTree(terms, lo, mid) * productArrayTree(terms, mid + 1, hi)
}

/**
 * Binary splitting product tree for the identity range `∏_{k = lo}^{hi} k`.
 * Caller guarantees `lo <= hi` and `0n` is not in `[lo, hi]`.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function productRangeIdentityTree(lo, hi) {
	if (lo === hi) {
		return lo
	}
	if (lo + 1n === hi) {
		return lo * hi
	}
	const mid = lo + ((hi - lo) >> 1n)
	return productRangeIdentityTree(lo, mid) * productRangeIdentityTree(mid + 1n, hi)
}

/**
 * Binary splitting product tree for `∏_{k = lo}^{hi} termFn(k)`.
 * Validates that every invocation of `termFn` returns a BigInt.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @param {(k: bigint) => bigint} termFn
 * @returns {bigint}
 */
function productRangeFnTree(lo, hi, termFn) {
	if (lo === hi) {
		const value = termFn(lo)
		if (typeof value !== 'bigint') {
			throw new TypeError(`termFn(${lo}n) must return a BigInt, got ${typeof value}`)
		}
		return value
	}
	const mid = lo + ((hi - lo) >> 1n)
	const left = productRangeFnTree(lo, mid, termFn)
	const right = productRangeFnTree(mid + 1n, hi, termFn)
	if (left === 0n || right === 0n) {
		return 0n
	}
	return left * right
}
