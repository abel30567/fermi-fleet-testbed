/**
 * Validates that an argument is a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Value to validate.
 * @param {number} index - Zero-based argument position for diagnostic messages.
 * @throws {TypeError} If `dual` is not a non-null plain object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is NaN or infinite.
 */
function validateDual(dual, index) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError(
			`Argument at index ${index} must be a dual number object { v, d }`
		)
	}
	if (typeof dual.v !== 'number' || typeof dual.d !== 'number') {
		throw new TypeError(
			`Argument at index ${index} must have numeric properties v and d`
		)
	}
	if (!Number.isFinite(dual.v) || !Number.isFinite(dual.d)) {
		throw new RangeError(
			`Argument at index ${index} must have finite v and d values`
		)
	}
}

/**
 * Normalizes negative zero to positive zero for clean equality comparisons.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Divides two or more dual numbers `{ v, d }` left-associatively using an iterative
 * implementation of the forward-mode automatic differentiation quotient rule.
 *
 * A dual number `{ v, d }` represents `v + dε` where `ε² = 0`, carrying a primal value `v`
 * alongside its first derivative `d`. For two dual numbers `a = { v: a.v, d: a.d }` and
 * `b = { v: b.v, d: b.d }` with `b.v !== 0`, the quotient is:
 *
 *   `a / b = { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) }`
 *
 * For three or more arguments `divideDualIterative(d0, d1, d2, ...)`, division is folded
 * iteratively from left to right: `((d0 / d1) / d2) / ...`. Input objects are never mutated.
 *
 * @param {...{ v: number, d: number }} duals - Two or more dual numbers with finite `v` and `d`.
 * @returns {{ v: number, d: number }} The quotient dual number `{ v, d }`.
 * @throws {RangeError} If fewer than 2 dual numbers are provided.
 * @throws {TypeError} If any argument is not a non-null object with numeric `v` and `d`.
 * @throws {RangeError} If any argument has non-finite (`NaN`, `Infinity`, `-Infinity`) `v` or `d`.
 * @throws {RangeError} If any divisor (`index >= 1`) has `v === 0`.
 * @throws {RangeError} If an intermediate or final result overflows to a non-finite value.
 */
export function divideDualIterative(...duals) {
	if (duals.length < 2) {
		throw new RangeError(
			`divideDualIterative requires at least 2 dual numbers, received ${duals.length}`
		)
	}

	for (let i = 0; i < duals.length; i++) {
		validateDual(duals[i], i)
	}

	let v = duals[0].v
	let d = duals[0].d

	for (let i = 1; i < duals.length; i++) {
		const bv = duals[i].v
		const bd = duals[i].d

		if (bv === 0) {
			throw new RangeError(
				`Division by zero at argument index ${i}: divisor v must be non-zero`
			)
		}

		const nextV = v / bv
		const num = d * bv - v * bd
		const denom = bv * bv

		let nextD
		if (denom !== 0 && Number.isFinite(denom) && Number.isFinite(num)) {
			nextD = num / denom
		} else {
			// Algebraically identical form avoids spurious overflow/underflow in bv * bv
			nextD = (d - nextV * bd) / bv
		}

		if (!Number.isFinite(nextV) || !Number.isFinite(nextD)) {
			throw new RangeError(
				`Dual division overflow at argument index ${i}: result is not finite`
			)
		}

		v = nextV
		d = nextD
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	}
}
