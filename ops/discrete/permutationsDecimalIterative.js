/**
 * Parses a decimal string representing a non-negative integer into a BigInt.
 *
 * Accepts optional surrounding whitespace, an optional leading sign (`+` or `-`
 * for zero), integer digits, and an optional fractional part consisting solely
 * of zeros (e.g. `"10"`, `"10.0"`, `"0007.000"`, `"+5"`).
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name used in error messages.
 * @returns {bigint} Parsed non-negative integer value.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid non-negative integer decimal string.
 */
function parseNonNegativeIntegerDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed)
	if (!match) {
		throw new RangeError(`${name} must be a valid decimal string`)
	}

	const [, sign, intPart, fracPart] = match
	if (fracPart !== undefined && /[1-9]/.test(fracPart)) {
		throw new RangeError(`${name} must represent an integer (non-zero fractional part found)`)
	}

	const parsed = BigInt(intPart)
	if (sign === '-' && parsed > 0n) {
		throw new RangeError(`${name} must be a non-negative integer`)
	}

	return parsed
}

/**
 * Validates the decimal precision argument.
 *
 * @param {number} precision - Number of fractional digits to format in the output.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Formats a non-negative BigInt as a fixed-point decimal string with `precision` fractional digits.
 *
 * @param {bigint} value - Non-negative integer value to format.
 * @param {number} precision - Number of fractional digits (0 omits the decimal point).
 * @returns {string} Formatted decimal string.
 */
function formatDecimal(value, precision) {
	const digits = value.toString()
	if (precision === 0) {
		return digits
	}
	return `${digits}.${'0'.repeat(precision)}`
}

/**
 * Computes the number of k-permutations of n distinct items, P(n, k) = n! / (n - k)!,
 * using a straightforward iterative falling-factorial product over BigInt arithmetic.
 *
 * By multiplying `n * (n - 1) * ... * (n - k + 1)` directly, this avoids computing
 * full factorials `n!` and `(n - k)!`, enabling arbitrarily large `n` with small `k`
 * without unnecessary intermediate growth.
 *
 * Behavior for boundary cases:
 * - `k === 0` (including `n === 0, k === 0`): returns `"1"` (formatted to `precision`).
 * - `k > n`: returns `"0"` (formatted to `precision`), matching standard combinatorics
 *   since no ordered selection of `k` distinct elements exists from fewer than `k` elements.
 * - `k === n`: returns `n!` (formatted to `precision`).
 *
 * @param {string} n - Total number of items as a non-negative integer decimal string (e.g. `"10"`, `"10.0"`).
 * @param {string} k - Number of selected items as a non-negative integer decimal string.
 * @param {number} [precision=0] - Number of fractional decimal digits to include in the output string.
 * @returns {string} Exact value of P(n, k) formatted as a decimal string with `precision` fractional digits.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is not a valid non-negative integer decimal string,
 *   or if `precision` is negative, non-integer, or not a safe integer.
 */
export function permutationsDecimalIterative(n, k, precision = 0) {
	const nBig = parseNonNegativeIntegerDecimal(n, 'n')
	const kBig = parseNonNegativeIntegerDecimal(k, 'k')
	validatePrecision(precision)

	if (kBig > nBig) {
		return formatDecimal(0n, precision)
	}

	let result = 1n
	for (let i = 0n; i < kBig; i += 1n) {
		result *= nBig - i
	}

	return formatDecimal(result, precision)
}
