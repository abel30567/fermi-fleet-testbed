/**
 * Computes the logic-set intersection of two or more plain booleans or two or
 * more JavaScript `Set` objects using a closed-form indicator-product /
 * De Morgan series identity.
 *
 * Mathematical formulation:
 * - For plain booleans `b_1, ..., b_n`, let the indicator `I(b_k) ∈ {0, 1}` be
 *   `1` when `b_k === true` and `0` otherwise. The conjunction satisfies the
 *   closed-form identity:
 *     `I(b_1 ∧ ... ∧ b_n) = ∏_{k=1}^n I(b_k) = 1 - min(1, ∑_{k=1}^n (1 - I(b_k)))`.
 * - For `Set` objects `S_1, ..., S_n`, let `χ_k(x) ∈ {0, 1}` be the
 *   characteristic function of `S_k`. An element `x` belongs to `⋂_{k=1}^n S_k`
 *   iff the closed-form indicator product equals `1`:
 *     `χ_{⋂ S_k}(x) = ∏_{k=1}^n χ_k(x) = 1`,
 *   equivalently satisfying De Morgan's identity `U \ ⋃_{k=1}^n (U \ S_k)` over
 *   the finite universe `U = ⋃_{k=1}^n S_k`.
 *
 * @template T
 * @param {boolean | Set<T>} a - First operand (plain boolean or `Set`).
 * @param {boolean | Set<T>} b - Second operand (must match the kind of `a`).
 * @param {...(boolean | Set<T>)} rest - Optional additional operands of the same kind.
 * @returns {boolean | Set<T>} The logical conjunction (for booleans) or a new
 *   `Set` containing elements common to all input sets (for `Set` operands).
 * @throws {TypeError} If fewer than two arguments are provided, if any operand
 *   is neither a plain boolean nor a `Set`, or if boolean and `Set` operands
 *   are mixed.
 */
export function intersectionBoolSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'intersectionBoolSeries requires at least two operands (all plain booleans or all Set objects).'
		)
	}

	const operands = [a, b, ...rest]

	if (typeof a === 'boolean') {
		for (let i = 1; i < operands.length; i++) {
			if (typeof operands[i] !== 'boolean') {
				throw new TypeError(
					`Expected plain boolean at argument index ${i}, received ${describeValue(operands[i])}.`
				)
			}
		}

		// Closed-form indicator product: ∏_{k=1}^n I(b_k) ∈ {0, 1}
		let indicatorProduct = 1
		for (let i = 0; i < operands.length; i++) {
			indicatorProduct *= operands[i] ? 1 : 0
		}
		return indicatorProduct === 1
	}

	if (a instanceof Set) {
		for (let i = 1; i < operands.length; i++) {
			if (!(operands[i] instanceof Set)) {
				throw new TypeError(
					`Expected Set instance at argument index ${i}, received ${describeValue(operands[i])}.`
				)
			}
		}

		// Closed-form characteristic product over the candidate universe of S_1:
		// χ_{⋂ S_k}(x) = ∏_{k=1}^n χ_{S_k}(x) ∈ {0, 1}
		// Any element outside S_1 has χ_{S_1}(x) = 0, so its product is identically 0.
		const result = new Set()
		for (const item of a) {
			let indicatorProduct = 1
			for (let i = 1; i < operands.length; i++) {
				indicatorProduct *= operands[i].has(item) ? 1 : 0
			}
			if (indicatorProduct === 1) {
				result.add(item)
			}
		}
		return result
	}

	throw new TypeError(
		`Expected plain boolean or Set instance at argument index 0, received ${describeValue(a)}.`
	)
}

/**
 * Formats a value's runtime type for validation error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
	if (value === null) return 'null'
	if (typeof value === 'object') {
		const tag = value.constructor && value.constructor.name ? value.constructor.name : 'Object'
		return tag
	}
	return typeof value
}
