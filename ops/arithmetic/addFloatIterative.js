/**
 * Adds one or more IEEE-754 float64 numbers using a straightforward
 * left-to-right iterative accumulation.
 *
 * Preserves IEEE-754 floating-point semantics for all valid `number` operands,
 * including signed zero (`-0` + `-0` === `-0`), subnormals, infinities, overflow
 * to `±Infinity`, and `NaN` propagation.
 *
 * @param {...number} values - One or more IEEE-754 float64 numbers to add.
 * @returns {number} The iterative float64 sum `(((values[0] + values[1]) + ...) + values[n - 1])`.
 * @throws {TypeError} If no arguments are supplied or any argument is not a primitive `number`.
 */
export function addFloatIterative(...values) {
	if (values.length === 0) {
		throw new TypeError('addFloatIterative requires at least one number argument')
	}

	const first = values[0]
	if (typeof first !== 'number') {
		throw new TypeError(
			`Expected argument at index 0 to be a number, got ${first === null ? 'null' : typeof first}`
		)
	}

	let sum = first
	for (let i = 1; i < values.length; i += 1) {
		const value = values[i]
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected argument at index ${i} to be a number, got ${value === null ? 'null' : typeof value}`
			)
		}
		sum += value
	}

	return sum
}
