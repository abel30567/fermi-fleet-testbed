/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order derivative / infinitesimal) component.
 */

/**
 * Validates that the input is a finite dual number `{ v, d }` in the domain of `ln` (`v > 0`).
 *
 * @param {unknown} x - Value to validate.
 * @throws {TypeError} If `x` is not a non-null, non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is non-finite (`NaN`, `±Infinity`), or if `v <= 0`.
 */
function assertValidPositiveDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object with numeric properties { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number') {
		throw new TypeError('Expected dual number property "v" to be a number')
	}
	if (typeof d !== 'number') {
		throw new TypeError('Expected dual number property "d" to be a number')
	}
	if (!Number.isFinite(v)) {
		throw new RangeError('Expected dual number property "v" to be a finite number')
	}
	if (!Number.isFinite(d)) {
		throw new RangeError('Expected dual number property "d" to be a finite number')
	}
	if (v <= 0) {
		throw new RangeError(`Natural logarithm requires primal value v > 0; received v = ${v}`)
	}
}

/**
 * Computes the natural logarithm of a dual number `x = v + d*ε` (where `ε^2 = 0`),
 * propagating a forward-mode automatic derivative alongside the primal value.
 *
 * Derivation via the Mercator / Taylor series identity:
 * Factoring out the positive primal value `v`:
 *   ln(v + d*ε) = ln(v * (1 + (d / v)*ε))
 *               = ln(v) + ln(1 + u*ε),   where u = d / v.
 *
 * Expanding `ln(1 + u*ε)` with the Mercator series `Σ_{k=1..∞} ((-1)^(k-1) / k) * (u*ε)^k`,
 * every term with `k >= 2` contains `ε^k = 0` and vanishes identically, yielding the exact
 * closed-form dual-number result:
 *   ln(v + d*ε) = ln(v) + (d / v)*ε.
 *
 * For `v` near `1` (`|v - 1| <= 0.5`), `Math.log1p(v - 1)` is used for improved floating-point
 * accuracy without catastrophic cancellation.
 *
 * @param {DualNumber} x - Positive dual number `{ v, d }` with finite `v > 0` and finite `d`.
 * @returns {DualNumber} The resulting dual number `{ v: ln(x.v), d: x.d / x.v }`.
 * @throws {TypeError} If `x` is not a dual number object `{ v, d }` with numeric components.
 * @throws {RangeError} If `x.v <= 0`, if `x.v` or `x.d` is non-finite, or if `x.d / x.v` overflows.
 */
export function lnDualSeries(x) {
	assertValidPositiveDual(x)

	const { v, d } = x

	// Primal term: ln(v), using log1p near 1 for higher precision.
	const primal = Math.abs(v - 1) <= 0.5 ? Math.log1p(v - 1) : Math.log(v)

	// First-order Mercator series term: u = d / v (all higher-order terms vanish since ε^2 = 0).
	const dual = d === 0 ? 0 : d / v

	if (!Number.isFinite(dual)) {
		throw new RangeError('Dual derivative component d / v overflowed to a non-finite value')
	}

	return { v: primal, d: dual }
}
