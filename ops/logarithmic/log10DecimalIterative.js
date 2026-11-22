const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Computes the exact integer floor square root of a non-negative BigInt
 * using iterative Newton's method.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Floor of sqrt(n).
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLength = BigInt(n.toString(2).length)
	let x = 1n << ((bitLength + 1n) >> 1n)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Parses a decimal string (supporting optional sign and scientific notation)
 * into normalized positive scientific components: value = (d0.d1...) * 10^exponent.
 *
 * @param {string} raw - Decimal string representing a strictly positive number.
 * @returns {{ digits: string, exponent: bigint }} Normalized mantissa digits and base-10 exponent.
 */
function parsePositiveDecimal(raw) {
	if (typeof raw !== 'string') {
		throw new TypeError('value must be a decimal string')
	}

	const trimmed = raw.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${raw}"`)
	}

	const sign = match[1] ?? '+'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	const combined = intPart + fracPart
	const withoutLeading = combined.replace(/^0+/, '')
	if (withoutLeading.length === 0) {
		throw new RangeError('log10 is undefined for zero; value must be strictly positive')
	}
	if (sign === '-') {
		throw new RangeError('log10 is undefined for negative numbers; value must be strictly positive')
	}

	const digits = withoutLeading.replace(/0+$/, '')
	const trailingZeros = BigInt(withoutLeading.length - digits.length)
	const explicitExp = expPart ? BigInt(expPart) : 0n
	const rawExponent = explicitExp - BigInt(fracPart.length) + trailingZeros
	const exponent = rawExponent + BigInt(digits.length - 1)

	return { digits, exponent }
}

/**
 * Computes the natural logarithm of a scaled BigInt value x >= 1
 * (where x = xScaled / scale) using iterative square-root range reduction
 * followed by an iterative atanh Taylor series:
 *   ln(x) = 2^r * 2 * sum_{j=0..inf} y^(2j+1) / (2j+1), y = (x_r - 1) / (x_r + 1).
 *
 * @param {bigint} xScaled - Scaled representation of x (>= scale).
 * @param {bigint} scale - Fixed-point scaling factor (10^workDigits).
 * @returns {bigint} Scaled representation of ln(x).
 */
function lnScaled(xScaled, scale) {
	if (xScaled === scale) return 0n

	// Iteratively take square roots until x is within 1e-4 of 1 so the atanh series converges rapidly.
	const threshold = scale / 10000n
	let reduced = xScaled
	let sqrtCount = 0n
	while (reduced - scale > threshold) {
		reduced = isqrt(reduced * scale)
		sqrtCount += 1n
	}

	const yScaled = ((reduced - scale) * scale) / (reduced + scale)
	const y2Scaled = (yScaled * yScaled) / scale

	let yPower = yScaled
	let sum = yScaled
	let denom = 3n
	while (true) {
		yPower = (yPower * y2Scaled) / scale
		if (yPower === 0n) break
		const term = yPower / denom
		if (term === 0n) break
		sum += term
		denom += 2n
	}

	// Multiply by 2^(sqrtCount + 1) to undo range reduction and the factor of 2 in 2*atanh(y).
	return sum << (sqrtCount + 1n)
}

/**
 * Converts normalized mantissa digits (representing 1 <= m < 10) into a fixed-point
 * BigInt scaled by 10^workDigits, rounding half-up if truncation is required.
 *
 * @param {string} digits - Significant mantissa digits without leading/trailing zeros.
 * @param {number} workDigits - Number of fractional digits in the fixed-point scale.
 * @returns {bigint} Scaled mantissa.
 */
function scaleMantissa(digits, workDigits) {
	const fracLen = digits.length - 1
	if (fracLen <= workDigits) {
		return BigInt(digits) * (10n ** BigInt(workDigits - fracLen))
	}

	const kept = BigInt(digits.slice(0, workDigits + 1))
	const nextDigit = digits.charCodeAt(workDigits + 1) - 48
	return nextDigit >= 5 ? kept + 1n : kept
}

/**
 * Formats a fixed-point BigInt (scaled by 10^workDigits) to a canonical decimal string
 * rounded half-up to `precision` fractional digits with trailing zeros removed.
 *
 * @param {bigint} scaledValue - Signed fixed-point value.
 * @param {number} workDigits - Number of fractional digits in scaledValue.
 * @param {number} precision - Target number of fractional digits.
 * @returns {string} Formatted decimal string.
 */
function formatScaledDecimal(scaledValue, workDigits, precision) {
	const guardDigits = workDigits - precision
	const isNegative = scaledValue < 0n
	const absValue = isNegative ? -scaledValue : scaledValue

	const divisor = 10n ** BigInt(guardDigits)
	const quotient = absValue / divisor
	const remainder = absValue % divisor
	const rounded = remainder >= divisor / 2n ? quotient + 1n : quotient

	if (rounded === 0n) return '0'

	const sign = isNegative ? '-' : ''
	if (precision === 0) return `${sign}${rounded.toString()}`

	const padded = rounded.toString().padStart(precision + 1, '0')
	const intPart = padded.slice(0, padded.length - precision)
	const fracPart = padded.slice(padded.length - precision).replace(/0+$/, '')

	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

/**
 * Computes the base-10 logarithm (log10) of an arbitrary-precision positive decimal string
 * using iterative base-10 range reduction (extracting powers of 10), iterative square-root
 * reduction, and an iterative atanh Taylor series for ln(m) / ln(10) over scaled BigInt arithmetic.
 *
 * Trailing fractional zeros are stripped from the returned canonical decimal string
 * (so exact powers of 10 return integer strings such as `"0"`, `"3"`, or `"-3"`).
 *
 * @param {string} value - Strictly positive decimal string (supports standard and scientific notation).
 * @param {number} [precision=20] - Non-negative safe integer number of fractional digits after the decimal point.
 * @returns {string} Base-10 logarithm formatted as a decimal string rounded to `precision` fractional digits.
 * @throws {TypeError} If `value` is not a string or `precision` is not a number.
 * @throws {RangeError} If `value` is malformed, zero, or negative, or if `precision` is not a safe non-negative integer.
 *
 * @example
 * log10DecimalIterative('1000') // '3'
 * log10DecimalIterative('0.001') // '-3'
 * log10DecimalIterative('2', 10) // '0.3010299957'
 */
export function log10DecimalIterative(value, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || !Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	const { digits, exponent } = parsePositiveDecimal(value)

	// Exact power of 10: log10(10^k) = k with zero rounding error.
	if (digits === '1') {
		return exponent.toString()
	}

	// Guard digits comfortably absorb rounding from <=15 square roots, Taylor terms, and division.
	const guardDigits = 30
	const workDigits = precision + guardDigits
	const scale = 10n ** BigInt(workDigits)

	const mantissaScaled = scaleMantissa(digits, workDigits)
	const lnMantissa = lnScaled(mantissaScaled, scale)
	const ln10 = lnScaled(10n * scale, scale)

	// Round fractional log10(m) = ln(m) / ln(10) to nearest ULP at working scale.
	const fracLog10 = (lnMantissa * scale + ln10 / 2n) / ln10
	const totalScaled = exponent * scale + fracLog10

	return formatScaledDecimal(totalScaled, workDigits, precision)
}
