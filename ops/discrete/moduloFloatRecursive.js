/**
 * Recursively reduces a non-negative finite dividend `x` modulo a positive finite
 * divisor `d` using binary doubling (divide-and-conquer on powers of two).
 *
 * Because IEEE-754 binary64 multiplication by 2 is exact (without overflow when
 * `d <= x - d`) and subtraction `r - d` for `d <= r < 2 * d` is exact by
 * Sterbenz's Lemma, every reduction step is bit-exact with O(log2(x / d))
 * recursion depth (at most ~2098 frames across the entire IEEE-754 float64 range).
 *
 * @param {number} x Non-negative finite dividend.
 * @param {number} d Positive finite divisor.
 * @returns {number} Exact remainder in `[0, d)`.
 */
function reduceNonNegative(x, d) {
	if (x < d) {
		return x
	}

	// d <= x - d is exact at the boundary (Sterbenz's Lemma) and guarantees
	// 2 * d <= x <= Number.MAX_VALUE, so d * 2 cannot overflow or lose precision.
	const remainder = d <= x - d ? reduceNonNegative(x, d * 2) : x
	return remainder >= d ? remainder - d : remainder
}

/**
 * Computes the discrete Euclidean (non-negative) modulo of two finite IEEE-754
 * float64 numbers using a recursive binary-doubling reduction algorithm.
 *
 * Semantics (Euclidean modulo):
 * - Always returns a non-negative finite number `r` satisfying `0 <= r < |b|`,
 *   with `a = q * b + r` for an integer quotient `q` (unlike JS `%`, which
 *   returns a signed truncated remainder).
 * - Negative zero (`-0`) is normalized to `+0`.
 * - For negative dividends whose tiny remainder causes `|b| - r` to round to
 *   `|b|` in float64 (e.g. `a = -1e-20, b = 1`), the result wraps to `0` so the
 *   half-open invariant `0 <= r < |b|` always holds.
 *
 * @param {number} a Finite IEEE-754 float64 dividend.
 * @param {number} b Finite non-zero IEEE-754 float64 divisor.
 * @returns {number} The Euclidean modulo `a mod b` in `[0, |b|)`.
 * @throws {TypeError} If `a` or `b` is not a primitive `number`.
 * @throws {RangeError} If `a` or `b` is not finite (`NaN`, `±Infinity`), or if `b === 0`.
 */
export function moduloFloatRecursive(a, b) {
	if (typeof a !== 'number') {
		throw new TypeError(`Expected dividend "a" to be a number, got ${typeof a}`)
	}
	if (typeof b !== 'number') {
		throw new TypeError(`Expected divisor "b" to be a number, got ${typeof b}`)
	}
	if (!Number.isFinite(a)) {
		throw new RangeError(`Expected dividend "a" to be a finite number, got ${a}`)
	}
	if (!Number.isFinite(b)) {
		throw new RangeError(`Expected divisor "b" to be a finite number, got ${b}`)
	}
	if (b === 0) {
		throw new RangeError('Divisor "b" must be non-zero')
	}

	const divisor = Math.abs(b)
	const magRemainder = reduceNonNegative(Math.abs(a), divisor)

	if (magRemainder === 0) {
		return 0
	}

	if (a < 0) {
		const euclidean = divisor - magRemainder
		return euclidean === divisor ? 0 : euclidean
	}

	return magRemainder
}
