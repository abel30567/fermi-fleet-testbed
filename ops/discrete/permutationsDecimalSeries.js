/**
 * Arbitrary-precision discrete permutations P(n, k) over decimal strings.
 *
 * Computes the number of k-permutations of n distinct elements (the falling factorial):
 *
 *   P(n, k) = n! / (n - k)! = prod_{i=0}^{k-1} (n - i)
 *
 * with boundary conventions P(n, 0) = 1 for all n >= 0 and P(n, k) = 0 for k > n.
 *
 * Uses a closed-form divide-and-conquer (binary-splitting) falling-factorial product
 * over exact BigInt arithmetic, avoiding intermediate n! blowup for large n with
 * small k and achieving sub-quadratic multiplication cost for large k.
 *
 * @module ops/discrete/permutationsDecimalSeries
 */

const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_INPUT_DIGITS = 100_000
const MAX_PRECISION = 100_000
const MAX_K = 100_000n

/**
 * Parses an arbitrary-precision decimal string into an exact non-negative integer BigInt.
 *
 * Accepts standard decimal notation including optional leading sign, trailing
 * zero fractional digits (e.g. "5.00"), and scientific notation (e.g. "1.5e2")
 * as long as the exact mathematical value is a non-negative integer.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name used in error messages.
 * @returns {bigint} Exact non-negative integer value.
 * @throws {TypeError} If value is not a string.
 * @throws {RangeError} If value is malformed, negative, non-integer, or exceeds digit limits.
 */
function parseNonNegativeIntegerDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	if (trimmed.length === 0) {
		throw new RangeError(`${name} must be a non-empty decimal string`)
	}

	const match = DECIMAL_RE.exec(trimmed)
	if (!match) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	const sign = match[1] ?? '+'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	const digits = (intPart + fracPart).replace(/^0+/, '')
	if (digits.length === 0) {
		// Exact zero (including "-0", "+0.0", "0e1000")
		return 0n
	}

	if (sign === '-') {
		throw new RangeError(`${name} must be a non-negative integer`)
	}

	let end = digits.length
	while (end > 0 && digits[end - 1] === '0') {
		end--
	}
	const trailingZeros = digits.length - end
	const sig = digits.slice(0, end)

	const exp = expStr !== undefined ? BigInt(expStr) : 0n
	const shift = exp - BigInt(fracPart.length) + BigInt(trailingZeros)

	if (shift < 0n) {
		throw new RangeError(`${name} must represent an exact integer`)
	}

	const totalDigits = BigInt(sig.length) + shift
	if (totalDigits > BigInt(MAX_INPUT_DIGITS)) {
		throw new RangeError(
			`${name} exceeds maximum supported magnitude of ${MAX_INPUT_DIGITS} digits`
		)
	}

	return BigInt(sig + '0'.repeat(Number(shift)))
}

/**
 * Validates the configurable decimal precision argument.
 *
 * @param {number} precision - Number of fractional decimal places to format.
 * @returns {number} Validated non-negative integer precision.
 * @throws {TypeError} If precision is not a number or is NaN.
 * @throws {RangeError} If precision is negative, non-integer, infinite, or exceeds limits.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number' || Number.isNaN(precision)) {
		throw new TypeError('precision must be a non-negative integer')
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(
			`precision must be an integer between 0 and ${MAX_PRECISION}`
		)
	}
	return precision
}

/**
 * Computes the inclusive integer range product lo * (lo + 1) * ... * hi
 * via binary splitting (divide-and-conquer product tree).
 *
 * @param {bigint} lo - Lower bound (inclusive).
 * @param {bigint} hi - Upper bound (inclusive).
 * @returns {bigint} Product of all integers in [lo, hi], or 1n if lo > hi.
 */
function rangeProduct(lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return lo
	if (hi - lo === 1n) return lo * hi
	const mid = (lo + hi) >> 1n
	return rangeProduct(lo, mid) * rangeProduct(mid + 1n, hi)
}

/**
 * Formats an exact non-negative BigInt as a decimal string with the requested
 * number of fractional decimal places.
 *
 * @param {bigint} value - Exact non-negative integer value.
 * @param {number} precision - Number of fractional decimal digits (0 for integer string).
 * @returns {string} Formatted arbitrary-precision decimal string.
 */
function formatDecimal(value, precision) {
	const intStr = value.toString()
	if (precision === 0) {
		return intStr
	}
	return `${intStr}.${'0'.repeat(precision)}`
}

/**
 * Computes discrete k-permutations of n, P(n, k) = n! / (n - k)!, over
 * arbitrary-precision decimal strings using a closed-form binary-splitting
 * falling-factorial product.
 *
 * @param {string} n - Non-negative integer as an arbitrary-precision decimal string.
 * @param {string} k - Non-negative integer as an arbitrary-precision decimal string.
 * @param {number} [precision=0] - Number of fractional decimal places in the returned string.
 * @returns {string} Exact value of P(n, k) formatted as a decimal string.
 * @throws {TypeError} If n or k is not a string, or precision is not a valid number.
 * @throws {RangeError} If n or k is not a non-negative integer decimal string, or arguments exceed bounds.
 */
export function permutationsDecimalSeries(n, k, precision = 0) {
	const prec = validatePrecision(precision)
	const nBig = parseNonNegativeIntegerDecimal(n, 'n')
	const kBig = parseNonNegativeIntegerDecimal(k, 'k')

	if (kBig === 0n) {
		return formatDecimal(1n, prec)
	}
	if (kBig > nBig) {
		return formatDecimal(0n, prec)
	}
	if (kBig === 1n) {
		return formatDecimal(nBig, prec)
	}
	if (kBig > MAX_K) {
		throw new RangeError(
			`k exceeds maximum supported product length of ${MAX_K}`
		)
	}

	const result = rangeProduct(nBig - kBig + 1n, nBig)
	return formatDecimal(result, prec)
}
