/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (must be a finite number).
 * @property {number} d - Forward-mode derivative / tangent component (must be a finite number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} element - Candidate dual number object.
 * @param {string} paramName - Name of the vector parameter for error messages.
 * @param {number} index - Element index within the vector.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If the element is not a non-null non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(element, paramName, index) {
	if (element === null || typeof element !== 'object' || Array.isArray(element)) {
		throw new TypeError(`${paramName}[${index}] must be a dual number object { v, d }`)
	}
	if (typeof element.v !== 'number') {
		throw new TypeError(`${paramName}[${index}].v must be a number`)
	}
	if (typeof element.d !== 'number') {
		throw new TypeError(`${paramName}[${index}].d must be a number`)
	}
	if (!Number.isFinite(element.v)) {
		throw new RangeError(`${paramName}[${index}].v must be a finite number`)
	}
	if (!Number.isFinite(element.d)) {
		throw new RangeError(`${paramName}[${index}].d must be a finite number`)
	}
	return element
}

/**
 * Computes element-wise vector addition over dual numbers `{ v, d }` carrying
 * forward-mode derivatives alongside primal values, using a straightforward
 * iterative loop.
 *
 * For each component `i`, given dual numbers `(a[i].v + a[i].d * ε)` and
 * `(b[i].v + b[i].d * ε)` with `ε² = 0`, their sum is:
 * `{ v: a[i].v + b[i].v, d: a[i].d + b[i].d }`.
 *
 * Neither input vector nor its elements are mutated.
 *
 * @param {readonly DualNumber[]} a - First vector of dual numbers `{ v, d }`.
 * @param {readonly DualNumber[]} b - Second vector of dual numbers `{ v, d }` of equal length.
 * @returns {DualNumber[]} New array of dual numbers representing `a + b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any `v` or `d` component is non-finite.
 */
export function vectorAddDualIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match: received ${a.length} and ${b.length}`)
	}

	const len = a.length
	const result = new Array(len)

	for (let i = 0; i < len; i++) {
		if (!(i in a)) {
			throw new TypeError(`a[${i}] is missing (sparse array elements are not allowed)`)
		}
		if (!(i in b)) {
			throw new TypeError(`b[${i}] is missing (sparse array elements are not allowed)`)
		}
		const ai = validateDual(a[i], 'a', i)
		const bi = validateDual(b[i], 'b', i)
		result[i] = {
			v: ai.v + bi.v,
			d: ai.d + bi.d,
		}
	}

	return result
}
