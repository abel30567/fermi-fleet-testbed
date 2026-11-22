/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value.
 * @property {number} d - Forward-mode first derivative (infinitesimal part).
 */

/**
 * Normalizes `-0` to `+0` while leaving all other numbers unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that an input is a finite dual number `{ v, d }`.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @returns {DualNumber} Normalized dual number.
 * @throws {TypeError} If `input` is not a plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is `NaN` or infinite.
 */
function validateDual(input, name) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = input
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v: normalizeZero(v), d: normalizeZero(d) }
}

/**
 * Validates and normalizes the exponent argument, accepting either a finite
 * scalar number (promoted to `{ v: n, d: 0 }`) or a dual number `{ v, d }`.
 *
 * @param {DualNumber | number} exponent
 * @returns {DualNumber}
 * @throws {TypeError} If `exponent` is neither a number nor a `{ v, d }` object.
 * @throws {RangeError} If any component is not finite.
 */
function normalizeExponent(exponent) {
	if (typeof exponent === 'number') {
		if (!Number.isFinite(exponent)) {
			throw new RangeError('exponent must be a finite number')
		}
		return { v: normalizeZero(exponent), d: 0 }
	}
	return validateDual(exponent, 'exponent')
}

/**
 * Computes the base-contribution derivative term `b * a^(b - 1) * da` for
 * `a !== 0`, using a scale-safe fallback `v * (b * (da / a))` if `a^(b - 1)`
 * overflows while `a^b` remains finite.
 *
 * @param {number} a - Primal base (non-zero).
 * @param {number} da - Base derivative.
 * @param {number} b - Primal exponent.
 * @param {number} v - Precomputed primal power `a^b`.
 * @returns {number}
 */
function computeBaseDerivativeTerm(a, da, b, v) {
	if (b === 0 || da === 0) {
		return 0
	}
	if (b === 1) {
		return da
	}
	const powPrev = Math.pow(a, b - 1)
	const direct = b * powPrev * da
	if (Number.isFinite(direct)) {
		return direct
	}
	return v * (b * (da / a))
}

/**
 * Computes the power `base ** exponent` over dual numbers `{ v, d }` carrying a
 * forward-mode first derivative alongside the primal value.
 *
 * Uses first-order dual-number Taylor/identity expansions (modulo ε² = 0):
 * - For positive base `a > 0`, via the identity `A^B = exp(B * ln(A))`:
 *   - `v = a^b`
 *   - `d = b * a^(b - 1) * a' + a^b * ln(a) * b'`
 *     (equivalently `a^b * (b * a' / a + b' * ln(a))`)
 * - For negative base `a < 0`, supported when the exponent has `b' === 0` and
 *   an integer primal value `b ∈ Z`, via the binomial dual identity
 *   `(a + a'ε)^b = a^b + b * a^(b - 1) * a'ε`.
 * - For zero base `a === 0`, supported when `b' === 0` and `b === 0` (`1 + 0ε`),
 *   `b === 1` (`0 + a'ε`), or `b > 1` (`0 + 0ε`).
 *
 * @param {DualNumber} base - Dual number `{ v, d }` representing `a + a'ε`.
 * @param {DualNumber | number} exponent - Dual number `{ v, d }` representing
 *   `b + b'ε`, or a finite scalar number normalized to `{ v: exponent, d: 0 }`.
 * @returns {DualNumber} Dual number `{ v, d }` representing `base ** exponent`.
 * @throws {TypeError} If `base` is not a `{ v, d }` object or `exponent` is
 *   neither a number nor a `{ v, d }` object.
 * @throws {RangeError} If any input is non-finite, the real power or
 *   derivative is undefined (e.g., negative base with non-integer exponent,
 *   non-positive base with non-zero exponent derivative, zero base with
 *   negative exponent or exponent in `(0, 1)`), or the result overflows.
 */
export function powerDualSeries(base, exponent) {
	const { v: a, d: da } = validateDual(base, 'base')
	const { v: b, d: db } = normalizeExponent(exponent)

	if (a > 0) {
		const v = Math.pow(a, b)
		if (!Number.isFinite(v)) {
			throw new RangeError('powerDualSeries result value overflowed to a non-finite number')
		}

		const baseTerm = computeBaseDerivativeTerm(a, da, b, v)
		const expTerm = db === 0 ? 0 : v * db * Math.log(a)
		const d = baseTerm + expTerm
		if (!Number.isFinite(d)) {
			throw new RangeError('powerDualSeries result derivative is not finite')
		}

		return { v: normalizeZero(v), d: normalizeZero(d) }
	}

	if (a === 0) {
		if (db !== 0) {
			throw new RangeError('Zero base with non-zero exponent derivative is undefined (ln(0) is not finite)')
		}
		if (b < 0) {
			throw new RangeError('Zero base with negative exponent is undefined (division by zero)')
		}
		if (b === 0) {
			return { v: 1, d: 0 }
		}
		if (b < 1) {
			throw new RangeError('Zero base with exponent in (0, 1) has a non-finite derivative')
		}
		if (b === 1) {
			return { v: 0, d: normalizeZero(da) }
		}
		return { v: 0, d: 0 }
	}

	// Negative base: a < 0
	if (db !== 0) {
		throw new RangeError('Negative base with non-zero exponent derivative is undefined in the reals')
	}
	if (!Number.isInteger(b)) {
		throw new RangeError('Negative base with non-integer exponent is undefined in the reals')
	}
	if (b === 0) {
		return { v: 1, d: 0 }
	}
	if (b === 1) {
		return { v: a, d: da }
	}

	const v = Math.pow(a, b)
	if (!Number.isFinite(v)) {
		throw new RangeError('powerDualSeries result value overflowed to a non-finite number')
	}

	const d = computeBaseDerivativeTerm(a, da, b, v)
	if (!Number.isFinite(d)) {
		throw new RangeError('powerDualSeries result derivative is not finite')
	}

	return { v: normalizeZero(v), d: normalizeZero(d) }
}
