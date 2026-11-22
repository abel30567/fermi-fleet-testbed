/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order forward-mode derivative) component.
 */

const HALF_PI = Math.PI / 2

/**
 * Threshold below which the Maclaurin series converges to full IEEE 754 double
 * precision within `SERIES_TERMS` terms (at v <= 0.0625, v^2 <= 2^-8, so the
 * truncated tail is well below 2^-80 for both value and derivative).
 */
const SERIES_THRESHOLD = 0.0625

const SERIES_TERMS = 12

/**
 * Precomputed Maclaurin coefficients c_k for arcsin(x) = x * sum_{k=0}^{N-1} c_k (x^2)^k,
 * where c_k = ((2k)! / (4^k * (k!)^2)) / (2k + 1).
 */
const MACLAURIN_COEFFS = (() => {
	const coeffs = new Array(SERIES_TERMS)
	let centralFactor = 1
	coeffs[0] = 1
	for (let k = 1; k < SERIES_TERMS; k++) {
		centralFactor *= (2 * k - 1) / (2 * k)
		coeffs[k] = centralFactor / (2 * k + 1)
	}
	return Object.freeze(coeffs)
})()

/**
 * Adds two dual numbers: (a + b).
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Subtracts two dual numbers: (a - b).
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Multiplies two dual numbers using the product rule.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Divides two dual numbers using the quotient rule.
 * Requires b.v !== 0.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualDiv(a, b) {
	return {
		v: a.v / b.v,
		d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
	}
}

/**
 * Computes the square root of a dual number with a.v > 0.
 * @param {DualNumber} a
 * @returns {DualNumber}
 */
function dualSqrt(a) {
	const root = Math.sqrt(a.v)
	return {
		v: root,
		d: a.d / (2 * root),
	}
}

/**
 * Evaluates sum_{k=lo}^{hi-1} MACLAURIN_COEFFS[k] * z^(k - lo) in dual arithmetic
 * using recursive divide-and-conquer binary splitting, returning both the partial
 * polynomial sum and z^(hi - lo).
 *
 * @param {DualNumber} z - Squared input dual number (x^2).
 * @param {number} lo - Inclusive lower coefficient index.
 * @param {number} hi - Exclusive upper coefficient index.
 * @returns {{ sum: DualNumber, pow: DualNumber }}
 */
function evalSeriesDivideAndConquer(z, lo, hi) {
	if (hi - lo === 1) {
		return {
			sum: { v: MACLAURIN_COEFFS[lo], d: 0 },
			pow: z,
		}
	}
	const mid = (lo + hi) >> 1
	const left = evalSeriesDivideAndConquer(z, lo, mid)
	const right = evalSeriesDivideAndConquer(z, mid, hi)
	return {
		sum: dualAdd(left.sum, dualMul(left.pow, right.sum)),
		pow: dualMul(left.pow, right.pow),
	}
}

/**
 * Evaluates arcsin(x) on [0, 1) using recursive argument reduction:
 * 1. For v > 0.5, applies complementary reflection:
 *      arcsin(x) = pi/2 - 2 * arcsin(sqrt((1 - x) / 2))
 *    which maps v into (0, 0.5) without catastrophic cancellation near 1.
 * 2. For SERIES_THRESHOLD < v <= 0.5, applies the cancellation-free half-angle
 *    identity recursively:
 *      arcsin(x) = 2 * arcsin(x / sqrt(2 * (1 + sqrt(1 - x^2))))
 *    halving v on every recursive call until v <= SERIES_THRESHOLD.
 * 3. For v <= SERIES_THRESHOLD, evaluates the Maclaurin series via recursive
 *    divide-and-conquer binary splitting in dual arithmetic.
 *
 * @param {DualNumber} x - Dual number with 0 <= x.v < 1.
 * @returns {DualNumber}
 */
function arcsinNonNegativeRecursive(x) {
	if (x.v > 0.5) {
		const halfComplement = { v: (1 - x.v) / 2, d: -x.d / 2 }
		const reduced = dualSqrt(halfComplement)
		const sub = arcsinNonNegativeRecursive(reduced)
		return {
			v: HALF_PI - 2 * sub.v,
			d: -2 * sub.d,
		}
	}

	if (x.v > SERIES_THRESHOLD) {
		const xSq = dualMul(x, x)
		const oneMinusXSq = dualSub({ v: 1, d: 0 }, xSq)
		const cosTheta = dualSqrt(oneMinusXSq)
		const twoOnePlusCos = { v: 2 * (1 + cosTheta.v), d: 2 * cosTheta.d }
		const denom = dualSqrt(twoOnePlusCos)
		const halfAngleSin = dualDiv(x, denom)
		const sub = arcsinNonNegativeRecursive(halfAngleSin)
		return {
			v: 2 * sub.v,
			d: 2 * sub.d,
		}
	}

	const z = dualMul(x, x)
	const { sum } = evalSeriesDivideAndConquer(z, 0, SERIES_TERMS)
	return dualMul(x, sum)
}

/**
 * Computes the inverse sine (arcsin) of a dual number `{ v, d }` carrying a
 * forward-mode derivative alongside the primal value:
 *
 *   arcsin({ v, d }) = { v: arcsin(v), d: d / sqrt(1 - v^2) }
 *
 * Uses a recursive divide-and-conquer algorithm combining odd-symmetry reduction,
 * complementary reflection for `|v| > 0.5`, cancellation-free recursive half-angle
 * argument reduction for `0.0625 < |v| <= 0.5`, and divide-and-conquer binary-splitting
 * Maclaurin series evaluation in dual arithmetic for `|v| <= 0.0625`.
 *
 * Boundary & domain semantics:
 * - `|v| > 1` or non-finite `v`: throws `RangeError`.
 * - `v === 1` or `v === -1`:
 *   - `v` output is `Math.PI / 2` (for `v === 1`) or `-Math.PI / 2` (for `v === -1`).
 *   - If `d === 0`, returns `d: 0` (finite constant tangent).
 *   - If `d !== 0`, returns signed `Infinity` (`d > 0 ? Infinity : -Infinity`),
 *     matching `lim_{|v| -> 1-} d / sqrt(1 - v^2)`.
 * - Non-object input or non-numeric `v`/`d`: throws `TypeError`.
 * - `NaN` in `v`/`d` or non-finite `d`: throws `RangeError`.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with `|v| <= 1`.
 * @returns {DualNumber} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` is outside `[-1, 1]`, or if `v` or `d` is `NaN` / non-finite.
 */
export function arcsinDualRecursive(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('arcsinDualRecursive expected a dual number object { v, d }')
	}
	const { v, d } = x
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('arcsinDualRecursive expected numeric v and d properties')
	}
	if (Number.isNaN(v) || Number.isNaN(d)) {
		throw new RangeError('arcsinDualRecursive received NaN component')
	}
	if (!Number.isFinite(v) || Math.abs(v) > 1) {
		throw new RangeError(`arcsinDualRecursive domain error: |v| must be <= 1 (received ${v})`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`arcsinDualRecursive expected finite derivative d (received ${d})`)
	}

	// Handle boundary points |v| === 1 explicitly
	if (v === 1 || v === -1) {
		return {
			v: v === 1 ? HALF_PI : -HALF_PI,
			d: d === 0 ? 0 : d > 0 ? Infinity : -Infinity,
		}
	}

	// Odd symmetry: arcsin(-x) = -arcsin(x)
	if (v < 0) {
		const res = arcsinNonNegativeRecursive({ v: -v, d: -d })
		return { v: -res.v, d: -res.d }
	}

	return arcsinNonNegativeRecursive({ v, d })
}
