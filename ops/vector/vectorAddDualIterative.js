/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite number).
 * @property {number} d - Forward-mode derivative (finite number).
 */

/**
 * Validates that an element is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} elem - Value to validate.
 * @param {string} paramName - Name of the input vector parameter for error messages.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If the element is not an object or its `v`/`d` properties are not numbers.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertValidDual(elem, paramName, index) {
	if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
		throw new TypeError(
			`Expected ${paramName}[${index}] to be a dual number object { v, d }`
		)
	}
	if (typeof elem.v !== 'number') {
		throw new TypeError(
			`Expected ${paramName}[${index}].v to be a number, received ${typeof elem.v}`
		)
	}
	if (!Number.isFinite(elem.v)) {
		throw new RangeError(
			`Expected ${paramName}[${index}].v to be a finite number, received ${elem.v}`
		)
	}
	if (typeof elem.d !== 'number') {
		throw new TypeError(
			`Expected ${paramName}[${index}].d to be a number, received ${typeof elem.d}`
		)
	}
	if (!Number.isFinite(elem.d)) {
		throw new RangeError(
			`Expected ${paramName}[${index}].d to be a finite number, received ${elem.d}`
		)
	}
}

/**
 * Computes the elementwise vector sum of two dual-number vectors iteratively.
 *
 * For dual numbers `a[i] = { v, d }` and `b[i] = { v, d }`, forward-mode differentiation
 * of vector addition yields:
 *   `(a + b)[i] = { v: a[i].v + b[i].v, d: a[i].d + b[i].d }`.
 *
 * Neither input array nor its elements are mutated.
 *
 * @param {DualNumber[]} a - First input vector of dual numbers `{ v, d }`.
 * @param {DualNumber[]} b - Second input vector of dual numbers `{ v, d }`.
 * @returns {DualNumber[]} New vector containing the elementwise dual-number sum.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid dual number `{ v, d }`.
 * @throws {RangeError} If `a` and `b` have different lengths, or any `v`/`d` component is non-finite.
 */
export function vectorAddDualIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('Expected first argument "a" to be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Expected second argument "b" to be an array of dual numbers')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Vector length mismatch: expected equal lengths, got ${len} and ${b.length}`
		)
	}

	const result = new Array(len)
	for (let i = 0; i < len; i += 1) {
		const ai = a[i]
		const bi = b[i]
		assertValidDual(ai, 'a', i)
		assertValidDual(bi, 'b', i)
		result[i] = {
			v: ai.v + bi.v,
			d: ai.d + bi.d,
		}
	}

	return result
}
