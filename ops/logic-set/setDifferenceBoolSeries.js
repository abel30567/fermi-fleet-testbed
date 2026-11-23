/**
 * Computes the set difference `a \ b` (relative complement / material nonimplication)
 * over plain booleans or JS `Set` objects using the closed-form characteristic-polynomial
 * (Zhegalkin indicator) identity:
 *
 *   chi_{A \ B}(x) = chi_A(x) * (1 - chi_B(x)) = chi_A(x) - chi_A(x) * chi_B(x)
 *
 * For plain booleans (`false` -> 0, `true` -> 1), this evaluates `u - u * v === 1`,
 * equivalent to `a && !b`.
 *
 * For `Set` instances, this returns a new `Set` containing every element `x` of `a`
 * for which `chi_A(x) - chi_A(x) * chi_B(x) === 1`, without mutating either input.
 *
 * @param {boolean | Set<*>} a - Left operand (minuend boolean or Set).
 * @param {boolean | Set<*>} b - Right operand (subtrahend boolean or Set).
 * @returns {boolean | Set<*>} The boolean or Set difference `a \ b`.
 * @throws {TypeError} If operands are not both plain booleans or both `Set` instances.
 */
export function setDifferenceBoolSeries(a, b) {
	const aIsBool = typeof a === 'boolean'
	const bIsBool = typeof b === 'boolean'
	if (aIsBool && bIsBool) {
		const u = a ? 1 : 0
		const v = b ? 1 : 0
		return u - u * v === 1
	}

	const aIsSet = a instanceof Set
	const bIsSet = b instanceof Set
	if (aIsSet && bIsSet) {
		const result = new Set()
		for (const element of a) {
			const u = 1
			const v = b.has(element) ? 1 : 0
			if (u - u * v === 1) {
				result.add(element)
			}
		}
		return result
	}

	if ((aIsBool && bIsSet) || (aIsSet && bIsBool)) {
		throw new TypeError(
			'setDifferenceBoolSeries requires both arguments to be of the same kind (both booleans or both Set instances)'
		)
	}

	throw new TypeError(
		'setDifferenceBoolSeries expects either two plain booleans or two Set instances'
	)
}
