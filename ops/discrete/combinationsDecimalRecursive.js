/**
 * Arbitrary-precision discrete combinations C(n, k) = n! / (k! * (n - k)!)
 * computed over non-negative integer decimal strings using a recursive
 * divide-and-conquer binary-splitting product tree.
 *
 * @module ops/discrete/combinationsDecimalRecursive
 */

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/
const MAX_PRECISION = 1_000_000

/**
 * Parses and validates a non-negative integer decimal string into a BigInt.
 * Accepts optional surrounding whitespace, an optional leading `+` (or `-` for
 * zero), and optional trailing fractional zeros (e.g. `"10.00"`).
 *
 * @param {string} value - Decimal string representing a non-negative integer.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {bigint} Parsed non-negative BigInt value.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is malformed, non-integer, or negative.
 */
function parseNonNegativeIntegerDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	if (trimmed.length === 0) {
		throw new RangeError(`${name} must be a non-empty decimal string`)
	}

	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`${name} must be a valid decimal string (received "${value}")`)
	}

	const [, sign, intPart, fracPart] = match

	if (fracPart !== undefined && /[^0]/.test(fracPart)) {
		throw new RangeError(`${name} must represent an integer (received "${value}")`)
	}

	const parsed = BigInt(intPart)
	if (sign === '-' && parsed > 0n) {
		throw new RangeError(`${name} must be a non-negative integer (received "${value}")`)
	}

	return parsed
}

/**
 * Validates the configurable decimal precision argument.
 *
 * @param {number} precision - Number of fractional decimal places to format.
 * @returns {number} Validated non-negative integer precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a finite integer in `[0, MAX_PRECISION]`.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(
			`precision must be an integer between 0 and ${MAX_PRECISION} (received ${precision})`
		)
	}
	return precision
}

/**
 * Recursively computes the inclusive product `low * (low + 1) * ... * high`
 * using a divide-and-conquer binary-splitting tree.
 *
 * Splitting at the midpoint keeps operand bit-lengths balanced at each merge,
 * yielding O(log(high - low + 1)) recursion depth and sub-quadratic BigInt
 * multiplication performance for large ranges.
 *
 * @param {bigint} low - Lower bound of the inclusive integer range.
 * @param {bigint} high - Upper bound of the inclusive integer range.
 * @returns {bigint} Product of all integers in `[low, high]`, or `1n` if `low > high`.
 */
function rangeProductRecursive(low, high) {
	if (low > high) {
		return 1n
	}
	if (low === high) {
		return low
	}
	if (high - low === 1n) {
		return low * high
	}
	const mid = low + ((high - low) >> 1n)
	return rangeProductRecursive(low, mid) * rangeProductRecursive(mid + 1n, high)
}

/**
 * Formats a non-negative BigInt as a decimal string with `precision` fractional
 * decimal places.
 *
 * @param {bigint} value - Exact non-negative integer result.
 * @param {number} precision - Number of fractional decimal digits (0 for integer format).
 * @returns {string} Formatted decimal string.
 */
function formatDecimalInteger(value, precision) {
	const intStr = value.toString()
	if (precision === 0) {
		return intStr
	}
	return `${intStr}.${'0'.repeat(precision)}`
}

/**
 * Computes the binomial coefficient C(n, k) = n! / (k! * (n - k)!) over
 * arbitrary-precision non-negative integer decimal strings using a recursive
 * divide-and-conquer binary-splitting product tree.
 *
 * Edge cases:
 * - `k > n` returns `"0"` (formatted to `precision` decimal places).
 * - `k === 0` or `k === n` returns `"1"` (including `C(0, 0) = 1`).
 * - Exploits symmetry `C(n, k) = C(n, min(k, n - k))` to minimize work.
 * - Accepts integer decimal strings with trailing fractional zeros (e.g. `"10.00"`).
 *
 * @param {string} n - Non-negative integer decimal string (population size).
 * @param {string} k - Non-negative integer decimal string (sample size).
 * @param {number} [precision=0] - Number of fractional decimal places in the returned string.
 * @returns {string} Exact decimal string representation of C(n, k) formatted to `precision` decimal places.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is not a valid non-negative integer decimal string, or `precision` is out of range.
 */
export function combinationsDecimalRecursive(n, k, precision = 0) {
	const nVal = parseNonNegativeIntegerDecimal(n, 'n')
	const kVal = parseNonNegativeIntegerDecimal(k, 'k')
	const prec = validatePrecision(precision)

	if (kVal > nVal) {
		return formatDecimalInteger(0n, prec)
	}
	if (kVal === 0n || kVal === nVal) {
		return formatDecimalInteger(1n, prec)
	}

	const complement = nVal - kVal
	const r = kVal < complement ? kVal : complement

	if (r === 1n) {
		return formatDecimalInteger(nVal, prec)
	}

	const numerator = rangeProductRecursive(nVal - r + 1n, nVal)
	const denominator = rangeProductRecursive(1n, r)
	const result = numerator / denominator

	return formatDecimalInteger(result, prec)
}
