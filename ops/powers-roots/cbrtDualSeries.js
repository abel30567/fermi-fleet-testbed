/**
 * @typedef {object} Dual
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order forward-mode derivative) component.
 */

/**
 * Computes the real cube root of a dual number `x = v + d·ε` (where `ε² = 0`),
 * propagating both the value and its forward-mode first derivative.
 *
 * Uses the first-order binomial / Taylor series expansion around `v`:
 *
 * ```text
 * cbrt(v + d·ε) = v^(1/3) · (1 + (d / v)·ε)^(1/3)
 *               = v^(1/3) · (1 + (1/3)·(d / v)·ε + O(ε²))
 *               = cbrt(v) + (d / (3 · cbrt(v)²))·ε
 * ```
 *
 * Negative primal values `v < 0` are handled cleanly via `Math.cbrt`, since the
 * real cube root is defined and strictly increasing on all of ℝ with positive
 * derivative `1 / (3 · cbrt(v)²)`. At `v = 0`, the derivative is singular:
 * `{ v: 0, d: 0 }` is returned when `d === 0`, and a `RangeError` is thrown
 * when `d !== 0`.
 *
 * @param {Dual} x - Input dual number `{ v, d }` with finite numeric components.
 * @returns {Dual} The cube root dual number `{ v: cbrt(x.v), d: x.d / (3 * cbrt(x.v)²) }`.
 * @throws {TypeError} If `x` is not a plain-like non-null object or if `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is not finite (`NaN` or `±Infinity`), if `x.v === 0 && x.d !== 0` (singular derivative), or if the resulting derivative overflows to a non-finite number.
 */
export function cbrtDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('cbrtDualSeries expects a dual number object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('cbrtDualSeries expects numeric properties v and d');
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('cbrtDualSeries expects finite numbers for v and d');
	}

	if (v === 0) {
		if (d !== 0) {
			throw new RangeError(
				'cbrtDualSeries derivative is singular at v = 0 when d !== 0',
			);
		}
		return { v: 0, d: 0 };
	}

	const r = Math.cbrt(v);
	const denom = 3 * r * r;
	const dr = d / denom;

	if (!Number.isFinite(dr)) {
		throw new RangeError(
			'cbrtDualSeries derivative overflowed to a non-finite value',
		);
	}

	return {
		v: r,
		d: dr === 0 ? 0 : dr,
	};
}
