/**
 * @typedef {{ v: number, d: number }} Dual
 * A dual number `v + d*ε` (with `ε² = 0`) carrying a primal value `v`
 * and its forward-mode derivative `d`.
 */

const f64Buf = new ArrayBuffer(8)
const f64View = new DataView(f64Buf)

const POW2_54 = 2 ** 54
const POW2_512 = 2 ** 512
const POW2_NEG_512 = 2 ** -512
const MAX_NEWTON_STEPS = 8
const MAX_REFINE_STEPS = 2

/**
 * Normalize `-0` to `+0` while preserving all other numbers.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If `value` is not an object with numeric `v` and `d` fields.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN` or `±Infinity`).
 */
function validateDual(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number' || typeof value.d !== 'number') {
		throw new TypeError(`${label}.v and ${label}.d must be numbers`)
	}
	if (!Number.isFinite(value.v) || !Number.isFinite(value.d)) {
		throw new RangeError(`${label}.v and ${label}.d must be finite numbers`)
	}
}

/**
 * Validate a divisor dual number, rejecting zero primal values.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If `value` is not a valid dual number object.
 * @throws {RangeError} If `v` or `d` is non-finite or `v === 0`.
 */
function validateDivisor(value, label) {
	validateDual(value, label)
	if (value.v === 0) {
		throw new RangeError(`Division by zero: ${label}.v must be non-zero`)
	}
}

/**
 * Multiply two dual numbers `(a.v + a.d*ε) * (b.v + b.d*ε)`.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function multiplyDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.d * b.v + a.v * b.d,
	}
}

/**
 * Decompose a strictly positive finite float64 into `{ m, e }` such that
 * `absVal === m * 2^e` exactly, with `m` in `[1, 2)`.
 *
 * @param {number} absVal
 * @returns {{ m: number, e: number }}
 */
function decomposePow2(absVal) {
	let val = absVal
	let offset = 0
	f64View.setFloat64(0, val, false)
	let hi = f64View.getUint32(0, false)
	let biased = (hi >>> 20) & 0x7ff

	if (biased === 0) {
		// Subnormal: scale into normal range before extracting exponent.
		val *= POW2_54
		offset = -54
		f64View.setFloat64(0, val, false)
		hi = f64View.getUint32(0, false)
		biased = (hi >>> 20) & 0x7ff
	}

	const e = biased - 1023 + offset
	f64View.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false)
	const m = f64View.getFloat64(0, false)
	return { m, e }
}

/**
 * Recursively scale `x` by `2^exp` in safe normal-range chunks to avoid
 * spurious intermediate overflow or underflow.
 *
 * @param {number} x
 * @param {number} exp
 * @returns {number}
 */
function scalePow2(x, exp) {
	if (x === 0 || exp === 0 || !Number.isFinite(x)) {
		return x
	}
	if (exp > 512) {
		return scalePow2(x * POW2_512, exp - 512)
	}
	if (exp < -512) {
		return scalePow2(x * POW2_NEG_512, exp + 512)
	}
	return x * 2 ** exp
}

/**
 * Recursive Newton-Raphson reciprocal over dual numbers:
 * `x_{k+1} = x_k * (2 - target * x_k)`.
 *
 * Expects `target.v` in `[1, 2)` and `guess.v = 1.5 - 0.5 * target.v`, which
 * guarantees initial relative error `<= 1/8` and quadratic convergence to
 * full IEEE 754 float64 precision in at most 7 steps.
 *
 * @param {Dual} target
 * @param {Dual} guess
 * @param {number} stepsLeft
 * @returns {Dual}
 */
function newtonReciprocalDual(target, guess, stepsLeft) {
	const prod = multiplyDual(target, guess)
	const factor = { v: 2 - prod.v, d: -prod.d }
	const next = multiplyDual(guess, factor)
	if (stepsLeft <= 1 || (next.v === guess.v && next.d === guess.d)) {
		return next
	}
	return newtonReciprocalDual(target, next, stepsLeft - 1)
}

/**
 * Recursive scalar Newton-Raphson reciprocal for `m` in `[1, 2)`.
 * Used as fallback when `w.d * 2^-e` overflows float64.
 *
 * @param {number} m
 * @param {number} guess
 * @param {number} stepsLeft
 * @returns {number}
 */
function newtonReciprocalScalar(m, guess, stepsLeft) {
	const next = guess * (2 - m * guess)
	if (stepsLeft <= 1 || next === guess) {
		return next
	}
	return newtonReciprocalScalar(m, next, stepsLeft - 1)
}

/**
 * Recursive residual refinement for dual quotient `q ≈ u / w`:
 * `q_{k+1} = q_k + (u - w * q_k) * invW`.
 *
 * @param {Dual} u
 * @param {Dual} w
 * @param {Dual} invW
 * @param {Dual} q
 * @param {number} stepsLeft
 * @returns {Dual}
 */
function refineQuotient(u, w, invW, q, stepsLeft) {
	if (stepsLeft <= 0 || !Number.isFinite(q.v) || !Number.isFinite(q.d)) {
		return q
	}
	const wq = multiplyDual(w, q)
	const residual = { v: u.v - wq.v, d: u.d - wq.d }
	if (!Number.isFinite(residual.v) || !Number.isFinite(residual.d)) {
		return q
	}
	const correction = multiplyDual(residual, invW)
	const next = { v: q.v + correction.v, d: q.d + correction.d }
	if (!Number.isFinite(next.v) || !Number.isFinite(next.d)) {
		return q
	}
	if (next.v === q.v && next.d === q.d) {
		return next
	}
	return refineQuotient(u, w, invW, next, stepsLeft - 1)
}

