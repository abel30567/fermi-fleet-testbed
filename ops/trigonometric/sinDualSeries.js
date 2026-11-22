/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Tangent (first-order derivative / dual) component.
 */

/**
 * Validates that the input is a finite dual number `{ v, d }`.
 *
 * @param {unknown} x - Candidate dual number to validate.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `x` is not a non-null plain object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN` or not finite (`±Infinity`).
 */
function validateDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number') {
		throw new TypeError('Dual number property "v" must be a number')
	}
	if (typeof d !== 'number') {
		throw new TypeError('Dual number property "d" must be a number')
	}
	if (!Number.isFinite(v)) {
		throw new RangeError('Dual number property "v" must be a finite number')
	}
	if (!Number.isFinite(d)) {
		throw new RangeError('Dual number property "d" must be a finite number')
	}

	return { v, d }
}

/**
 * Evaluates the sine function over a dual number `x = v + d·ε` (where `ε² = 0`),
 * computing both the primal value and its exact forward-mode derivative.
 *
 * Derived from the angle-addition identity and Maclaurin/Taylor expansion truncated at `ε² = 0`:
 *
 * ```text
 * sin(v + d·ε) = sin(v)·cos(d·ε) + cos(v)·sin(d·ε)
 *              = sin(v)·(1 - O(ε²)) + cos(v)·(d·ε - O(ε³))
 *              = sin(v) + (d · cos(v))·ε
 * ```
 *
 * Because `|sin(v)| <= 1` and `|cos(v)| <= 1`, the result is guaranteed to remain finite
 * for all finite inputs `{ v, d }`.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite numeric components.
 * @returns {DualNumber} Resulting dual number `{ v: sin(x.v), d: x.d * cos(x.v) }`.
 * @throws {TypeError} If `x` is not a valid dual number object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function sinDualSeries(x) {
	const { v, d } = validateDual(x)

	const sinV = Math.sin(v)
	const cosV = Math.cos(v)
	const dual = d === 0 ? 0 : d * cosV

	return {
		v: sinV,
		d: dual === 0 ? 0 : dual,
	}
}
