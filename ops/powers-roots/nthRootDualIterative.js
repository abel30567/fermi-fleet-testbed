/**
 * Multiply two dual numbers: (a.v + a.d*ε) * (b.v + b.d*ε).
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Divide two dual numbers: (a.v + a.d*ε) / (b.v + b.d*ε).
 * Uses the form q = a.v / b.v, d = (a.d - q * b.d) / b.v to avoid
 * spurious overflow or underflow from squaring b.v.
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualDiv(a, b) {
	const q = a.v / b.v
	return {
		v: q,
		d: (a.d - q * b.d) / b.v,
	}
}

/**
 * Raise a dual number to a non-negative integer power using iterative
 * binary exponentiation.
 *
 * @param {{ v: number, d: number }} base
 * @param {number} exp Non-negative integer exponent.
 * @returns {{ v: number, d: number }}
 */
function dualPowInt(base, exp) {
	let result = { v: 1, d: 0 }
	let factor = base
	let e = exp
	while (e > 0) {
		if (e % 2 === 1) {
			result = dualMul(result, factor)
		}
		e = Math.floor(e / 2)
		if (e > 0) {
			factor = dualMul(factor, factor)
		}
	}
	return result
}

/**
 * Compute a well-scaled initial estimate for the real n-th root of a
 * non-zero finite number v without relying on Math.pow.
 *
 * Uses log2(|v|) / n = k + f with integer k and f in [-0.5, 0.5], then
 * evaluates 2^k * P_6(f * ln(2)) where P_6 is the 6th-degree Taylor
 * polynomial of exp(t). This places the initial guess close enough to
 * prevent intermediate overflow in y^(n-1) even for extreme v or large n.
 *
 * @param {number} v Non-zero finite real number.
 * @param {number} n Integer root degree >= 2.
 * @returns {number}
 */
function initialGuess(v, n) {
	const sign = v < 0 ? -1 : 1
	const scaledLog2 = Math.log2(Math.abs(v)) / n
	const k = Math.round(scaledLog2)
	const f = scaledLog2 - k
	const t = f * Math.LN2
	const expApprox =
		1 +
		t *
			(1 +
				t *
					(0.5 +
						t *
							(1 / 6 +
								t * (1 / 24 + t * (1 / 120 + t / 720)))))
	return sign * 2 ** k * expApprox
}

/**
 * Compute one Newton-Raphson update y + (q - y) / n, equivalent to
 * ((n - 1) * y + q) / n, avoiding intermediate overflow when |y| or |q|
 * is near Number.MAX_VALUE.
 *
 * @param {number} y
 * @param {number} q
 * @param {number} n
 * @returns {number}
 */
function newtonStepComponent(y, q, n) {
	const diff = q - y
	if (Number.isFinite(diff)) {
		return y + diff / n
	}
	return y + (q / n - y / n)
}

/**
 * Compute the principal real n-th root of a dual number x = { v, d } using
 * iterative Newton-Raphson in dual arithmetic.
 *
 * Mathematical semantics:
 * For a dual number x = v + d*ε (with ε^2 = 0) and positive integer n >= 1,
 * the n-th root satisfies y^n = x, i.e.
 *   y.v = sign(v) * |v|^(1/n)
 *   y.d = d / (n * y.v^(n - 1))   (for v !== 0, or d when n === 1).
 *
 * For n >= 2 and v !== 0, the iteration
 *   y_{k+1} = ((n - 1) * y_k + x / y_k^(n - 1)) / n
 * is evaluated directly in dual-number arithmetic until both value and
 * derivative components converge to machine precision.
 *
 * Edge cases at v === 0:
 * - n === 1: returns { v: 0, d }.
 * - n > 1 and d === 0: returns { v: 0, d: 0 }.
 * - n > 1 and d !== 0: throws RangeError because the derivative of x^(1/n)
 *   diverges at x = 0.
 *
 * Odd roots of negative values are supported (e.g. cube root of -8 is -2);
 * even roots of negative values are rejected with a RangeError.
 *
 * @param {{ v: number, d: number }} x Input dual number with finite numeric `v` and `d`.
 * @param {number} n Positive integer root degree (n >= 1).
 * @returns {{ v: number, d: number }} The dual n-th root `{ v, d }`.
 * @throws {TypeError} If `x` is not a non-null non-array object, `x.v` or `x.d` is not a number, or `n` is not a number.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite, `n` is not a positive safe integer, `x.v < 0` with even `n`, `x.v === 0` with `n > 1` and `x.d !== 0`, or the resulting derivative overflows finite IEEE-754 range.
 */
export function nthRootDualIterative(x, n) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input x must be a dual number object { v, d }.')
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('Dual number components x.v and x.d must be numbers.')
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('Dual number components x.v and x.d must be finite.')
	}
	if (typeof n !== 'number') {
		throw new TypeError('Root degree n must be a number.')
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('Root degree n must be a positive safe integer (>= 1).')
	}

	if (n === 1) {
		return {
			v: x.v === 0 ? 0 : x.v,
			d: x.d === 0 ? 0 : x.d,
		}
	}

	if (x.v === 0) {
		if (x.d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError(
			`Derivative of the ${n}-th root is undefined at v = 0 when d !== 0.`,
		)
	}

	if (x.v < 0 && n % 2 === 0) {
		throw new RangeError(
			`Cannot compute real even root (n = ${n}) of negative value v = ${x.v}.`,
		)
	}

	const MAX_ITERATIONS = 200
	const V_REL_TOL = 2 * Number.EPSILON
	const D_REL_TOL = 4 * Number.EPSILON

	let prev = null
	let y = { v: initialGuess(x.v, n), d: 0 }

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		const yPow = dualPowInt(y, n - 1)
		const quotient = dualDiv(x, yPow)
		const next = {
			v: newtonStepComponent(y.v, quotient.v, n),
			d: newtonStepComponent(y.d, quotient.d, n),
		}

		if (!Number.isFinite(next.v) || !Number.isFinite(next.d)) {
			throw new RangeError(
				'Newton-Raphson iteration overflowed finite IEEE-754 double range.',
			)
		}

		const vConverged =
			Math.abs(next.v - y.v) <= V_REL_TOL * Math.abs(next.v)
		const dConverged =
			Math.abs(next.d - y.d) <= D_REL_TOL * Math.abs(next.d)
		const twoCycle =
			prev !== null && next.v === prev.v && next.d === prev.d

		prev = y
		y = next

		if ((vConverged && dConverged) || twoCycle) {
			break
		}
	}

	return {
		v: y.v === 0 ? 0 : y.v,
		d: y.d === 0 ? 0 : y.d,
	}
}
