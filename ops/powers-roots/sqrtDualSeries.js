/**
 * Compute the square root of a dual number `{ v, d }` representing `v + d * ε` (with `ε² = 0`).
 *
 * Uses the exact dual-number binomial/Taylor series expansion around `v`:
 *
 *   √(v + d·ε) = √v · √(1 + (d / v)·ε)
 *              = √v · (1 + (1/2)·(d / v)·ε)   (all O(ε²) terms vanish)
 *              = √v + (d / (2·√v))·ε
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite real value `v >= 0` and finite derivative `d`.
 * @returns {{ v: number, d: number }} Dual number representing `√x` and its forward-mode derivative.
 * @throws {TypeError} If `x` is not a non-null, non-array object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not finite, if `v < 0`, or if `v === 0` with `d !== 0` (singular derivative).
 */
export function sqrtDualSeries(x) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError('Input must be a dual number object of shape { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number properties "v" and "d" must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number properties "v" and "d" must be finite numbers')
	}

	if (v < 0) {
		throw new RangeError('Cannot compute real square root of a dual number with negative value (v < 0)')
	}

	if (v === 0) {
		if (d !== 0) {
			throw new RangeError('Derivative of sqrt is undefined at v = 0 when d !== 0')
		}
		return { v: 0, d: 0 }
	}

	const root = Math.sqrt(v)
	const deriv = d === 0 ? 0 : d / (2 * root)

	return { v: root, d: deriv }
}
