/**
 * @typedef {{ v: number, d: number }} DualNumber
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Candidate dual number to validate.
 * @param {number} index - Zero-based argument index for error reporting.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If the operand is not a plain object or its `v`/`d` properties are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertValidDual(dual, index) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(
			`Argument at index ${index} must be a dual number object { v, d }`,
		)
	}

	const { v, d } = dual

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(
			`Argument at index ${index} must have numeric properties "v" and "d"`,
		)
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(
			`Argument at index ${index} must have finite "v" and "d" values`,
		)
	}

	return dual
}

/**
 * Adds two or more dual numbers `{ v, d }` using a straightforward iterative sum.
 *
 * A dual number represents `v + d*ε` with `ε² = 0`, carrying a primal value `v`
 * alongside its forward-mode derivative `d`. Addition over dual numbers is
 * componentwise:
 *
 *   Σ (v_i + d_i·ε) = (Σ v_i) + (Σ d_i)·ε
 *
 * which implements the sum rule of differentiation `(f₁ + ... + fₙ)' = f₁' + ... + fₙ'`.
 *
 * @param {...DualNumber} duals - Two or more dual numbers `{ v, d }` with finite numeric components.
 * @returns {DualNumber} A new dual number `{ v, d }` equal to the sum of all operands.
 * @throws {RangeError} If fewer than 2 operands are provided, any component is non-finite, or the sum overflows to a non-finite number.
 * @throws {TypeError} If any operand is not a non-null non-array object with numeric `v` and `d` properties.
 */
export function addDualIterative(...duals) {
	if (duals.length < 2) {
		throw new RangeError(
			'addDualIterative requires at least 2 dual number arguments',
		)
	}

	let sumV = 0
	let sumD = 0

	for (let i = 0; i < duals.length; i += 1) {
		const dual = assertValidDual(duals[i], i)
		sumV += dual.v
		sumD += dual.d
	}

	if (!Number.isFinite(sumV) || !Number.isFinite(sumD)) {
		throw new RangeError(
			'Dual number addition overflowed finite IEEE-754 number range',
		)
	}

	return {
		v: sumV === 0 ? 0 : sumV,
		d: sumD === 0 ? 0 : sumD,
	}
}
