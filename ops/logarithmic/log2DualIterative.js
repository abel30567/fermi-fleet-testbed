/**
 * Iterative natural logarithm for a positive finite number near 1 using the
 * hyperbolic arctangent series:
 *   ln(m) = 2 * sum_{n=0}^{infinity} t^(2n+1) / (2n + 1),  t = (m - 1) / (m + 1).
 *
 * Converges to full IEEE 754 double precision in ~12-17 iterations when m is
 * near 1 (e.g. m in [1/sqrt(2), sqrt(2)] or m = 2).
 *
 * @param {number} m - Positive finite number near 1.
 * @returns {number} Natural logarithm of m.
 */
function lnNearOneIterative(m) {
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let termPower = t
	let sum = t

	for (let k = 3; k <= 201; k += 2) {
		termPower *= t2
		const term = termPower / k
		const nextSum = sum + term
		if (nextSum === sum) {
			break
		}
		sum = nextSum
	}

	return 2 * sum
}

const LN2 = lnNearOneIterative(2)
const SQRT2 = 1.4142135623730951
const SUBNORMAL_THRESHOLD = 1e-300

/**
 * Computes log2(v) iteratively for a finite strictly positive number v by:
 * 1. Iteratively reducing v into [1/sqrt(2), sqrt(2)] via exact power-of-two scaling.
 * 2. Evaluating ln(m) with the iterative atanh series and dividing by ln(2).
 *
 * @param {number} v - Strictly positive finite number.
 * @returns {number} Base-2 logarithm of v.
 */
function log2ValueIterative(v) {
	let m = v
	let exponent = 0

	while (m >= 2) {
		m /= 2
		exponent += 1
	}
	while (m < 1) {
		m *= 2
		exponent -= 1
	}

	if (m > SQRT2) {
		m /= 2
		exponent += 1
	}

	if (m === 1) {
		return exponent
	}

	return exponent + lnNearOneIterative(m) / LN2
}

/**
 * Computes the base-2 logarithm (log2) of a dual number `{ v, d }` carrying a
 * primal value `v` and a forward-mode derivative `d`, using a straightforward
 * iterative implementation:
 *
 *   log2(v + d*eps) = log2(v) + (d / (v * ln(2))) * eps
 *
 * @param {{ v: number, d: number }} dual - Dual number with finite `v > 0` and finite `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: log2(dual.v), d: dual.d / (dual.v * ln(2)) }`.
 * @throws {TypeError} If `dual` is not a non-null, non-array object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is not finite, or if `v <= 0`.
 */
export function log2DualIterative(dual) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError('Expected a dual number object with numeric properties { v, d }')
	}

	const { v, d } = dual

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number properties v and d must both be numbers')
	}

	if (!Number.isFinite(v)) {
		throw new RangeError('Dual number value v must be a finite number')
	}

	if (!Number.isFinite(d)) {
		throw new RangeError('Dual number derivative d must be a finite number')
	}

	if (v <= 0) {
		throw new RangeError('Dual number value v must be strictly positive (> 0)')
	}

	const primal = log2ValueIterative(v)
	let derivative
	if (d === 0) {
		derivative = 0
	} else if (v < SUBNORMAL_THRESHOLD) {
		derivative = (d / v) / LN2
	} else {
		derivative = d / (v * LN2)
	}

	return {
		v: primal,
		d: derivative === 0 ? 0 : derivative,
	}
}
