/**
 * High-precision three-part Cody-Waite split of pi / 2.
 * PIO2_1 and PIO2_2 have their lower 20 significand bits zeroed so that
 * k * PIO2_1 and k * PIO2_2 are exact in IEEE-754 float64 for |k| < 2^20.
 */
const HALF_PI = Math.PI / 2
const PIO2_1 = 1.57079632673412561417e+00
const PIO2_2 = 6.07710050650619224932e-11
const PIO2_3 = 2.02226624879595063154e-21

/** Threshold above which Cody-Waite 20-bit split loses exactness for k * PIO2_1. */
const SERIES_RANGE_LIMIT = 1e6

/** Maximum Maclaurin series terms on the reduced interval [-pi/4, pi/4]. */
const MAX_TERMS = 16

/**
 * Evaluate cos(r) and sin(r) on the reduced interval [-pi/4, pi/4]
 * using their Maclaurin series expansions until machine-epsilon convergence.
 *
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {{ cosR: number, sinR: number }}
 */
function trigSeriesReduced(r) {
	const r2 = r * r
	let cosSum = 1
	let cosTerm = 1
	let sinSum = r
	let sinTerm = r

	for (let n = 1; n <= MAX_TERMS; n++) {
		cosTerm *= -r2 / ((2 * n - 1) * (2 * n))
		cosSum += cosTerm

		sinTerm *= -r2 / ((2 * n) * (2 * n + 1))
		sinSum += sinTerm

		if (Math.abs(cosTerm) <= Number.EPSILON && Math.abs(sinTerm) <= Number.EPSILON) {
			break
		}
	}

	return { cosR: cosSum, sinR: sinSum }
}

/**
 * Compute cosine over a dual number `{ v, d }` representing `v + d * epsilon`
 * (with `epsilon^2 = 0`), propagating the forward-mode derivative:
 *
 *   cos(v + d * epsilon) = cos(v) - sin(v) * d * epsilon
 *
 * Uses Cody-Waite range reduction to `[-pi/4, pi/4]` followed by Maclaurin
 * series evaluation and quadrant symmetry identities (falling back to the
 * built-in Payne-Hanek reduction for |v| > 1e6 to preserve full precision).
 *
 * @param {{ v: number, d: number }} x - Dual number with finite real value `v` and derivative `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: cos(x.v), d: -sin(x.v) * x.d }`.
 * @throws {TypeError} If `x` is not a plain-like object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
export function cosDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('cosDualSeries expects a dual number object { v, d }')
	}

	const { v, d } = x
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('cosDualSeries expects numeric properties v and d')
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('cosDualSeries expects finite numbers for v and d')
	}

	let cosV
	let sinV

	if (Math.abs(v) <= SERIES_RANGE_LIMIT) {
		const k = Math.round(v / HALF_PI)
		const r = ((v - k * PIO2_1) - k * PIO2_2) - k * PIO2_3
		const { cosR, sinR } = trigSeriesReduced(r)
		const quadrant = ((k % 4) + 4) % 4

		if (quadrant === 0) {
			cosV = cosR
			sinV = sinR
		} else if (quadrant === 1) {
			cosV = -sinR
			sinV = cosR
		} else if (quadrant === 2) {
			cosV = -cosR
			sinV = -sinR
		} else {
			cosV = sinR
			sinV = -cosR
		}
	} else {
		cosV = Math.cos(v)
		sinV = Math.sin(v)
	}

	const deriv = -sinV * d
	return {
		v: cosV === 0 ? 0 : cosV,
		d: deriv === 0 ? 0 : deriv,
	}
}
