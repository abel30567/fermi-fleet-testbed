/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order forward-mode derivative) component.
 */

/**
 * Computes the principal square root of a dual number `x = v + d·ε` (where `ε² = 0`)
 * using its exact first-order binomial / Taylor series expansion:
 *
 *   sqrt(v + d·ε) = sqrt(v) · (1 + (d / v)·ε)^(1/2)
 *                 = sqrt(v) · (1 + (1/2)·(d / v)·ε)     (higher-order terms vanish since ε² = 0)
 *                 = sqrt(v) + (d / (2 · sqrt(v)))·ε
 *
 * Boundary behavior at `v = 0`:
 * - When `v === 0` and `d === 0`, returns `{ v: 0, d: 0 }`.
 * - When `v === 0` and `d !== 0`, throws a `RangeError` because `d / (2 · sqrt(v))`
 *   diverges (the derivative of `sqrt` is undefined at zero).
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite numeric components and `v >= 0`.
 * @returns {DualNumber} The square root dual number `{ v: sqrt(v), d: d / (2 * sqrt(v)) }`.
 * @throws {TypeError} If `x` is not a non-null, non-array object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is not finite, if `v < 0`, if `v === 0 && d !== 0`,
 *   or if the resulting derivative overflows to a non-finite number.
 */
export function sqrtDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v < 0) {
		throw new RangeError('Cannot compute real square root of dual number with v < 0')
	}

	if (v === 0) {
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError('Derivative of sqrt at v = 0 is undefined when d !== 0')
	}

	const root = Math.sqrt(v)
	const deriv = d === 0 ? 0 : d / (2 * root)

	if (!Number.isFinite(deriv)) {
		throw new RangeError('Computed derivative overflowed to a non-finite number')
	}

	return { v: root, d: deriv }
}
