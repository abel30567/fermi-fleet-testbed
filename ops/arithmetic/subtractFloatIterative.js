/**
 * Subtracts a sequence of IEEE-754 float64 numbers from left to right using a
 * straightforward iterative accumulation loop.
 *
 * Given operands `(v0, v1, ..., vn)`, computes `(((v0 - v1) - v2) ... - vn)`
 * following standard IEEE-754 binary64 arithmetic rules (including signed
 * zeros, subnormals, infinities, and `NaN` propagation).
 *
 * @param {...number} values - Two or more IEEE-754 float64 numbers. The first
 *   argument is the minuend and each subsequent argument is iteratively
 *   subtracted from the running difference.
 * @returns {number} The resulting IEEE-754 float64 difference.
 * @throws {RangeError} If fewer than two arguments are provided.
 * @throws {TypeError} If any argument is not a primitive `number`.
 */
export function subtractFloatIterative(...values) {
	if (values.length < 2) {
		throw new RangeError(
			`subtractFloatIterative requires at least 2 arguments, received ${values.length}`,
		)
	}

	for (let i = 0; i < values.length; i++) {
		if (typeof values[i] !== 'number') {
			throw new TypeError(
				`Expected argument at index ${i} to be a number, received ${
					values[i] === null ? 'null' : typeof values[i]
				}`,
			)
		}
	}

	let accumulator = values[0]
	for (let i = 1; i < values.length; i++) {
		accumulator -= values[i]
	}

	return accumulator
}
