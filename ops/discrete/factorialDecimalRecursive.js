/**
 * Arbitrary-precision decimal factorial implemented via recursive
 * divide-and-conquer binary splitting over native BigInt arithmetic.
 *
 * @module ops/discrete/factorialDecimalRecursive
 */

const DECIMAL_INTEGER_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/

/**
 * Parses and validates a non-negative integer decimal string into a BigInt.
 *
 * Accepts standard decimal representations of non-negative integers such as
 * `"0"`, `"5"`, `"+10"`, `"0005.00"`, or `"10.000"`. Leading and trailing
 * whitespace is permitted. Rejects non-strings, malformed decimal literals
 * (e.g. `""`, `"1e3"`, `"5."`, `".0"`, `"1_000"`), negative numbers, and
 * non-integer fractional values (e.g. `"2.5"`).
 *
 * @param {string} value - Non-negative integer decimal string to parse.
 * @returns {bigint} Parsed non-negative integer value.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is malformed, negative, or non-integer.
 */
function parseNonNegativeIntegerDecimal(value) {
	if (typeof value !== 'string') {
		throw new TypeError(`Expected n to be a decimal string, received ${typeof value}`)
	}

	const trimmed = value.trim()
	const match = DECIMAL_INTEGER_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${value}"`)
	}

	const [, sign, intPart, fracPart] = match

	if (fracPart !== undefined && /[1-9]/.test(fracPart)) {
		throw new RangeError(`Factorial is only defined for integers; received non-integer "${value}"`)
	}

	const parsed = BigInt(intPart)

	if (sign === '-' && parsed > 0n) {
		throw new RangeError(`Factorial is undefined for negative numbers; received "${value}"`)
	}

	return parsed
}

/**
 * Validates the decimal formatting precision argument.
 *
 * @param {number} precision - Non-negative safe integer number of fractional digits.
 * @returns {number} Validated precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is negative, non-integer, or not a safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError(`Expected precision to be a number, received ${typeof precision}`)
	}

	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(
			`Expected precision to be a non-negative safe integer, received ${precision}`,
		)
	}

	return precision
}

/**
 * Computes the inclusive integer product `lo * (lo + 1) * ... * hi` using a
 * recursive divide-and-conquer binary-splitting product tree.
 *
 * Splitting `[lo, hi]` into `[lo, mid]` and `[mid + 1, hi]` keeps recursion
 * depth balanced at `O(log(hi - lo + 1))` and balances operand bit-lengths for
 * faster sub-quadratic BigInt multiplication.
 *
 * @param {bigint} lo - Lower bound (inclusive).
 * @param {bigint} hi - Upper bound (inclusive).
 * @returns {bigint} Product of all integers in `[lo, hi]`, or `1n` if `lo > hi`.
 */
function rangeProduct(lo, hi) {
	if (lo > hi) {
		return 1n
	}
	if (lo === hi) {
		return lo
	}
	if (hi - lo === 1n) {
		return lo * hi
	}

	const mid = (lo + hi) >> 1n
	return rangeProduct(lo, mid) * rangeProduct(mid + 1n, hi)
}

/**
 * Computes the exact arbitrary-precision factorial `n!` for a non-negative
 * integer decimal string using a recursive divide-and-conquer product tree.
 *
 * Formatting behavior for `precision`:
 * - When `precision === 0` (default), returns the exact canonical integer
 *   decimal string with no decimal point (e.g. `"120"` for `n = "5"`).
 * - When `precision > 0`, formats the exact integer result with a decimal
 *   point followed by `precision` trailing zeros (e.g. `"120.00"` for
 *   `n = "5", precision = 2`).
 *
 * @param {string} n - Non-negative integer represented as a decimal string
 *   (e.g. `"0"`, `"5"`, `"10.000"`).
 * @param {number} [precision=0] - Non-negative safe integer specifying the
 *   number of fractional decimal places to include in the formatted output.
 * @returns {string} Exact factorial formatted as an arbitrary-precision decimal string.
 * @throws {TypeError} If `n` is not a string or `precision` is not a number.
 * @throws {RangeError} If `n` is malformed, negative, or non-integer, or if
 *   `precision` is not a non-negative safe integer.
 */
export function factorialDecimalRecursive(n, precision = 0) {
	const value = parseNonNegativeIntegerDecimal(n)
	const places = validatePrecision(precision)

	const result = value <= 1n ? 1n : rangeProduct(2n, value)
	const integerStr = result.toString()

	if (places === 0) {
		return integerStr
	}

	return `${integerStr}.${'0'.repeat(places)}`
}
