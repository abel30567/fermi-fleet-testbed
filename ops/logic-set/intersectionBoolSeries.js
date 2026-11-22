/**
 * Computes the logical/set-theoretic intersection of two plain booleans or two
 * JavaScript `Set` instances using the characteristic (indicator) function
 * product identity.
 *
 * Algorithm / Identity:
 * - For plain booleans `a` and `b`, let the indicator function be
 *   `χ(v) = v ? 1 : 0 ∈ {0, 1}`. Logical conjunction satisfies the exact
 *   bilinear product identity:
 *     `χ(a ∧ b) = χ(a) · χ(b)`
 *   so `a ∧ b` holds if and only if `χ(a) · χ(b) === 1`.
 * - For finite `Set` objects `A` and `B`, let `χ_S(x) = 1` if `x ∈ S` and `0`
 *   otherwise. Set intersection satisfies the pointwise indicator product
 *   identity for every candidate element `x`:
 *     `χ_{A ∩ B}(x) = χ_A(x) · χ_B(x)`
 *   Since `χ_S(x) = 0` for any `x ∉ S`, iterating over the smaller set
 *   suffices to evaluate all elements with potentially non-zero product in
 *   `O(min(|A|, |B|))` expected time while preserving JS `Set` (SameValueZero)
 *   membership semantics.
 *
 * @param {boolean | Set<*>} a - First operand (plain boolean or JS `Set`).
 * @param {boolean | Set<*>} b - Second operand (must match the type category of `a`).
 * @returns {boolean | Set<*>} Plain boolean intersection when given booleans,
 *   or a newly allocated `Set` containing the intersection when given `Set`s.
 * @throws {TypeError} If inputs are not either both plain booleans or both JS
 *   `Set` instances.
 */
export function intersectionBoolSeries(a, b) {
	const aIsBool = typeof a === 'boolean'
	const bIsBool = typeof b === 'boolean'

	if (aIsBool && bIsBool) {
		const chiA = a ? 1 : 0
		const chiB = b ? 1 : 0
		return chiA * chiB === 1
	}

	const aIsSet = a instanceof Set
	const bIsSet = b instanceof Set

	if (aIsSet && bIsSet) {
		const result = new Set()
		const candidates = a.size <= b.size ? a : b

		for (const x of candidates) {
			const chiA = a.has(x) ? 1 : 0
			const chiB = b.has(x) ? 1 : 0
			if (chiA * chiB === 1) {
				result.add(x)
			}
		}

		return result
	}

	throw new TypeError(
		'intersectionBoolSeries expects either two plain booleans or two Set instances'
	)
}
