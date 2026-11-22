/**
 * Division over dual numbers `{ v, d }` carrying a forward-mode derivative
 * alongside the primal value, implemented via recursive Newton-Raphson
 * reciprocal refinement in the dual ring and divide-and-conquer recursion
 * for chained variadic quotients.
 *
 * For two dual numbers `a = a.v + a.d*ε` and `b = b.v + b.d*ε` (with `ε² = 0`
 * and `b.v !== 0`), the quotient satisfies the forward-mode quotient rule:
 *
 *   v = a.v / b.v
 *   d = (a.d * b.v - a.v * b.d) / (b.v * b.v)
 *
 * @module ops/arithmetic/divideDualRecursive
 */

/**
 * @typedef {{ v: number, d: number }} Dual
 */

const NEWTON_INIT_C0 = 48 / 17
const NEWTON_INIT_C1 = 32 / 17
const MAX_NEWTON_DEPTH = 10
const POW2_STEP = 512
const POW2_POS_STEP = 2 ** POW2_STEP
const POW2_NEG_STEP = 2 ** -POW2_STEP
const DUAL_SCALE_LIMIT = 1e150

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that `input` is a finite dual number `{ v, d }`.
 *
 * @param {unknown} input
 * @param {string} label
 * @returns {Dual}
 */
