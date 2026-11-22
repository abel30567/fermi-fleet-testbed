/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Tangent (first-order derivative) component.
 */

/**
 * Computes the inverse sine (arcsin) over a dual number `x = v + d·ε` (with `ε² = 0`),
 * propagating both the primal value and its forward-mode derivative.
 *
 * Mathematical definition:
 * ```
 * arcsin(v + d·ε) = arcsin(v) + (d / √(1 - v²))·ε
 * ```
 *
 * The denominator is evaluated as `√((1 - v) · (1 + v))` to reduce floating-point
 * cancellation when `|v|` approaches `1`.
 *
 * Domain and boundary behavior:
 * - Requires `v ∈ [-1, 1]` and finite `v`, `d`.
 * - For `|v| > 1`, throws a `RangeError`.
 * - At the boundary `|v| === 1`, the derivative `1 / √(1 - v²)` has a singularity:
 *   - If `d === 0`, returns `{ v: Math.asin(v), d: 0 }`.
 *   - If `d !== 0`, throws a `RangeError`.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite numbers `v` and `d`.
 * @returns {DualNumber} Dual number `{ v, d }` representing `arcsin(x)` and its derivative.
 * @throws {TypeError} If `x` is not a non-null plain dual-number object or `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is non-finite, if `|v| > 1`, or if `|v| === 1` with `d !== 0`.
 *
 * @example
 * arcsinDualSeries({ v: 0.5, d: 1 })
 * // => { v: 0.5235987755982989, d: 1.1547005383792517 }
 */
export function arcsinDualSeries(x) {
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

	const absV = Math.abs(v)

	if (absV > 1) {
		throw new RangeError(`arcsinDualSeries domain error: |v| must be <= 1 (received v=${v})`)
	}

	if (absV === 1) {
		if (d === 0) {
			return { v: Math.asin(v), d: 0 }
		}
		throw new RangeError(
			`arcsinDualSeries singularity: derivative 1/sqrt(1 - v^2) is undefined at |v| === 1 with non-zero d (received v=${v}, d=${d})`
		)
	}

	const value = Math.asin(v)
	const derivative = d === 0 ? 0 : d / Math.sqrt((1 - v) * (1 + v))

	return { v: value, d: derivative }
}
