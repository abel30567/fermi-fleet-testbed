const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)

const MIN_NORMAL = 2.2250738585072014e-308 // 2^-1022
const SUBNORMAL_SCALE = 18014398509481984 // 2^54
const MAX_ITERATIONS = 64

/**
 * Computes a power-of-two initial guess strictly above sqrt(v) for any positive
 * finite IEEE-754 double `v` (including subnormals) using exponent halving.
 * Starting above sqrt(v) ensures monotone Newton-Raphson convergence from above
 * in 5-7 iterations across the full double range without spurious overflow.
 *
 * @param {number} v - Positive finite number.
 * @returns {number} Initial approximation y0 > sqrt(v).
 */
function initialSqrtGuess(v) {
	let scaled = v
	let expOffset = 0
	if (scaled < MIN_NORMAL) {
		scaled *= SUBNORMAL_SCALE
		expOffset = -54
	}
	_f64[0] = scaled
	const biasedExp = Number((_u64[0] >> 52n) & 0x7ffn)
	const e = biasedExp - 1023 + expOffset
	const guessExp = Math.floor(e / 2) + 1
	_u64[0] = BigInt(guessExp + 1023) << 52n
	return _f64[0]
}

/**
 * Validates that `x` is a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} x - Candidate dual number.
 * @throws {TypeError} If `x` is not a non-null non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is NaN or not finite.
 */
function validateDual(x) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError('Expected dual number object { v, d }')
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}
}

/**
 * Computes the principal square root of a dual number `x = v + d·ε` (with `ε² = 0`),
 * carrying the exact forward-mode derivative alongside the primal value, via
 * straightforward iterative Newton-Raphson in dual arithmetic:
 *
 *   y_{k+1} = 0.5 * (y_k + x / y_k)
 *
 * Mathematical semantics:
 * - For `v > 0`: returns `{ v: sqrt(v), d: d / (2 * sqrt(v)) }`.
 * - For `v === 0 && d === 0`: returns `{ v: 0, d: 0 }`.
 * - For `v === 0 && d !== 0`: throws `RangeError` because the derivative
 *   `d / (2 * sqrt(v))` is singular (unbounded) at `v = 0`.
 * - For `v < 0`: throws `RangeError` because the real square root is undefined
 *   for negative primal values.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite `v >= 0` and finite `d`.
 * @returns {{ v: number, d: number }} Dual square root `{ v, d }`.
 * @throws {TypeError} If `x` is not an object `{ v, d }` with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is non-finite, `v < 0`, `v === 0 && d !== 0`,
 *   or the resulting derivative overflows IEEE-754 finite double precision.
 */
export function sqrtDualIterative(x) {
	validateDual(x)

	const { v, d } = x

	if (v < 0) {
		throw new RangeError(
			`Cannot compute real square root of dual number with negative primal value: v = ${v}`
		)
	}

	if (v === 0) {
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError(
			`Derivative of sqrt is singular at v = 0 when d !== 0 (got d = ${d})`
		)
	}

	let yv = initialSqrtGuess(v)
	let yd = 0

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		// Dual division x / y = (v / yv) + ((d - (v / yv) * yd) / yv) * ε,
		// combined with the 0.5 Newton factor to avoid overflow near Number.MAX_VALUE
		// and underflow near Number.MIN_VALUE.
		const qv = v / yv
		const ratio = qv / yv
		const halfDoverYv = Math.abs(d) > 1 ? (0.5 * d) / yv : 0.5 * (d / yv)

		const nextV = 0.5 * yv + 0.5 * qv
		const nextD = 0.5 * yd + (halfDoverYv - ratio * (0.5 * yd))

		if (!Number.isFinite(nextD)) {
			throw new RangeError(
				`Dual square root derivative overflowed finite double precision for v = ${v}, d = ${d}`
			)
		}

		const vConverged = Math.abs(nextV - yv) <= Number.EPSILON * nextV
		const dConverged =
			Math.abs(nextD - yd) <= 2 * Number.EPSILON * Math.abs(nextD) + Number.MIN_VALUE

		yv = nextV
		yd = nextD

		if (vConverged && dConverged) {
			break
		}
	}

	return {
		v: yv === 0 ? 0 : yv,
		d: yd === 0 ? 0 : yd,
	}
}