function validateDual(input, label) {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (input)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label}.v and ${label}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label}.v and ${label}.d must be finite numbers`)
	}
	return { v, d }
}

/**
 * Validates a divisor dual number, rejecting `v === 0`.
 *
 * @param {unknown} input
 * @param {string} label
 * @returns {Dual}
 */
function validateDivisor(input, label) {
	const dual = validateDual(input, label)
	if (dual.v === 0) {
		throw new RangeError(`${label}.v must be non-zero (division by zero)`)
	}
	return dual
}

/**
 * Scales `x` by `2 ** exp` without overflowing or underflowing the intermediate
 * power-of-two factor for extreme IEEE-754 exponents (including subnormals).
 *
 * @param {number} x
 * @param {number} exp
 * @returns {number}
 */
function scalePow2(x, exp) {
	if (x === 0 || exp === 0) {
		return x
	}
	if (exp > 1023) {
		return scalePow2(x * POW2_POS_STEP, exp - POW2_STEP)
	}
	if (exp < -1022) {
		return scalePow2(x * POW2_NEG_STEP, exp + POW2_STEP)
	}
	return x * 2 ** exp
}

/**
 * Decomposes a finite non-zero number `x` into `{ mantissa, exp, sign }`
 * such that `|x| = mantissa * 2 ** exp` with `mantissa` in `[0.5, 1)`.
 *
 * @param {number} x
 * @returns {{ mantissa: number, exp: number, sign: number }}
 */
function decomposeBinary(x) {
	const sign = x < 0 ? -1 : 1
	const absX = Math.abs(x)
	let exp = Math.floor(Math.log2(absX)) + 1
	let mantissa = scalePow2(absX, -exp)

	while (mantissa >= 1) {
		mantissa *= 0.5
		exp += 1
	}
	while (mantissa < 0.5) {
		mantissa *= 2
		exp -= 1
	}

	return { mantissa, exp, sign }
}

/**
 * Multiplies two dual numbers: `(x.v * y.v, x.v * y.d + x.d * y.v)`.
 *
 * @param {Dual} x
 * @param {Dual} y
 * @returns {Dual}
 */
function multiplyDual(x, y) {
	return {
		v: x.v * y.v,
		d: x.v * y.d + x.d * y.v,
	}
}

/**
 * Recursively refines the dual reciprocal `1 / target` using Newton-Raphson
 * iteration in the dual number ring:
 *
 *   X_{n+1} = X_n * (2 - target * X_n)
 *
 * Because `target.v` is normalized into `[0.5, 1)`, the linear seed
 * `48/17 - (32/17) * target.v` guarantees initial relative error `<= 1/17`,
 * giving quadratic convergence to IEEE-754 double precision in ~5 steps.
 *
 * @param {Dual} target Normalized dual number with `target.v` in `[0.5, 1)`.
 * @param {Dual} guess Current reciprocal approximation.
 * @param {number} depth Remaining maximum recursion depth.
 * @returns {Dual}
 */
function refineReciprocalDual(target, guess, depth) {
	const product = multiplyDual(target, guess)
	const correction = {
		v: 2 - product.v,
		d: -product.d,
	}
	const next = multiplyDual(guess, correction)

	if (depth <= 1) {
		return next
	}

	const residualV = Math.abs(1 - target.v * next.v)
	const residualD = Math.abs(target.v * next.d + target.d * next.v)
	const dScale = Math.max(1, Math.abs(target.d * next.v))

	if (
		(next.v === guess.v && next.d === guess.d) ||
		(residualV <= Number.EPSILON * 0.5 && residualD <= Number.EPSILON * 0.5 * dScale)
	) {
		return next
	}

	return refineReciprocalDual(target, next, depth - 1)
}

/**
 * Computes `a / b` for two validated dual numbers using power-of-two scaling
 * and recursive Newton-Raphson dual reciprocal refinement.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function divideDualBinary(a, b) {
	const { mantissa, exp, sign } = decomposeBinary(b.v)
	const scaledAD = scalePow2(a.d, -exp) * sign
	const scaledAV = scalePow2(a.v, -exp) * sign
	const scaledBD = scalePow2(b.d, -exp) * sign

	const seed = {
		v: NEWTON_INIT_C0 - NEWTON_INIT_C1 * mantissa,
		d: 0,
	}

	let v
	let d

	if (Number.isFinite(scaledBD) && Math.abs(scaledBD) <= DUAL_SCALE_LIMIT) {
		const recipScaled = refineReciprocalDual(
			{ v: mantissa, d: scaledBD },
			seed,
			MAX_NEWTON_DEPTH,
		)
		v = scaledAV * recipScaled.v
		d = scaledAD * recipScaled.v + (scaledAV === 0 ? 0 : scaledAV * recipScaled.d)
	} else {
		// Fallback when b.d and b.v span >150 orders of magnitude:
		// compute reciprocal of { v: mantissa, d: 1 } via recursive Newton-Raphson,
		// then scale the derivative term safely by b.d without triggering 0 * Infinity.
		const recipUnit = refineReciprocalDual(
			{ v: mantissa, d: 1 },
			seed,
			MAX_NEWTON_DEPTH,
		)
		v = scaledAV * recipUnit.v
		const term1 = scaledAD * recipUnit.v
		const term2 =
			scaledAV === 0 || b.d === 0
				? 0
				: scalePow2(scaledAV * recipUnit.d * sign, -exp) * b.d
		d = term1 + term2
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	}
}

/**
 * Divide-and-conquer recursive chained division over `divisors[start..end]`,
 * preserving left-associative semantics `(((dividend / d_start) / ...) / d_end)`
 * with `O(log n)` recursion depth.
 *
 * @param {Dual} dividend
 * @param {Dual[]} divisors
 * @param {number} start
 * @param {number} end
 * @returns {Dual}
 */
function divideRangeRecursive(dividend, divisors, start, end) {
	if (start === end) {
		return divideDualBinary(dividend, divisors[start])
	}
	const mid = (start + end) >> 1
	const leftQuotient = divideRangeRecursive(dividend, divisors, start, mid)
	return divideRangeRecursive(leftQuotient, divisors, mid + 1, end)
}

/**
 * Divides dual numbers `{ v, d }` carrying a forward-mode derivative alongside
 * the primal value, using recursive Newton-Raphson reciprocal refinement in
 * dual arithmetic and divide-and-conquer recursion for variadic chained division.
 *
 * Supports standard binary calls `divideDualRecursive(a, b)` as well as
 * left-associative chained division `divideDualRecursive(a, b, c, ...)`.
 *
 * @param {Dual} a Dividend dual number `{ v, d }`.
 * @param {Dual} b Divisor dual number `{ v, d }` with `b.v !== 0`.
 * @param {...Dual} rest Optional additional divisor dual numbers with `v !== 0`.
 * @returns {Dual} Quotient dual number `{ v, d }`.
 * @throws {TypeError} If any argument is not a dual number object `{ v, d }` with numeric properties.
 * @throws {RangeError} If any component is non-finite (`NaN`, `±Infinity`) or any divisor has `v === 0`.
 */
export function divideDualRecursive(a, b, ...rest) {
	const dividend = validateDual(a, 'a')
	const firstDivisor = validateDivisor(b, 'b')

	if (rest.length === 0) {
		return divideDualBinary(dividend, firstDivisor)
	}

	const divisors = [firstDivisor]
	for (let i = 0; i < rest.length; i += 1) {
		divisors.push(validateDivisor(rest[i], `arg[${i + 2}]`))
	}

	return divideRangeRecursive(dividend, divisors, 0, divisors.length - 1)
}
