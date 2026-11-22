/**
 * Computes the logical disjunction (OR) of two or more plain booleans, or the
 * set union of two or more JS `Set` instances, using the Boolean-ring /
 * De Morgan / factored inclusion-exclusion indicator identity.
 *
 * Algorithm:
 * - For plain booleans `x_1, ..., x_n`, map each value via the indicator
 *   function `I(false) = 0`, `I(true) = 1` and evaluate the closed-form
 *   factored inclusion-exclusion polynomial:
 *     `I(x_1 ∨ ... ∨ x_n) = 1 - ∏_{i=1}^{n} (1 - I(x_i))`
 *   returning `true` iff the resulting indicator equals `1`.
 * - For `Set` instances `S_1, ..., S_n`, construct a new `Set` without mutating
 *   any input by folding the pointwise indicator identity:
 *     `1_{A ∪ B}(e) = 1 - (1 - 1_A(e)) * (1 - 1_B(e))`
 *   over every element `e` across the operand sets.
 *
 * @param {boolean | Set<any>} a - First operand (plain boolean or `Set`).
 * @param {boolean | Set<any>} b - Second operand (must match the kind of `a`).
 * @param {...(boolean | Set<any>)} rest - Optional additional operands matching `a`.
 * @returns {boolean | Set<any>} Logical OR (for booleans) or a new union `Set` (for sets).
 * @throws {TypeError} If fewer than 2 arguments are provided, if any argument is
 *   neither a plain boolean nor a `Set` instance, or if boolean and `Set`
 *   arguments are mixed.
 */
export function orBoolSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`orBoolSeries requires at least 2 arguments, received ${arguments.length}`
		)
	}

	const operands = [a, b, ...rest]
	const first = operands[0]

	if (typeof first === 'boolean') {
		for (let i = 1; i < operands.length; i++) {
			if (typeof operands[i] !== 'boolean') {
				throw new TypeError(
					`orBoolSeries expects all arguments to be plain booleans or all Set instances; argument at index ${i} has type ${typeof operands[i]}`
				)
			}
		}

		let complementProduct = 1
		for (let i = 0; i < operands.length; i++) {
			const indicator = operands[i] ? 1 : 0
			complementProduct *= 1 - indicator
		}

		return 1 - complementProduct === 1
	}

	if (first instanceof Set) {
		for (let i = 1; i < operands.length; i++) {
			if (!(operands[i] instanceof Set)) {
				throw new TypeError(
					`orBoolSeries expects all arguments to be Set instances when the first argument is a Set; argument at index ${i} is not a Set`
				)
			}
		}

		const union = new Set()
		for (let i = 0; i < operands.length; i++) {
			const current = operands[i]
			for (const element of current) {
				const inUnion = union.has(element) ? 1 : 0
				const inCurrent = current.has(element) ? 1 : 0
				if (1 - (1 - inUnion) * (1 - inCurrent) === 1) {
					union.add(element)
				}
			}
		}

		return union
	}

	throw new TypeError(
		`orBoolSeries expects arguments to be plain booleans or Set instances; argument at index 0 has type ${typeof first}`
	)
}
