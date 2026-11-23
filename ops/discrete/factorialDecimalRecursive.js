/**
 * Arbitrary-precision discrete factorial over decimal strings using a recursive
 * divide-and-conquer (binary-splitting) product tree.
 *
 * @module ops/discrete/factorialDecimalRecursive
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/

/**
 * Parses and validates a non-negative integer decimal string into a BigInt.
 *
 * Accepts optional leading/trailing whitespace, optional leading `+` sign
 * (or `-` only for zero values such as `"-0"` / `"-0.00"`), leading zeros,
 * and an optional fractional part consisting solely of zeros (e.g. `"5.00"`,
 * `"5."`, `".0"`).
 *
 * @param {string} input - Decimal string representing a non-negative integer.
 * @returns {bigint} Exact non-negative integer value.
 * @throws {TypeError} If `input` is not a string.
 * @throws {RangeError} If `input` is malformed, negative, or non-integer.
 */
function parseNonNegativeIntegerDecimal(input) {
	if (typeof input !== 'string') {
		throw new TypeError('Input n must be a decimal string')
	}

	const trimmed = input.trim()
	if (trimmed.length === 0) {
		throw new RangeError('Input n must be a non-empty decimal string')
	}

	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${input}"`)
	}

	const sign = match[1]
	const intPart = match[2] ?? '0'
	const fracPart = match[3] ?? match[4] ?? ''
	const hasNonZeroFraction = /[1-9]/.test(fracPart)
	const value = BigInt(intPart)

	if (sign === '-' && (value > 0n || hasNonZeroFraction)) {
		throw new RangeError('Factorial is undefined for negative numbers')
	}

	if (hasNonZeroFraction) {
		throw new RangeError('Discrete factorial requires an integer input')
	}

	return value
}

/**
 * Validates the fractional decimal precision argument.
 *
 * @param {number} precision - Number of fractional digits in the formatted output.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}
}

/**
 * Recursively computes the product of all integers in the inclusive range `[low, high]`
 * using divide-and-conquer binary splitting.
 *
 * Balanced operand sizes improve asymptotic multiplication efficiency over naive
 * linear iteration while bounding recursion stack depth to `O(log(high - low))`.
 *
 * @param {bigint} low - Inclusive lower bound.
 * @param {bigint} high - Inclusive upper bound.
 * @returns {bigint} Exact product `low * (low + 1) * ... * high`.
 */
function productRange(low, high) {
	if (low > high) {
		return 1n
	}
	if (low === high) {
		return low
	}
	if (high - low === 1n) {
		return low * high
	}
	const mid = (low + high) >> 1n
	return productRange(low, mid) * productRange(mid + 1n, high)
}

/**
 * Computes the exact discrete factorial `n!` over arbitrary-precision decimal strings
 * using a recursive divide-and-conquer binary-splitting product tree.
 *
 * @param {string} n - Non-negative integer represented as a decimal string (e.g. `"0"`, `"5"`, `"5.00"`, `"100"`).
 * @param {number} [precision=0] - Non-negative integer number of fractional decimal places to format in the returned string.
 * @returns {string} Exact decimal string representation of `n!`, formatted with `precision` fractional digits.
 * @throws {TypeError} If `n` is not a string or `precision` is not a number.
 * @throws {RangeError} If `n` is malformed, negative, or non-integer, or if `precision` is not a non-negative safe integer.
 */
export function factorialDecimalRecursive(n, precision = 0) {
	const value = parseNonNegativeIntegerDecimal(n)
	validatePrecision(precision)

	const result = value <= 1n ? 1n : productRange(2n, value)
	const integerStr = result.toString()

	if (precision === 0) {
		return integerStr
	}

	return `${integerStr}.${'0'.repeat(precision)}`
}
