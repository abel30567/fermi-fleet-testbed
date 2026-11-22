/**
 * Normalize -0 to +0 while leaving all other numbers unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ v: number, d: number }}
 */
function validateDual(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (value)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name} must have numeric v and d properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v: normalizeZero(v), d: normalizeZero(d) }
}

/**
 * Validate an exponent which may be either a finite scalar number or a dual `{ v, d }`.
 *
 * @param {unknown} exponent
 * @returns {{ v: number, d: number }}
 */
function validateExponent(exponent) {
	if (typeof exponent === 'number') {
		if (!Number.isFinite(exponent)) {
			throw new RangeError('exponent must be a finite number')
		}
		return { v: normalizeZero(exponent), d: 0 }
	}
	return validateDual(exponent, 'exponent')
}

/**
 * Compute `base^n` for a finite integer `n` using straightforward iterative
 * exponentiation by squaring over dual numbers.
 *
 * Precondition: if `n < 0`, `base.v !== 0`.
 *
 * @param {{ v: number, d: number }} base
 * @param {number} n
 * @returns {{ v: number, d: number }}
 */
function powDualIntIterative(base, n) {
	if (n === 0) {
		return { v: 1, d: 0 }
	}

	let curV = base.v
	let curD = base.d
	let exp = BigInt(n < 0 ? -n : n)

	if (n < 0) {
		const invV = 1 / curV
		curD = normalizeZero((-curD / curV) / curV)
		curV = invV
	}

	let resV = 1
	let resD = 0

	while (exp > 0n) {
		if ((exp & 1n) === 1n) {
			const nextV = resV * curV
			const nextD = resV * curD + resD * curV
			resV = nextV
			resD = nextD
		}
		exp >>= 1n
		if (exp > 0n) {
			const nextV = curV * curV
			const nextD = 2 * (curV * curD)
			curV = nextV
			curD = nextD
		}
	}

	if (!Number.isFinite(resV) || !Number.isFinite(resD)) {
		throw new RangeError('Dual power overflowed finite floating-point range')
	}

	return { v: normalizeZero(resV), d: normalizeZero(resD) }
}

/**
 * Compute the power `base ** exponent` over dual numbers `{ v, d }` carrying a
 * forward-mode first derivative alongside the primal value.
 *
 * Mathematical semantics for `a = { v: a.v, d: a.d }` and `b = { v: b.v, d: b.d }`:
 * - Scalar exponents `p` are promoted to constant dual numbers `{ v: p, d: 0 }`.
 * - For integer exponents (`Number.isInteger(b.v)`), `a^(b.v)` is evaluated via
 *   straightforward iterative exponentiation by squaring, preserving exactness
 *   for negative and zero bases (when `b.d === 0`). When `a.v > 0` and `b.d !== 0`,
 *   the exponent-derivative contribution `a^(b.v) * b.d * ln(a.v)` is added.
 * - For non-integer exponents with `a.v > 0`, the general dual power formula
 *   `a^b = exp(b * ln(a))` is used with primal value `a.v ** b.v` and derivative
 *   `a^b * (b.d * ln(a.v) + b.v * a.d / a.v)` (evaluated in a form resilient to
 *   spurious intermediate underflow/overflow).
 * - At `a.v === 0`:
 *   - `0^0` with constant exponent (`b.d === 0`) evaluates to `{ v: 1, d: 0 }`.
 *   - `b.v < 0` throws `RangeError` (division by zero).
 *   - `b.v === 0` with `b.d !== 0`, or `0 < b.v < 1`, throws `RangeError`
 *     (undefined/divergent derivative at `a.v = 0`).
 *   - `b.v === 1` evaluates to `{ v: 0, d: a.d }`; `b.v > 1` evaluates to `{ v: 0, d: 0 }`.
 * - Negative bases (`a.v < 0`) require an integer constant exponent (`b.d === 0`);
 *   otherwise a `RangeError` is thrown.
 *
 * @param {{ v: number, d: number }} base - Base dual number `{ v, d }`.
 * @param {{ v: number, d: number } | number} exponent - Exponent as a dual number `{ v, d }` or a finite scalar number.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `base` or `exponent` has an invalid type or missing numeric fields.
 * @throws {RangeError} If inputs contain non-finite numbers, violate real power/derivative domains, or overflow finite IEEE-754 range.
 */
export function powerDualIterative(base, exponent) {
	const a = validateDual(base, 'base')
	const b = validateExponent(exponent)

	const isIntExp = Number.isInteger(b.v)

	if (a.v === 0) {
		if (b.v === 0 && b.d === 0) {
			return { v: 1, d: 0 }
		}
		if (b.v < 0) {
			throw new RangeError('Zero base cannot be raised to a negative exponent')
		}
		if (b.v === 0) {
			throw new RangeError('Derivative of a^b is undefined at a.v = 0, b.v = 0 when b.d !== 0')
		}
		if (b.v < 1) {
			throw new RangeError('Derivative of a^b is undefined at a.v = 0 when b.v < 1')
		}
		if (b.v === 1) {
			return { v: 0, d: normalizeZero(a.d) }
		}
		return { v: 0, d: 0 }
	}

	if (a.v < 0) {
		if (!isIntExp) {
			throw new RangeError('Negative base cannot be raised to a non-integer exponent')
		}
		if (b.d !== 0) {
			throw new RangeError('Negative base cannot be differentiated with respect to a non-constant exponent')
		}
		return powDualIntIterative(a, b.v)
	}

	// Here a.v > 0
	if (isIntExp) {
		const res = powDualIntIterative(a, b.v)
		if (b.d === 0) {
			return res
		}
		const lnA = Math.log(a.v)
		const scale = b.d * lnA
		const expTerm = Number.isFinite(scale) ? res.v * scale : (res.v * b.d) * lnA
		const d = res.d + expTerm
		if (!Number.isFinite(d)) {
			throw new RangeError('Dual power derivative overflowed finite floating-point range')
		}
		return { v: res.v, d: normalizeZero(d) }
	}

	// General non-integer exponent with a.v > 0:
	// a^b = exp(b * ln(a)), d(a^b) = a^b * (b.d * ln(a.v) + b.v * a.d / a.v)
	const v = Math.pow(a.v, b.v)
	const lnA = Math.log(a.v)

	let termExp = 0
	if (b.d !== 0) {
		const scale = b.d * lnA
		termExp = Number.isFinite(scale) ? v * scale : (v * b.d) * lnA
	}

	let termBase = 0
	if (a.d !== 0 && b.v !== 0) {
		const powMinus1 = Math.pow(a.v, b.v - 1)
		const scale = b.v * a.d
		termBase = Number.isFinite(scale) ? scale * powMinus1 : b.v * (powMinus1 * a.d)
	}

	const d = termExp + termBase

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual power overflowed finite floating-point range')
	}

	return { v: normalizeZero(v), d: normalizeZero(d) }
}
