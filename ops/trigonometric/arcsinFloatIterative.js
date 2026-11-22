/**
 * Computes the principal value of the arcsine (inverse sine) of an IEEE-754
 * float64 number in radians using an iterative Maclaurin series with range
 * reduction.
 *
 * For `|x| <= 0.5`, evaluates the Maclaurin series iteratively:
 *   arcsin(x) = sum_{n=0..inf} ((2n)! / (4^n * (n!)^2 * (2n + 1))) * x^(2n + 1)
 * using the recurrence:
 *   c_0 = x
 *   c_n = c_{n-1} * ((2n - 1) / (2n)) * x^2
 *   term_n = c_n / (2n + 1)
 * until successive terms no longer change the float64 sum.
 *
 * For `0.5 < |x| <= 1`, applies the exact half-angle range reduction identity:
 *   arcsin(x) = sign(x) * (pi / 2 - 2 * arcsin(sqrt((1 - |x|) / 2)))
 * Since `0 <= sqrt((1 - |x|) / 2) < 0.5`, the reduced argument always falls in
 * the fast-convergence region of the Maclaurin series, preserving accuracy even
 * near `±1`.
 *
 * @param {number} x - Input value in the closed domain `[-1, 1]`.
 * @returns {number} The arcsine of `x` in radians, within `[-Math.PI / 2, Math.PI / 2]`,
 *   or `NaN` if `x` is `NaN`. Preserves signed zero (`+0` and `-0`).
 * @throws {TypeError} If `x` is not a primitive JavaScript `number`.
 * @throws {RangeError} If `x < -1` or `x > 1` (including `Infinity` and `-Infinity`).
 *
 * @example
 * arcsinFloatIterative(0) // 0
 * arcsinFloatIterative(0.5) // ~0.5235987755982989 (Math.PI / 6)
 * arcsinFloatIterative(1) // ~1.5707963267948966 (Math.PI / 2)
 */
export function arcsinFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number for x, received ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x)) {
		return NaN
	}

	if (x < -1 || x > 1) {
		throw new RangeError(`Expected x in [-1, 1], received ${x}`)
	}

	// Preserve signed zero (+0 and -0).
	if (x === 0) {
		return x
	}

	const absX = Math.abs(x)
	if (absX <= 0.5) {
		return arcsinSeries(x)
	}

	// Range reduction for |x| > 0.5:
	// arcsin(x) = sign(x) * (pi/2 - 2 * arcsin(sqrt((1 - |x|) / 2)))
	const reduced = Math.sqrt((1 - absX) / 2)
	const magnitude = Math.PI / 2 - 2 * arcsinSeries(reduced)
	return x < 0 ? -magnitude : magnitude
}

/**
 * Maximum number of series terms for `|x| <= 0.5`.
 * At `|x| = 0.5`, terms shrink faster than `(1/4)^n`, reaching below float64
 * machine epsilon (~2.22e-16) within ~27 iterations.
 */
const MAX_ITERATIONS = 100

/**
 * Evaluates the Maclaurin series for arcsin(x) iteratively for `|x| <= 0.5`.
 *
 * @param {number} x - Value with `|x| <= 0.5`.
 * @returns {number} Series approximation of `arcsin(x)` in radians.
 */
function arcsinSeries(x) {
	if (x === 0) {
		return x
	}

	const x2 = x * x
	let coeff = x
	let sum = x

	for (let n = 1; n <= MAX_ITERATIONS; n++) {
		coeff *= ((2 * n - 1) / (2 * n)) * x2
		const term = coeff / (2 * n + 1)
		const nextSum = sum + term
		if (nextSum === sum) {
			break
		}
		sum = nextSum
	}

	return sum
}
