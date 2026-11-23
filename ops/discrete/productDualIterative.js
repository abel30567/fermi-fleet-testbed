/**
 * @typedef {{ v: number, d: number }} DualNumber
 */

/**
 * Computes the discrete product of a sequence of dual numbers `{ v, d }`,
 * propagating forward-mode derivatives alongside primal values using a
 * straightforward single-pass iterative algorithm.
 *
 * Each dual number represents `v + d*ε` with `ε² = 0`. Multiplication follows
 * the product rule:
 * `(v1 + d1*ε) * (v2 + d2*ε) = (v1 * v2) + (v1 * d2 + d1 * v2)*ε`.
 *
 * For an empty sequence, returns the multiplicative identity `{ v: 1, d: 0 }`.
 *
 * @param {Iterable<DualNumber>} terms - Array or iterable of dual numbers `{ v, d }`.
 * @returns {DualNumber} Fresh dual number `{ v, d }` containing the product value and derivative.
 * @throws {TypeError} If `terms` is not a non-string iterable, or any element is not a
 *   non-null non-array object with numeric `v` and `d` properties.
 * @throws {RangeError} If any element's `v` or `d` value is not a finite number.
 */
export function productDualIterative(terms) {
	if (
		terms === null ||
		terms === undefined ||
		typeof terms === 'string' ||
		terms instanceof String ||
		typeof terms[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('terms must be a non-string iterable of dual numbers { v, d }')
	}

	let v = 1
	let d = 0
	let index = 0

	for (const term of terms) {
		if (term === null || typeof term !== 'object' || Array.isArray(term)) {
			throw new TypeError(`Element at index ${index} must be a dual number object { v, d }`)
		}

		const { v: tv, d: td } = term
		if (typeof tv !== 'number' || typeof td !== 'number') {
			throw new TypeError(`Element at index ${index} must have numeric v and d properties`)
		}
		if (!Number.isFinite(tv) || !Number.isFinite(td)) {
			throw new RangeError(`Element at index ${index} must have finite v and d values`)
		}

		const nextV = v * tv
		const nextD = v * td + d * tv
		v = nextV
		d = nextD
		index += 1
	}

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
