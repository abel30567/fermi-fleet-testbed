/**
 * Validates a single dual number `{ v, d }`.
 *
 * @param {unknown} dual - Candidate dual number object.
 * @param {number} index - Zero-based argument index for error messages.
 * @throws {TypeError} If `dual` is not a non-null plain-like object or `v`/`d` are not numbers.
 * @throws {RangeError} If `dual.v` or `dual.d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(dual, index) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError(
			`multiplyDualIterative: argument ${index} must be a dual number object { v, d }`
		)
	}
	if (typeof dual.v !== 'number') {
		throw new TypeError(
			`multiplyDualIterative: argument ${index}.v must be a finite number`
		)
	}
	if (typeof dual.d !== 'number') {
		throw new TypeError(
			`multiplyDualIterative: argument ${index}.d must be a finite number`
		)
	}
	if (!Number.isFinite(dual.v)) {
		throw new RangeError(
			`multiplyDualIterative: argument ${index}.v must be finite, received ${dual.v}`
		)
	}
	if (!Number.isFinite(dual.d)) {
		throw new RangeError(
			`multiplyDualIterative: argument ${index}.d must be finite, received ${dual.d}`
		)
	}
}

/**
 * Multiplies two or more dual numbers `{ v, d }` iteratively using forward-mode
 * automatic differentiation (the product rule).
 *
 * A dual number `{ v, d }` represents `v + d*ε` with `ε² = 0`, where `v` is the
 * primal value and `d` is the first derivative with respect to an underlying
 * variable. For an accumulated dual `acc = { v, d }` and the next factor
 * `cur = { v, d }`, each iterative step computes:
 *
 *   `v_next = acc.v * cur.v`
 *   `d_next = acc.d * cur.v + acc.v * cur.d`
 *
 * Across `n >= 2` factors, this yields the exact product `∏ v_i` and the exact
 * generalized product-rule derivative `∑_k d_k ∏_{j ≠ k} v_j` without dividing
 * by `v_k`, so zero-valued factors are handled accurately.
 *
 * Input objects are never mutated. Signed `-0` components in the result are
 * normalized to `0`.
 *
 * @param {...{ v: number, d: number }} duals - Two or more dual numbers with finite numeric `v` and `d`.
 * @returns {{ v: number, d: number }} The product dual number `{ v, d }`.
 * @throws {RangeError} If fewer than 2 arguments are provided, any component is non-finite, or an intermediate/final value overflows finite IEEE-754 bounds.
 * @throws {TypeError} If any argument is not an object `{ v, d }` with numeric `v` and `d`.
 */
export function multiplyDualIterative(...duals) {
	if (duals.length < 2) {
		throw new RangeError(
			`multiplyDualIterative requires at least 2 dual numbers, received ${duals.length}`
		)
	}

	for (let i = 0; i < duals.length; i += 1) {
		validateDual(duals[i], i)
	}

	let accV = duals[0].v
	let accD = duals[0].d

	for (let i = 1; i < duals.length; i += 1) {
		const curV = duals[i].v
		const curD = duals[i].d

		const nextV = accV * curV
		const nextD = accD * curV + accV * curD

		if (!Number.isFinite(nextV) || !Number.isFinite(nextD)) {
			throw new RangeError(
				`multiplyDualIterative: product overflowed finite IEEE-754 bounds at factor ${i}`
			)
		}

		accV = nextV
		accD = nextD
	}

	return {
		v: accV === 0 ? 0 : accV,
		d: accD === 0 ? 0 : accD,
	}
}
