/**
 * Evaluates the Maclaurin series for arcsin(t) and its derivative 1 / sqrt(1 - t^2)
 * simultaneously for |t| <= 0.5:
 *
 *   1 / sqrt(1 - t^2) = sum_{n=0..inf} u_n,       where u_0 = 1, u_n = u_{n-1} * ((2n - 1) / (2n)) * t^2
 *   arcsin(t)         = t * sum_{n=0..inf} u_n / (2n + 1)
 *
 * For |t| <= 0.5, t^2 <= 0.25 so terms decay by at least a factor of 4 per step,
 * reaching IEEE-754 double-precision convergence in <= 30 iterations.
 *
 * @param {number} t - Real value with |t| <= 0.5.
 * @returns {{ value: number, deriv: number }} Primal value and derivative at t.
 */
function arcsinSeriesHalf(t) {
	const t2 = t * t
	let term = 1
	let sumVal = 1
	let sumDeriv = 1

	for (let n = 1; n <= 64; n++) {
		term *= ((2 * n - 1) / (2 * n)) * t2
		const nextVal = sumVal + term / (2 * n + 1)
		const nextDeriv = sumDeriv + term
		if (nextVal === sumVal && nextDeriv === sumDeriv) {
			break
		}
		sumVal = nextVal
		sumDeriv = nextDeriv
	}

	return {
		value: t * sumVal,
		deriv: sumDeriv,
	}
}

/**
 * Computes the trigonometric arcsine over a dual number `{ v, d }`, propagating
 * the forward-mode derivative alongside the primal value:
 *
 *   arcsin(v + d*ε) = arcsin(v) + (d / sqrt(1 - v^2))*ε
 *
 * Uses the Maclaurin series directly for |v| <= 0.5 and the half-angle
 * range-reduction identity for 0.5 < |v| <= 1:
 *
 *   arcsin(v) = sign(v) * (π/2 - 2 * arcsin(y)),   y = sqrt((1 - |v|) / 2) < 0.5
 *   d/dv arcsin(v) = 1 / (2 * y * sqrt(1 - y^2)) = 1 / sqrt((1 - |v|)(1 + |v|))
 *
 * This avoids catastrophic cancellation near |v| = 1. At the vertical-tangent
 * endpoints v = ±1, the primal value is ±π/2 and the derivative is d / 0
 * (±Infinity for d !== 0, NaN for d === 0).
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite `v` in [-1, 1] and finite `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is non-finite (NaN/Infinity) or `v` is outside [-1, 1].
 */
export function arcsinDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('arcsinDualSeries expects a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('arcsinDualSeries requires numeric v and d components')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('arcsinDualSeries requires finite v and d components')
	}

	if (v < -1 || v > 1) {
		throw new RangeError(`arcsinDualSeries requires v in [-1, 1], received ${v}`)
	}

	const absV = Math.abs(v)

	if (absV <= 0.5) {
		const { value, deriv } = arcsinSeriesHalf(v)
		return {
			v: value,
			d: d * deriv,
		}
	}

	// Range reduction for 0.5 < |v| <= 1: y = sqrt((1 - |v|) / 2) in [0, 0.5)
	const sign = v < 0 ? -1 : 1
	const y = Math.sqrt((1 - absV) / 2)
	const { value: asinY, deriv: secY } = arcsinSeriesHalf(y)

	const primal = sign * (Math.PI / 2 - 2 * asinY)
	// Chain rule: d/dv arcsin(v) = (1 / sqrt(1 - y^2)) / (2 * y) = secY / (2 * y)
	const tangent = (d * secY) / (2 * y)

	return {
		v: primal,
		d: tangent,
	}
}
