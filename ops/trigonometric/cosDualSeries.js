/**
 * @typedef {object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order derivative / tangent) component.
 */

/**
 * Validates that the input is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} x - Value to validate.
 * @throws {TypeError} If `x` is not a non-null non-array object or if `x.v` or `x.d` is not a number.
 * @throws {RangeError} If `x.v` or `x.d` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}
	if (typeof x.v !== 'number') {
		throw new TypeError('Expected dual number property "v" to be a number')
	}
	if (typeof x.d !== 'number') {
		throw new TypeError('Expected dual number property "d" to be a number')
	}
	if (!Number.isFinite(x.v)) {
		throw new RangeError('Expected dual number property "v" to be a finite number')
	}
	if (!Number.isFinite(x.d)) {
		throw new RangeError('Expected dual number property "d" to be a finite number')
	}
}

/**
 * Computes the cosine of a dual number `x = v + d·ε` (where `ε² = 0`), propagating
 * its forward-mode first derivative alongside the primal value.
 *
 * Derivation via the angle-addition identity and Taylor series truncated at `ε² = 0`:
 *   cos(v + d·ε) = cos(v)·cos(d·ε) - sin(v)·sin(d·ε)
 *                = cos(v)·(1 + O(ε²)) - sin(v)·(d·ε + O(ε³))
 *                = cos(v) + (-d · sin(v))·ε
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite numbers `v` (angle in radians) and `d` (tangent).
 * @returns {DualNumber} Dual number `{ v: cos(x.v), d: -x.d * sin(x.v) }`, with `-0` normalized to `+0`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is not finite (`NaN` or `±Infinity`).
 */
export function cosDualSeries(x) {
	assertValidDual(x)

	const v = Math.cos(x.v)
	const d = -x.d * Math.sin(x.v)

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
