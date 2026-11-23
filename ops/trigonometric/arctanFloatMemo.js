/**
 * Table-driven, precomputed, and memoized arctangent over IEEE-754 float64 numbers.
 *
 * Uses a precomputed 257-entry Float64Array lookup table over [0, 1] at exact
 * binary step size 1/256, combined with argument reduction via odd symmetry,
 * reciprocal identity for |x| > 1, the arctangent subtraction identity, a
 * 4-term odd-power Taylor polynomial for the tiny residual |t| <= 1/512,
 * and a bounded FIFO memoization cache keyed by |x|.
 *
 * @module ops/trigonometric/arctanFloatMemo
 */

const HALF_PI = Math.PI / 2
const QUARTER_PI = Math.PI / 4
const TABLE_SIZE = 256
const SMALL_THRESHOLD = 2 ** -27
const MAX_CACHE_SIZE = 4096

/**
 * Precomputed odd-power Taylor coefficients for arctan(t) on |t| <= 1/512:
 *   arctan(t) = t + t^3 * (-1/3 + t^2 * (1/5 + t^2 * (-1/7 + t^2 * (1/9))))
 * Truncation error is bounded by |t|^11 / 11 < 2^-99 / 11 < 1.5e-31.
 */
const POLY_COEFFS = Object.freeze([-1 / 3, 1 / 5, -1 / 7, 1 / 9])

/**
 * Precompute arctan(x) for a table node x in [0, 1] without calling Math.atan.
 * Applies 4 exact half-angle reductions z -> z / (1 + sqrt(1 + z^2)) so that
 * z < tan(pi/64) < 0.04913, then evaluates the odd-power Taylor series through z^15.
 *
 * @param {number} x - Grid point in [0, 1].
 * @returns {number} High-precision float64 approximation of arctan(x).
 */
function computeTableNode(x) {
	if (x === 0) return 0
	if (x === 1) return QUARTER_PI

	let z = x
	for (let i = 0; i < 4; i++) {
		z = z / (1 + Math.sqrt(1 + z * z))
	}

	const z2 = z * z
	const series =
		z +
		z *
			z2 *
			(-1 / 3 +
				z2 *
					(1 / 5 +
						z2 *
							(-1 / 7 +
								z2 * (1 / 9 + z2 * (-1 / 11 + z2 * (1 / 13 - z2 / 15))))))

	return 16 * series
}

/**
 * Precomputed lookup table storing arctan(k / 256) for k = 0..256.
 * @type {Float64Array}
 */
const ATAN_TABLE = new Float64Array(TABLE_SIZE + 1)
for (let k = 0; k <= TABLE_SIZE; k++) {
	ATAN_TABLE[k] = computeTableNode(k / TABLE_SIZE)
}

/**
 * Bounded FIFO memoization cache mapping positive finite |x| -> arctan(|x|).
 * @type {Map<number, number>}
 */
const memoCache = new Map()

/**
 * Evaluate arctan(u) for u in [0, 1] using the precomputed table and
 * arctangent addition formula:
 *   arctan(u) = arctan(x_k) + arctan((u - x_k) / (1 + u * x_k))
 *
 * @param {number} u - Value in [0, 1].
 * @returns {number} arctan(u) in [0, pi/4].
 */
function evalUnitArctan(u) {
	if (u < SMALL_THRESHOLD) {
		return u
	}

	const idx = Math.round(u * TABLE_SIZE)
	const xk = idx / TABLE_SIZE
	const t = (u - xk) / (1 + u * xk)
	const t2 = t * t

	const residual =
		t +
		t *
			t2 *
			(POLY_COEFFS[0] +
				t2 * (POLY_COEFFS[1] + t2 * (POLY_COEFFS[2] + t2 * POLY_COEFFS[3])))

	return ATAN_TABLE[idx] + residual
}

/**
 * Computes the arctangent (inverse tangent) of an IEEE-754 float64 number in
 * radians in the range [-pi/2, pi/2], using a precomputed lookup table and
 * bounded memoization cache.
 *
 * @param {number} x - Input IEEE-754 float64 number.
 * @returns {number} The arctangent of x in radians, in [-pi/2, pi/2].
 *   Preserves signed zero (-0 -> -0, +0 -> +0), maps +-Infinity to +-pi/2,
 *   and propagates NaN.
 * @throws {TypeError} If x is not of type "number".
 */
export function arctanFloatMemo(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`)
	}

	if (Number.isNaN(x)) {
		return Number.NaN
	}

	if (x === 0) {
		return x
	}

	if (!Number.isFinite(x)) {
		return x > 0 ? HALF_PI : -HALF_PI
	}

	const negative = x < 0
	const absX = negative ? -x : x

	const cached = memoCache.get(absX)
	if (cached !== undefined) {
		return negative ? -cached : cached
	}

	let result
	if (absX > 1) {
		const inv = 1 / absX
		result = inv === 0 ? HALF_PI : HALF_PI - evalUnitArctan(inv)
	} else {
		result = evalUnitArctan(absX)
	}

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(absX, result)

	return negative ? -result : result
}
