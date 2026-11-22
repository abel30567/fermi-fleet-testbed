/**
 * Adds two or more IEEE-754 float64 numbers using an iterative Neumaier
 * compensated summation loop.
 *
 * All arguments are validated up front to be primitive JavaScript `number`
 * values (IEEE-754 binary64). Non-finite values (`NaN`, `Infinity`,
 * `-Infinity`) and signed zeros (`-0`, `+0`) preserve standard IEEE-754
 * addition semantics, while finite summations track low-order rounding error
 * across iterations to reduce precision loss when combining large and small
 * magnitudes.
 *
 * @param {...number} values Two or more IEEE-754 float64 numbers to add.
 * @returns {number} The IEEE-754 float64 sum of all provided values.
 * @throws {RangeError} If fewer than two arguments are provided.
 * @throws {TypeError} If any argument is not a primitive `number`.
 *
 * @example
 * addFloatIterative(1.5, 2.25); // 3.75
 * addFloatIterative(1e16, 1, -1e16); // 1
 */
export function addFloatIterative(...values) {
	if (values.length < 2) {
		throw new RangeError(
			`addFloatIterative requires at least 2 arguments, received ${values.length}`
		)
	}

	for (let i = 0; i < values.length; i += 1) {
		if (typeof values[i] !== 'number') {
			throw new TypeError(
				`Argument at index ${i} must be a number, received ${
					values[i] === null ? 'null' : typeof values[i]
				}`
			)
		}
	}

	let sum = values[0]
	let compensation = 0

	for (let i = 1; i < values.length; i += 1) {
		const value = values[i]

		if (!Number.isFinite(sum) || !Number.isFinite(value)) {
			sum += value
			compensation = 0
			continue
		}

		const nextSum = sum + value

		if (!Number.isFinite(nextSum)) {
			sum = nextSum
			compensation = 0
			continue
		}

		if (Math.abs(sum) >= Math.abs(value)) {
			compensation += (sum - nextSum) + value
		} else {
			compensation += (value - nextSum) + sum
		}

		sum = nextSum
	}

	if (!Number.isFinite(sum) || compensation === 0) {
		return sum
	}

	return sum + compensation
}
