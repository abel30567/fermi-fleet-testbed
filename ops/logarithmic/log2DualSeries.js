/**
 * @typedef {Object} DualNumber
 * @property {number} v Primal value (real part).
 * @property {number} d Tangent / derivative value (dual part, coefficient of ε where ε² = 0).
 */

/**
 * Validates that the input is a dual number `{ v, d }` with finite numeric
 * components and a strictly positive primal value `v > 0`.
 *
 * @param {unknown} x Input value to validate.
 * @returns {DualNumber} The validated dual number components `{ v, d }`.
 * @throws {TypeError} If `x` is not a non-null plain/object or `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` are not finite, or if `v <= 0`.
 */
function validatePositiveDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('log2DualSeries: input must be a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number') {
		throw new TypeError('log2DualSeries: dual value "v" must be a number')
	}
	if (typeof d !== 'number') {
		throw new TypeError('log2DualSeries: dual derivative "d" must be a number')
	}

	if (!Number.isFinite(v)) {
		throw new RangeError('log2DualSeries: dual value "v" must be a finite number')
	}
	if (!Number.isFinite(d)) {
		throw new RangeError('log2DualSeries: dual derivative "d" must be a finite number')
	}
	if (v <= 0) {
		throw new RangeError('log2DualSeries: dual value "v" must be strictly positive (v > 0)')
	}

	return { v, d }
}

/**
 * Computes the base-2 logarithm of a dual number `x = v + d·ε` (with `ε² = 0`),
 * carrying the exact forward-mode derivative alongside the primal value.
 *
 * Using the factorization `v + d·ε = v · (1 + (d / v)·ε)` and the Mercator
 * power series `ln(1 + u) = u - u²/2 + u³/3 - ...`, all terms of degree ≥ 2
 * vanish identically because `ε² = 0`, yielding the exact identity:
 *
 *   log2(v + d·ε) = log2(v) + (d / (v · ln 2)) · ε
 *
 * @param {DualNumber} x Positive dual number `{ v, d }` with finite `v > 0` and finite `d`.
 * @returns {DualNumber} Resulting dual number `{ v: log2(v), d: d / (v * Math.LN2) }`.
 * @throws {TypeError} If `x` is not a dual number object `{ v, d }` with numeric fields.
 * @throws {RangeError} If `v` or `d` is non-finite (`NaN`, `±Infinity`), or if `v <= 0`.
 *
 * @example
 * log2DualSeries({ v: 8, d: 1 })
 * // => { v: 3, d: 1 / (8 * Math.LN2) }
 */
export function log2DualSeries(x) {
	const { v, d } = validatePositiveDual(x)

	const value = Math.log2(v)
	const derivative = d / (v * Math.LN2)

	return {
		v: value === 0 ? 0 : value,
		d: derivative === 0 ? 0 : derivative,
	}
}
