/**
 * High-precision 4-part Cody-Waite split of pi/2 (fdlibm constants).
 * The first three parts each have 33 significant mantissa bits (20 trailing
 * zero bits), so multiplying by any integer |q| <= 2^20 is exact in IEEE-754
 * double precision.
 */
const HALF_PI = Math.PI / 2
const PIO2_1 = 1.57079632673412561417e+00
const PIO2_2 = 6.07710050630396597660e-11
const PIO2_3 = 2.02226624871116645580e-21
const PIO2_3T = 8.47842766036889956997e-32

/** Maximum |v| for exact 33-bit Cody-Waite range reduction (q <= 2^20). */
const CODY_WAITE_LIMIT = 1_000_000

/** Number of Maclaurin series terms for |r| <= pi/4 (error < 1e-22). */
const SERIES_TERMS = 11

/**
 * Evaluates sin(r) and cos(r) for |r| <= pi/4 via nested Horner Maclaurin series.
 *
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {{ s: number, c: number }} Primal sine and cosine of r.
 */
function sinCosSeriesReduced(r) {
	const r2 = r * r
	let sinPoly = 1
	let cosPoly = 1

	for (let k = SERIES_TERMS; k >= 1; k--) {
		sinPoly = 1 - (r2 * sinPoly) / (2 * k * (2 * k + 1))
		cosPoly = 1 - (r2 * cosPoly) / ((2 * k - 1) * (2 * k))
	}

	return {
		s: r * sinPoly,
		c: cosPoly,
	}
}

/**
 * Computes sin(v) and cos(v) using range reduction and Maclaurin series with
 * quadrant trigonometric identities (falling back to native Payne-Hanek
 * reduction for very large |v| beyond Cody-Waite's exact range).
 *
 * @param {number} v - Finite angle in radians.
 * @returns {{ sinV: number, cosV: number }} Value of sin(v) and cos(v).
 */
function sinCosValue(v) {
	if (Math.abs(v) > CODY_WAITE_LIMIT) {
		return { sinV: Math.sin(v), cosV: Math.cos(v) }
	}

	const q = Math.round(v / HALF_PI)
	const r = (((v - q * PIO2_1) - q * PIO2_2) - q * PIO2_3) - q * PIO2_3T
	const { s, c } = sinCosSeriesReduced(r)

	const quadrant = ((q % 4) + 4) % 4
	switch (quadrant) {
		case 0:
			return { sinV: s, cosV: c }
		case 1:
			return { sinV: c, cosV: -s }
		case 2:
			return { sinV: -s, cosV: -c }
		default:
			return { sinV: -c, cosV: s }
	}
}

/**
 * Computes the trigonometric sine of a dual number `x = { v, d }` representing
 * `v + d*eps` (where `eps^2 = 0`), carrying the forward-mode derivative
 * alongside the value:
 *
 *   sin(v + d*eps) = sin(v) + (d * cos(v)) * eps
 *
 * Uses Cody-Waite range reduction to `[-pi/4, pi/4]`, nested Horner Maclaurin
 * series for `sin` and `cos`, and quadrant angle-addition identities.
 *
 * @param {{ v: number, d: number }} x - Dual number with finite numeric `v` (value) and `d` (derivative).
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: sin(x.v), d: x.d * cos(x.v) }`.
 * @throws {TypeError} If `x` is not a plain object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is not a finite number (`NaN` or `±Infinity`).
 */
export function sinDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number properties v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number properties v and d must be finite numbers')
	}

	const { sinV, cosV } = sinCosValue(v)
	const deriv = d === 0 ? 0 : d * cosV

	return {
		v: sinV === 0 ? 0 : sinV,
		d: deriv === 0 ? 0 : deriv,
	}
}
