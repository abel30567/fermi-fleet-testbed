/**
 * Computes the logical XOR (for plain booleans) or symmetric difference (for JS Set objects)
 * using the closed-form multilinear / inclusion-exclusion indicator identity:
 *
 *   I(a XOR b) = I(a) + I(b) - 2 * I(a) * I(b)
 *
 * Equivalent to the Walsh-Fourier degree-2 closed form `(1 - (1 - 2x)(1 - 2y)) / 2`
 * over indicator values `x, y in {0, 1}`, and for sets to `(A union B) \ (A intersect B)`.
 *
 * @param {boolean | Set<*>} a - First operand (plain boolean or Set).
 * @param {boolean | Set<*>} b - Second operand (must match the kind of `a`).
 * @returns {boolean | Set<*>} Boolean XOR if inputs are booleans, or a new Set containing
 *   elements in exactly one of `a` or `b` if inputs are Sets.
 * @throws {TypeError} If inputs are not both plain booleans or both Set instances.
 */
export function xorBoolSeries(a, b) {
	const aIsBool = typeof a === 'boolean'
	const bIsBool = typeof b === 'boolean'

	if (aIsBool && bIsBool) {
		const x = a ? 1 : 0
		const y = b ? 1 : 0
		return x + y - 2 * x * y === 1
	}

	const aIsSet = a instanceof Set
	const bIsSet = b instanceof Set

	if (aIsSet && bIsSet) {
		const union = new Set(a)
		for (const item of b) {
			union.add(item)
		}

		const result = new Set()
		for (const item of union) {
			const x = a.has(item) ? 1 : 0
			const y = b.has(item) ? 1 : 0
			if (x + y - 2 * x * y === 1) {
				result.add(item)
			}
		}
		return result
	}

	throw new TypeError(
		'xorBoolSeries expects either two plain booleans or two Set instances'
	)
}
