/**
 * Computes the orthogonal vector projection of vector `a` onto vector `b`
 * over IEEE-754 float64 Numbers using a straightforward iterative algorithm:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Non-finite IEEE-754 float64 values (`NaN`, `Infinity`, `-Infinity`) follow
 * standard IEEE-754 arithmetic propagation rules. Negative zero (`-0`)
 * components in the output are normalized to `+0`.
 *
 * @param {number[]} a - The source vector to project (non-empty array of numbers).
 * @param {number[]} b - The target vector to project onto (non-empty array of numbers, same length as `a`, non-zero).
 * @returns {number[]} A new array representing the projection of `a` onto `b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `number`.
 * @throws {RangeError} If `a` or `b` is empty, their lengths differ, or `b` is the zero vector (`b · b === 0`).
 */
export function projectionFloatIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('Expected first argument "a" to be an Array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Expected second argument "b" to be an Array')
	}

	const len = a.length
	if (len === 0 || b.length === 0) {
		throw new RangeError('Input vectors must not be empty')
	}
	if (len !== b.length) {
		throw new RangeError(
			`Input vectors must have the same length (got ${len} and ${b.length})`,
		)
	}

	let dotAB = 0
	let dotBB = 0
	for (let i = 0; i < len; i++) {
		const ai = a[i]
		const bi = b[i]
		if (typeof ai !== 'number') {
			throw new TypeError(
				`Expected all elements of "a" to be numbers (got ${typeof ai} at index ${i})`,
			)
		}
		if (typeof bi !== 'number') {
			throw new TypeError(
				`Expected all elements of "b" to be numbers (got ${typeof bi} at index ${i})`,
			)
		}
		dotAB += ai * bi
		dotBB += bi * bi
	}

	if (dotBB === 0) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const scale = dotAB / dotBB
	const result = new Array(len)
	for (let i = 0; i < len; i++) {
		const value = scale * b[i]
		result[i] = value === 0 ? 0 : value
	}

	return result
}
