/**
 * Fixed-point scaling factor (10^18) for callers representing fractional
 * vector components as scaled BigInts. Because vector addition is linear,
 * `(x * SCALE) + (y * SCALE) === (x + y) * SCALE` holds exactly without
 * rescaling or rounding loss.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Recursively computes element-wise BigInt vector addition over the inclusive
 * index range `[lo, hi]` using binary divide-and-conquer.
 *
 * @param {readonly bigint[]} a - First input vector.
 * @param {readonly bigint[]} b - Second input vector.
 * @param {bigint[]} out - Pre-allocated output vector.
 * @param {number} lo - Inclusive lower index bound.
 * @param {number} hi - Inclusive upper index bound.
 * @throws {TypeError} If any element in `[lo, hi]` of `a` or `b` is not a BigInt.
 */
function addRangeRecursive(a, b, out, lo, hi) {
	if (lo === hi) {
		const va = a[lo]
		const vb = b[lo]
		if (typeof va !== 'bigint') {
			throw new TypeError(`Expected BigInt at a[${lo}], received ${typeof va}`)
		}
		if (typeof vb !== 'bigint') {
			throw new TypeError(`Expected BigInt at b[${lo}], received ${typeof vb}`)
		}
		out[lo] = va + vb
		return
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	addRangeRecursive(a, b, out, lo, mid)
	addRangeRecursive(a, b, out, mid + 1, hi)
}

/**
 * Computes the exact element-wise sum of two BigInt vectors (`a + b`) using
 * a binary divide-and-conquer recursive algorithm.
 *
 * Scaling:
 * - Operates directly on exact `BigInt` integers with zero precision loss.
 * - Also preserves fixed-point scaling (`SCALE = 10n ** 18n`) exactly when
 *   callers supply fixed-point scaled BigInt vectors.
 *
 * Algorithm:
 * - Recursively splits the index interval `[lo, hi]` at the midpoint `mid`
 *   into `[lo, mid]` and `[mid + 1, hi]` until reaching single-element base
 *   cases (`lo === hi`), validating and summing each pair into a pre-allocated
 *   output array.
 * - Time complexity: O(n).
 * - Auxiliary call-stack depth: O(log n), avoiding stack overflow even on
 *   very large vectors.
 *
 * @param {readonly bigint[]} a - First vector of BigInt elements.
 * @param {readonly bigint[]} b - Second vector of BigInt elements (must match `a.length`).
 * @returns {bigint[]} A new vector where `result[i] === a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function vectorAddBigIntRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError(`Expected first argument 'a' to be an Array, received ${typeof a}`)
	}
	if (!Array.isArray(b)) {
		throw new TypeError(`Expected second argument 'b' to be an Array, received ${typeof b}`)
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector dimension mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	const n = a.length
	if (n === 0) {
		return []
	}

	const out = new Array(n)
	addRangeRecursive(a, b, out, 0, n - 1)
	return out
}
