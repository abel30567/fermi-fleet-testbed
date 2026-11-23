/**
 * Robust logical OR over plain booleans and order-stable union over JS `Set` objects.
 *
 * Semantics:
 * - **Boolean mode**: When all operands are primitive booleans (`typeof x === 'boolean'`),
 *   returns the exact logical disjunction (`a || b || ...`). Unlike JavaScript's built-in
 *   `||` operator, all operands are strictly validated before evaluation (preventing
 *   short-circuiting past invalid inputs and rejecting truthy/falsy coercions or boxed
 *   `Boolean` objects).
 * - **Set mode**: When all operands are genuine `Set` instances (verified via the internal
 *   `[[SetData]]` slot rather than duck-typing), returns a brand-new `Set` representing the
 *   order-stable union (`S_0 ∪ S_1 ∪ ...`), preserving first-seen left-to-right insertion
 *   order without mutating any input set, avoiding intermediate spread-array allocations,
 *   canonicalizing `-0` to `+0`, and verifying exact cardinality conservation bounds
 *   (`max |S_i| <= |U| <= sum |S_i|` and `|U| + duplicates === sum |S_i|`) using exact
 *   arbitrary-precision `BigInt` counters.
 *
 * @param {...(boolean|Set<*>)} operands - Two or more operands, either all plain booleans
 *   or all `Set` instances.
 * @returns {boolean|Set<*>} Logical OR of the booleans, or a new `Set` containing the
 *   order-stable union of the input sets.
 * @throws {TypeError} If fewer than two operands are provided, if any operand is neither a
 *   plain boolean nor a genuine `Set`, or if boolean and `Set` operands are mixed.
 * @throws {RangeError} If the internal set-union cardinality conservation invariant fails.
 */

const setSizeGetter = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get
const setValues = Set.prototype.values

/**
 * Verifies that a value is a genuine JS `Set` instance by checking its internal
 * `[[SetData]]` slot via `Set.prototype.size`.
 *
 * @param {*} value - Candidate value to check.
 * @returns {boolean} `true` if `value` is a genuine `Set`, `false` otherwise.
 */
function isRealSet(value) {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	try {
		setSizeGetter.call(value)
		return true
	} catch {
		return false
	}
}

/**
 * Formats a concise type description for validation error messages.
 *
 * @param {*} value - Value to describe.
 * @returns {string} Human-readable type label.
 */
function describeType(value) {
	if (value === null) return 'null'
	if (isRealSet(value)) return 'Set'
	if (typeof value === 'object') {
		const ctor = value.constructor?.name
		return ctor ? `object (${ctor})` : 'object'
	}
	return typeof value
}

export function orBoolStable(...operands) {
	if (operands.length < 2) {
		throw new TypeError(
			`orBoolStable requires at least 2 operands, received ${operands.length}`
		)
	}

	const first = operands[0]

	if (typeof first === 'boolean') {
		// Validate every operand before evaluation so invalid trailing operands are never skipped.
		for (let i = 1; i < operands.length; i += 1) {
			if (typeof operands[i] !== 'boolean') {
				throw new TypeError(
					`orBoolStable expected all operands to be plain booleans; operand at index ${i} has type ${describeType(operands[i])}`
				)
			}
		}

		let result = false
		for (let i = 0; i < operands.length; i += 1) {
			if (operands[i]) {
				result = true
			}
		}
		return result
	}

	if (isRealSet(first)) {
		// Validate every operand up front.
		for (let i = 1; i < operands.length; i += 1) {
			if (!isRealSet(operands[i])) {
				throw new TypeError(
					`orBoolStable expected all operands to be Set instances; operand at index ${i} has type ${describeType(operands[i])}`
				)
			}
		}

		const result = new Set()
		let totalInputSize = 0n
		let maxInputSize = 0n
		let duplicateCount = 0n

		for (let i = 0; i < operands.length; i += 1) {
			const currentSet = operands[i]
			const currentSize = BigInt(setSizeGetter.call(currentSet))
			totalInputSize += currentSize
			if (currentSize > maxInputSize) {
				maxInputSize = currentSize
			}

			for (const item of setValues.call(currentSet)) {
				const canonicalItem = Object.is(item, -0) ? 0 : item
				if (result.has(canonicalItem)) {
					duplicateCount += 1n
				} else {
					result.add(canonicalItem)
				}
			}
		}

		const resultSize = BigInt(result.size)
		if (
			resultSize < maxInputSize ||
			resultSize > totalInputSize ||
			resultSize + duplicateCount !== totalInputSize
		) {
			throw new RangeError(
				'orBoolStable: set union cardinality conservation invariant violated'
			)
		}

		return result
	}

	throw new TypeError(
		`orBoolStable expects all operands to be plain booleans or all operands to be Set instances; operand at index 0 has type ${describeType(first)}`
	)
}
