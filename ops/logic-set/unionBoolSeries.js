/**
 * Evaluates the closed-form inclusion-exclusion (algebraic normal form) identity
 * for binary union on indicator values in {0, 1}:
 *
 *   χ_union(u, v) = u + v - u · v = ∑_{k=1}^{2} (-1)^{k-1} e_k(u, v)
 *
 * where e_1(u, v) = u + v and e_2(u, v) = u · v are the elementary symmetric
 * polynomials in the indicator variables.
 *
 * @param {0 | 1} u - Indicator value for the first operand.
 * @param {0 | 1} v - Indicator value for the second operand.
 * @returns {0 | 1} Indicator value of the union.
 */
function unionIndicator(u, v) {
	return u + v - u * v
}

/**
 * Computes the logical/set-theoretic union of two plain booleans or two JS `Set`
 * objects using the closed-form inclusion-exclusion (algebraic normal form)
 * series identity.
 *
 * Algorithm / Identity:
 * - For plain booleans `a, b ∈ {false, true}`, map each operand to its indicator
 *   `χ(false) = 0`, `χ(true) = 1` and evaluate the finite alternating
 *   inclusion-exclusion identity:
 *     `χ(a ∨ b) = χ(a) + χ(b) - χ(a) · χ(b)`
 *   returning `χ(a ∨ b) === 1`.
 * - For JS `Set` objects `A` and `B`, evaluate the pointwise indicator-function
 *   inclusion-exclusion identity across all candidate elements `x` drawn from
 *   `A` and `B`:
 *     `χ_{A ∪ B}(x) = χ_A(x) + χ_B(x) - χ_A(x) · χ_B(x)`
 *   and include `x` in the newly constructed result `Set` if and only if
 *   `χ_{A ∪ B}(x) === 1`.
 *
 * Neither input `Set` is mutated; a new `Set` instance is always returned.
 *
 * @template T
 * @param {boolean | Set<T>} a - First operand (plain boolean or JS `Set`).
 * @param {boolean | Set<T>} b - Second operand (must match the type of `a`).
 * @returns {boolean | Set<T>} The union `a ∨ b` for booleans, or a new `Set`
 *   representing `a ∪ b` for `Set` inputs.
 * @throws {TypeError} If `a` and `b` are not either both plain booleans or both
 *   JS `Set` instances.
 */
export function unionBoolSeries(a, b) {
	const aIsBool = typeof a === 'boolean'
	const bIsBool = typeof b === 'boolean'

	if (aIsBool && bIsBool) {
		const chiA = a ? 1 : 0
		const chiB = b ? 1 : 0
		return unionIndicator(chiA, chiB) === 1
	}

	const aIsSet = a instanceof Set
	const bIsSet = b instanceof Set

	if (aIsSet && bIsSet) {
		const result = new Set()

		for (const x of a) {
			const chiA = a.has(x) ? 1 : 0
			const chiB = b.has(x) ? 1 : 0
			if (unionIndicator(chiA, chiB) === 1) {
				result.add(x)
			}
		}

		for (const x of b) {
			if (result.has(x)) {
				continue
			}
			const chiA = a.has(x) ? 1 : 0
			const chiB = b.has(x) ? 1 : 0
			if (unionIndicator(chiA, chiB) === 1) {
				result.add(x)
			}
		}

		return result
	}

	throw new TypeError(
		'unionBoolSeries expects either two plain booleans or two Set instances'
	)
}
