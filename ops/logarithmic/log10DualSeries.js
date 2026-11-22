/**
 * @typedef {object} DualNumber
 * @property {number} v Primal (real) component.
 * @property {number} d Dual (first-order derivative) component.
 */

/**
 * Computes the base-10 logarithm of a dual number `x = v + d·ε` (with `ε² = 0`)
 * using its exact first-order Taylor series expansion around `v > 0`:
 *
 * ```text
 * log10(v + d·ε) = log10(v) + log10(1 + (d / v)·ε)
 *                = log10(v) + (1 / ln(10)) · ln(1 + (d / v)·ε)
 *                = log10(v) + (d / (v · ln(10))) · ε
 * ```
 *
 * All higher-order terms of the Mercator series `Σ (-1)^(k-1) / k · ((d / v)·ε)^k`
 * vanish identically for `k >= 2` because `ε² = 0`.
 *
 * @param {DualNumber} dual Input dual number `{ v, d }` with finite numbers and `v > 0`.
 * @returns {DualNumber} Resulting dual number `{ v, d }` representing `log10(v + d·ε)`.
 * @throws {TypeError} If `dual` is not a non-null, non-array object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is not finite, or if `v <= 0`.
 */
export function log10DualSeries(dual) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = dual

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v <= 0) {
		throw new RangeError('Dual number primal component v must be strictly positive (> 0)')
	}

	const primal = Math.log10(v)

	// Compute d / (v * Math.LN10) without spurious overflow at extreme scales:
	// - Avoids `v * Math.LN10` overflowing when `v > Number.MAX_VALUE / Math.LN10`
	// - Avoids `v * Math.LN10` losing precision for subnormal `v`
	// - Falls back to `(d / Math.LN10) / v` if `d / v` overflows while the true result is finite
	const ratio = d / v
	const derivative = Number.isFinite(ratio)
		? ratio / Math.LN10
		: (d / Math.LN10) / v

	return { v: primal, d: derivative }
}