/**
 * Divide a single dual number `u` by a single non-zero dual number `w`
 * using exponent-normalized recursive Newton-Raphson dual reciprocal and
 * recursive residual refinement.
 *
 * @param {Dual} u
 * @param {Dual} w
 * @returns {Dual}
 */
function dividePair(u, w) {
	const sign = w.v < 0 ? -1 : 1
	const { m, e } = decomposePow2(Math.abs(w.v))
	const uScaled = {
		v: scalePow2(u.v * sign, -e),
		d: scalePow2(u.d * sign, -e),
	}
	const md = scalePow2(w.d * sign, -e)
	const x0 = 1.5 - 0.5 * m

	if (!Number.isFinite(md)) {
		// Extreme scale where `w.d / w.v` overflows float64: compute scalar
		// reciprocal recursively and apply exact exponent-balanced quotient rule.
		const invM = newtonReciprocalScalar(m, x0, MAX_NEWTON_STEPS)
		const qv = uScaled.v * invM
		const term1 = uScaled.d * invM
		const term2 = u.v === 0 ? 0 : scalePow2(u.v * w.d * (invM * invM), -2 * e)
		return {
			v: normalizeZero(qv),
			d: normalizeZero(term1 - term2),
		}
	}

	const wNorm = { v: m, d: md }
	const invNorm = newtonReciprocalDual(wNorm, { v: x0, d: 0 }, MAX_NEWTON_STEPS)
	const initial = multiplyDual(uScaled, invNorm)
	const refined = refineQuotient(uScaled, wNorm, invNorm, initial, MAX_REFINE_STEPS)

	return {
		v: normalizeZero(refined.v),
		d: normalizeZero(refined.d),
	}
}

/**
 * Divide-and-conquer recursive product of dual numbers over `[lo, hi)`.
 *
 * @param {Dual[]} items
 * @param {number} lo
 * @param {number} hi
 * @returns {Dual}
 */
function multiplyDualRange(items, lo, hi) {
	if (hi - lo === 1) {
		return items[lo]
	}
	const mid = (lo + hi) >>> 1
	const left = multiplyDualRange(items, lo, mid)
	const right = multiplyDualRange(items, mid, hi)
	return multiplyDual(left, right)
}

/**
 * Divide-and-conquer fallback when multiplying all divisors together overflows
 * or underflows: recursively divides by the left half then the right half.
 *
 * @param {Dual} acc
 * @param {Dual[]} divisors
 * @param {number} lo
 * @param {number} hi
 * @returns {Dual}
 */
function divideByRange(acc, divisors, lo, hi) {
	if (hi - lo === 1) {
		return dividePair(acc, divisors[lo])
	}
	const mid = (lo + hi) >>> 1
	const afterLeft = divideByRange(acc, divisors, lo, mid)
	return divideByRange(afterLeft, divisors, mid, hi)
}

/**
 * Divide dual numbers `{ v, d }` carrying a forward-mode derivative alongside
 * the primal value, using a recursive / divide-and-conquer algorithm.
 *
 * Implements the dual-number quotient rule:
 *   `(u.v / w.v, (u.d * w.v - u.v * w.d) / (w.v * w.v))`
 *
 * - For two operands `(u, w)`, normalizes `w` by its IEEE 754 power-of-2
 *   exponent, computes the dual reciprocal `1 / w` via recursive Newton-Raphson
 *   iteration (`x_{k+1} = x_k * (2 - w * x_k)`), multiplies by `u`, and
 *   applies recursive residual refinement. Exponent normalization avoids
 *   spurious overflow/underflow of `w.v²` at extreme magnitudes.
 * - For multiple divisors `(u, w1, w2, ..., wk)`, computes `u / (w1 * ... * wk)`
 *   by reducing the divisors with a divide-and-conquer binary product tree
 *   (falling back to recursive range division if the combined product overflows
 *   or underflows).
 *
 * @param {Dual} dividend - Numerator dual number `{ v, d }`.
 * @param {...Dual} divisors - One or more non-zero denominator dual numbers `{ v, d }`.
 * @returns {Dual} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If fewer than two arguments are passed, or any operand is not `{ v: number, d: number }`.
 * @throws {RangeError} If any `v` or `d` is non-finite, or any divisor has `v === 0`.
 */
export function divideDualRecursive(dividend, ...divisors) {
	if (divisors.length === 0) {
		throw new TypeError('divideDualRecursive requires at least two dual number arguments')
	}
	validateDual(dividend, 'dividend')
	for (let i = 0; i < divisors.length; i++) {
		validateDivisor(divisors[i], `divisors[${i}]`)
	}

	if (divisors.length === 1) {
		return dividePair(dividend, divisors[0])
	}

	const combined = multiplyDualRange(divisors, 0, divisors.length)
	if (combined.v !== 0 && Number.isFinite(combined.v) && Number.isFinite(combined.d)) {
		return dividePair(dividend, combined)
	}

	return divideByRange(dividend, divisors, 0, divisors.length)
}
