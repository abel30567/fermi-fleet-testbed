/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Value to validate.
 * @param {number} index - Positional index in the argument list for error reporting.
 * @throws {TypeError} If `dual` is not a non-null, non-array object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is `NaN` or non-finite (`±Infinity`).
 */
function validateDual(dual, index) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(
			`Dual number at argument index ${index} must be a non-null object with numeric { v, d } properties`,
		)
	}
	if (typeof dual.v !== 'number') {
		throw new TypeError(
			`Dual number at argument index ${index} must have a numeric "v" property`,
		)
	}
	if (typeof dual.d !== 'number') {
		throw new TypeError(
			`Dual number at argument index ${index} must have a numeric "d" property`,
		)
	}
	if (!Number.isFinite(dual.v)) {
		throw new RangeError(
			`Dual number at argument index ${index} has non-finite "v" value: ${dual.v}`,
		)
	}
	if (!Number.isFinite(dual.d)) {
		throw new RangeError(
			`Dual number at argument index ${index} has non-finite "d" value: ${dual.d}`,
		)
	}
}

/**
 * Subtracts two or more dual numbers `{ v, d }` using straightforward left-associative iteration.
 *
 * A dual number `a = v + d·ε` (with `ε² = 0`) carries a primal value `v` alongside its
 * forward-mode derivative `d`. Subtraction over dual numbers is component-wise and follows
 * the linearity of differentiation:
 *
 *   (a₀ - a₁ - ... - aₙ₋₁) = { v: v₀ - v₁ - ... - vₙ₋₁, d: d₀ - d₁ - ... - dₙ₋₁ }
 *
 * Inputs are never mutated and a new `{ v, d }` object is returned.
 *
 * @param {...{ v: number, d: number }} duals - Two or more dual numbers `{ v, d }` with finite numeric components.
 * @returns {{ v: number, d: number }} The left-associative difference `{ v, d }`.
 * @throws {RangeError} If fewer than two dual numbers are provided, if any `v` or `d` is non-finite/`NaN`,
 *   or if the subtraction overflows IEEE-754 double precision.
 * @throws {TypeError} If any argument is not a non-null object or has a non-numeric `v` or `d` property.
 */
export function subtractDualIterative(...duals) {
	if (duals.length < 2) {
		throw new RangeError(
			`subtractDualIterative requires at least 2 dual numbers, received ${duals.length}`,
		)
	}

	for (let i = 0; i < duals.length; i += 1) {
		validateDual(duals[i], i)
	}

	let v = duals[0].v
	let d = duals[0].d

	for (let i = 1; i < duals.length; i += 1) {
		v -= duals[i].v
		d -= duals[i].d

		if (!Number.isFinite(v) || !Number.isFinite(d)) {
			throw new RangeError(
				`Dual subtraction overflowed to a non-finite value at argument index ${i}`,
			)
		}
	}

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
