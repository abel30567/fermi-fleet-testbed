const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Validates that `precision` is a non-negative safe integer.
 *
 * @param {number} precision - Requested decimal precision (non-negative safe integer).
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is negative, non-integer, or not a safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError(`Expected precision to be a number, got ${typeof precision}`)
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`Expected precision to be a non-negative safe integer, got ${precision}`)
	}
}

/**
 * Parses an arbitrary-precision decimal string into an exact non-negative BigInt integer.
 * Supports optional leading `+`/`-` signs, decimal points, leading/trailing zeros,
 * surrounding whitespace, and scientific notation (e.g. `"5"`, `"5.00"`, `"+10"`, `"1.5e1"`).
 *
 * @param {string} input - Arbitrary-precision decimal string representing a non-negative integer.
 * @returns {bigint} Exact non-negative integer value.
 * @throws {TypeError} If `input` is not a string or is not a valid decimal string.
 * @throws {RangeError} If `input` represents a negative number or a non-integer value.
 */
function parseNonNegativeIntegerDecimal(input) {
	if (typeof input !== 'string') {
		throw new TypeError(`Expected n to be a decimal string, got ${typeof input}`)
	}

	const trimmed = input.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new TypeError(`Invalid decimal string: "${input}"`)
	}

	const sign = match[1] ?? '+'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	const allDigits = intPart + fracPart
	const firstNonZero = allDigits.search(/[1-9]/)

	// Mathematical zero (including "-0", "-0.00", "0e-50", etc.) is a valid non-negative integer.
	if (firstNonZero === -1) {
		return 0n
	}

	if (sign === '-') {
		throw new RangeError(`Factorial is undefined for negative values: "${input}"`)
	}

	let lastNonZero = allDigits.length - 1
	while (lastNonZero > firstNonZero && allDigits[lastNonZero] === '0') {
		lastNonZero -= 1
	}

	const trailingZeroCount = BigInt(allDigits.length - 1 - lastNonZero)
	const significantDigits = allDigits.slice(firstNonZero, lastNonZero + 1)
	const parsedExp = expPart !== undefined ? BigInt(expPart) : 0n
	const effectiveExp = parsedExp - BigInt(fracPart.length) + trailingZeroCount

	if (effectiveExp < 0n) {
		throw new RangeError(`Factorial is only defined for integer values: "${input}"`)
	}

	let value = BigInt(significantDigits)
	if (effectiveExp > 0n) {
		value *= 10n ** effectiveExp
	}
	return value
}

/**
 * Formats an exact non-negative integer BigInt as a normalized decimal string.
 * Because `n!` is always an exact integer, rounding to `precision` fractional digits
 * and trimming trailing fractional zeros yields the exact base-10 integer digits
 * with no `-0` and no trailing decimal point.
 *
 * @param {bigint} value - Non-negative integer result.
 * @param {number} _precision - Validated non-negative decimal precision.
 * @returns {string} Normalized decimal string representation.
 */
function formatNormalizedDecimal(value, _precision) {
	return value === 0n ? '0' : value.toString()
}

/**
 * Computes the discrete factorial `n!` over arbitrary-precision decimal strings
 * using an iterative BigInt multiplication loop (zero floating-point precision loss,
 * no recursion, zero external dependencies).
 *
 * Input `n` must be a valid decimal string representing a non-negative integer
 * (for example `"0"`, `"5"`, `"5.00"`, `"+10"`, `"-0"`, `"1.5e1"`, or `"500e-2"`).
 * Negative values and values with a non-zero fractional part (even beyond float64
 * resolution, such as `"5.000000000000000000000000000001"`) throw a `RangeError`.
 *
 * Precision handling: `precision` specifies the maximum number of fractional decimal
 * places (must be a non-negative safe integer, defaulting to `0`). Since `n!` is always
 * an exact non-negative integer, normalizing the decimal result to at most `precision`
 * fractional places trims trailing fractional zeros and returns the exact full-precision
 * integer decimal string (never truncated in its integer digits and never `"-0"`).
 *
 * @param {string} n - Non-negative integer encoded as a decimal string.
 * @param {number} [precision=0] - Non-negative safe integer specifying fractional decimal precision.
 * @returns {string} Exact value of `n!` as a normalized arbitrary-precision decimal string.
 * @throws {TypeError} If `n` is not a string, is not valid decimal syntax, or `precision` is not a number.
 * @throws {RangeError} If `n` is negative or non-integer, or if `precision` is not a non-negative safe integer.
 */
export function factorialDecimalIterative(n, precision = 0) {
	validatePrecision(precision)
	const integerN = parseNonNegativeIntegerDecimal(n)

	let result = 1n
	for (let i = 2n; i <= integerN; i += 1n) {
		result *= i
	}

	return formatNormalizedDecimal(result, precision)
}
