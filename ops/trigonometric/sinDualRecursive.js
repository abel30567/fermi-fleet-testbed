/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (real part).
 * @property {number} d - Tangent / forward-mode derivative (dual part).
 */

// 3-part Cody-Waite split of 2*pi derived from fdlibm's PIO2_1, PIO2_2, PIO2_3.
// TWO_PI_1 and TWO_PI_2 each have 33 significant bits (20 trailing zero bits),
// so multiplying either by an integer |m| < 2^20 is exact in IEEE-754 float64.
const TWO_PI = 2 * Math.PI
const TWO_PI_1 = 4 * 1.57079632673412561417e+00
const TWO_PI_2 = 4 * 6.07710050630396597660e-11
const TWO_PI_3 = 4 * 2.02226624879595063154e-21
const SPLIT_BASE = 1048576 // 2^20

// Angles with |v| <= BASE_THRESHOLD are evaluated via dual-arithmetic Maclaurin
// polynomials whose truncation error is below 1e-19 (well under Number.EPSILON).
const BASE_THRESHOLD = 1 / 16

/**
 * Subtracts two dual numbers: (a.v - b.v, a.d - b.d).
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Multiplies two dual numbers: (a.v * b.v, a.v * b.d + a.d * b.v).
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
 * Scales a dual number by a real constant.
 * @param {DualNumber} a
 * @param {number} s
 * @returns {DualNumber}
 */
function dualScale(a, s) {
	return { v: a.v * s, d: a.d * s }
}

/**
 * Reduces a finite angle in radians into approximately [-pi, pi] using
 * extended-precision Cody-Waite subtraction of multiples of 2*pi.
 * @param {number} v
 * @returns {number}
 */
function reduceAngle(v) {
	const k = Math.round(v / TWO_PI)
	if (k === 0) {
		return v
	}

	if (Math.abs(k) < SPLIT_BASE) {
		return ((v - k * TWO_PI_1) - k * TWO_PI_2) - k * TWO_PI_3
	}

	// Split k into base-2^20 digits so each product with TWO_PI_1 / TWO_PI_2 stays exact.
	const kHi = Math.trunc(k / SPLIT_BASE)
	const kLo = k - kHi * SPLIT_BASE
	const step1 = v - kHi * (SPLIT_BASE * TWO_PI_1) - kLo * TWO_PI_1
	const step2 = step1 - kHi * (SPLIT_BASE * TWO_PI_2) - kLo * TWO_PI_2
	return step2 - k * TWO_PI_3
}

/**
 * Evaluates (sin(u), cos(u)) for a small dual angle u (|u.v| <= BASE_THRESHOLD)
 * using Horner-form Maclaurin series strictly in dual arithmetic.
 * @param {DualNumber} u
 * @returns {{ sin: DualNumber, cos: DualNumber }}
 */
function sinCosDualBase(u) {
	const u2 = dualMul(u, u)

	// sin(u) = u * (1 - u^2 * (1/6 - u^2 * (1/120 - u^2 * (1/5040 - u^2 / 362880))))
	const sinInner1 = dualSub({ v: 1 / 5040, d: 0 }, dualScale(u2, 1 / 362880))
	const sinInner2 = dualSub({ v: 1 / 120, d: 0 }, dualMul(u2, sinInner1))
	const sinInner3 = dualSub({ v: 1 / 6, d: 0 }, dualMul(u2, sinInner2))
	const sinFactor = dualSub({ v: 1, d: 0 }, dualMul(u2, sinInner3))
	const sinVal = dualMul(u, sinFactor)

	// cos(u) = 1 - u^2 * (1/2 - u^2 * (1/24 - u^2 * (1/720 - u^2 * (1/40320 - u^2 / 3628800))))
	const cosInner1 = dualSub({ v: 1 / 40320, d: 0 }, dualScale(u2, 1 / 3628800))
	const cosInner2 = dualSub({ v: 1 / 720, d: 0 }, dualMul(u2, cosInner1))
	const cosInner3 = dualSub({ v: 1 / 24, d: 0 }, dualMul(u2, cosInner2))
	const cosInner4 = dualSub({ v: 1 / 2, d: 0 }, dualMul(u2, cosInner3))
	const cosVal = dualSub({ v: 1, d: 0 }, dualMul(u2, cosInner4))

	return { sin: sinVal, cos: cosVal }
}

/**
 * Recursively computes (sin(u), cos(u)) in dual arithmetic via divide-and-conquer
 * angle halving and double-angle reconstruction:
 *   sin(2h) = 2 * sin(h) * cos(h)
 *   cos(2h) = 1 - 2 * sin(h)^2
 * @param {DualNumber} u
 * @returns {{ sin: DualNumber, cos: DualNumber }}
 */
function sinCosDualRecursive(u) {
	if (Math.abs(u.v) <= BASE_THRESHOLD) {
		return sinCosDualBase(u)
	}

	const half = dualScale(u, 0.5)
	const { sin: s, cos: c } = sinCosDualRecursive(half)

	const sin2h = dualScale(dualMul(s, c), 2)
	const cos2h = dualSub({ v: 1, d: 0 }, dualScale(dualMul(s, s), 2))

	return { sin: sin2h, cos: cos2h }
}

/**
 * Validates that the argument is a well-formed finite dual number `{ v, d }`.
 * @param {unknown} x
 */
function validateDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}
	if (!('v' in x) || !('d' in x)) {
		throw new TypeError('Dual number object must have numeric "v" and "d" properties')
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('Dual number properties "v" and "d" must be numbers')
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('Dual number properties "v" and "d" must be finite numbers')
	}
}

/**
 * Computes the trigonometric sine of a dual number `x = { v, d }`, carrying
 * its forward-mode derivative alongside the value:
 *
 *   sin({ v, d }) = { v: sin(v), d: cos(v) * d }
 *
 * Uses extended-precision 2*pi range reduction followed by a recursive
 * divide-and-conquer angle-halving algorithm with double-angle reconstruction
 * and small-angle Maclaurin base-case evaluation, all performed in dual arithmetic.
 *
 * @param {DualNumber} x - Input dual number with finite `v` (radians) and `d` (derivative).
 * @returns {DualNumber} Dual number `{ v: sin(x.v), d: cos(x.v) * x.d }`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is NaN, Infinity, or -Infinity.
 */
export function sinDualRecursive(x) {
	validateDual(x)
	const reduced = { v: reduceAngle(x.v), d: x.d }
	return sinCosDualRecursive(reduced).sin
}
