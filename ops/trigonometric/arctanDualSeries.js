const HALF_PI = Math.PI / 2
const REDUCTION_THRESHOLD = 0.25
const MAX_SERIES_TERMS = 64
const LARGE_V_THRESHOLD = 1e150

/**
 * Evaluates arctan(x) for a finite real number x using range reduction
 * (reciprocal and half-angle identities) combined with the alternating
 * Maclaurin series.
 *
 * @param {number} x - Finite real input.
 * @returns {number} Value of arctan(x) in (-pi/2, pi/2).
 */
function arctanSeriesPrimal(x) {
	if (x === 0) {
		return 0
	}

	const sign = x < 0 ? -1 : 1
	let a = Math.abs(x)
	const inverted = a > 1
	if (inverted) {
		a = 1 / a
	}

	// Half-angle identity: arctan(a) = 2 * arctan(a / (1 + sqrt(1 + a^2)))
	// Reduces a in (0, 1] to u in (0, 0.25] in at most 2 iterations so the
	// alternating Maclaurin series converges rapidly to full IEEE-754 precision.
	let scale = 1
	let u = a
	while (u > REDUCTION_THRESHOLD) {
		u = u / (1 + Math.sqrt(1 + u * u))
		scale *= 2
	}

	// Maclaurin series: arctan(u) = sum_{k=0}^\infty (-1)^k * u^(2k+1) / (2k+1)
	const u2 = u * u
	let power = u
	let sum = u
	for (let k = 1; k < MAX_SERIES_TERMS; k++) {
		power *= -u2
		const term = power / (2 * k + 1)
		const next = sum + term
		if (next === sum) {
			break
		}
		sum = next
	}

	let result = scale * sum
	if (inverted) {
		result = HALF_PI - result
	}

	return sign * result
}

/**
 * Computes the forward-mode derivative d / (1 + v^2) with overflow protection
 * for large |v|.
 *
 * @param {number} v - Primal value.
 * @param {number} d - Incoming derivative component.
 * @returns {number} Outgoing derivative component.
 */
function arctanDerivative(v, d) {
	if (d === 0) {
		return 0
	}

	const absV = Math.abs(v)
	let deriv
	if (absV > LARGE_V_THRESHOLD) {
		// Overflow-safe form: d / (1 + v^2) = (d / |v|) / (|v| + 1 / |v|)
		deriv = (d / absV) / (absV + 1 / absV)
	} else {
		deriv = d / (1 + v * v)
	}

	return deriv === 0 ? 0 : deriv
}

/**
 * Computes the arctangent of a dual number `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value.
 *
 * For a dual number `x = v + d * eps` (with `eps^2 = 0`):
 * `arctan(v + d * eps) = arctan(v) + (d / (1 + v^2)) * eps`.
 *
 * The primal value is evaluated via reciprocal and half-angle range reduction
 * followed by the alternating Maclaurin series, and the derivative is computed
 * using the closed-form chain rule with overflow-safe scaling for large `|v|`.
 *
 * @param {{ v: number, d: number }} dual - Dual number with finite real `v` (value) and `d` (derivative).
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: arctan(v), d: d / (1 + v^2) }`.
 * @throws {TypeError} If `dual` is not a non-null object or `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN` or not finite.
 */
export function arctanDualSeries(dual) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = dual
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	return {
		v: arctanSeriesPrimal(v),
		d: arctanDerivative(v, d),
	}
}
