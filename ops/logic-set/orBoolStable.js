/**
 * Describe a runtime value's type for clear TypeError diagnostics.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (value instanceof Set) return 'Set'
	if (typeof value === 'object') {
		const ctorName = value.constructor?.name
		return ctorName ? `object (${ctorName})` : 'object'
	}
	return typeof value
}

/**
 * Numerically and structurally stable logical OR / set union (`orBoolStable`).
 *
 * Operates in one of two strictly typed modes determined by its arguments:
 * - **Boolean mode**: When every argument is a primitive `boolean`
 *   (`typeof x === 'boolean'`), returns their logical disjunction as a primitive
 *   `boolean`. All arguments are validated upfront before evaluation so invalid
 *   arguments are never masked by short-circuiting after a `true` operand, and
 *   the fold scans every operand deterministically.
 * - **Set mode**: When every argument is a JS `Set` instance, returns a brand-new
 *   `Set` representing the union (disjunction) of all input sets under standard
 *   `SameValueZero` equality (deduplicating `NaN` and normalizing `-0` to `+0`)
 *   without mutating any input set. Uses explicit iterative insertion rather than
 *   argument spreading to remain stack-safe on large sets.
 *
 * Mixing booleans and `Set` instances, passing fewer than two arguments, or
 * passing boxed `Boolean` objects or any other non-boolean/non-Set values
 * throws a `TypeError`.
 *
 * @overload
 * @param {boolean} a - First boolean operand.
 * @param {boolean} b - Second boolean operand.
 * @param {...boolean} rest - Additional boolean operands.
 * @returns {boolean} Logical OR of all boolean operands.
 *
 * @overload
 * @template T
 * @param {Set<T>} a - First Set operand.
 * @param {Set<T>} b - Second Set operand.
 * @param {...Set<T>} rest - Additional Set operands.
 * @returns {Set<T>} New Set containing the union of all input Sets.
 *
 * @throws {TypeError} If fewer than 2 arguments are provided, or if arguments
 *   are not all primitive booleans or all `Set` instances.
 */
export function orBoolStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`orBoolStable: expected at least 2 arguments, got ${arguments.length}`
		)
	}

	const args = [a, b, ...rest]
	const first = args[0]

	if (typeof first === 'boolean') {
		// Validate every argument upfront so invalid types after `true` are never masked.
		for (let i = 1; i < args.length; i++) {
			if (typeof args[i] !== 'boolean') {
				const extra =
					args[i] instanceof Set ? ' (cannot mix booleans and Sets)' : ''
				throw new TypeError(
					`orBoolStable: expected all arguments to be primitive booleans, got ${describeType(args[i])} at argument ${i}${extra}`
				)
			}
		}

		let acc = 0
		for (let i = 0; i < args.length; i++) {
			acc |= args[i] ? 1 : 0
		}
		return acc === 1
	}

	if (first instanceof Set) {
		// Validate every argument upfront before allocating or iterating.
		for (let i = 1; i < args.length; i++) {
			if (!(args[i] instanceof Set)) {
				const extra =
					typeof args[i] === 'boolean' ? ' (cannot mix Sets and booleans)' : ''
				throw new TypeError(
					`orBoolStable: expected all arguments to be Set instances, got ${describeType(args[i])} at argument ${i}${extra}`
				)
			}
		}

		const union = new Set()
		for (let i = 0; i < args.length; i++) {
			for (const item of args[i]) {
				union.add(item)
			}
		}
		return union
	}

	throw new TypeError(
		`orBoolStable: expected all arguments to be primitive booleans or all Set instances, got ${describeType(first)} at argument 0`
	)
}
