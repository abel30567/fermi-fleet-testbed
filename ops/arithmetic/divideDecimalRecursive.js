const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * Compute the bit length of a non-negative BigInt.
 *
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	if (n === 0n) {
		return 0
	}
	const hex = n.toString(16)
	const firstNibble = parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + (32 - Math.clz32(firstNibble))
}

/**
 * Recursively compute the scaled integer reciprocal floor(2^(m + k) / d)
 * via divide-and-conquer Newton-Raphson precision doubling, where m = bitLength(d).
 *
 * Uses only BigInt addition, subtraction, multiplication, and bit shifts
 * (no BigInt division or modulo operators).
 *
 * @param {bigint} d Positive integer divisor
 * @param {number} m Bit length of d (2^(m - 1) <= d < 2^m)
 * @param {number} k Precision bits beyond m (k >= 0)
 * @returns {bigint} Exact floor(2^(m + k) / d)
 */
function reciprocalRecursive(d, m, k) {
	if (k === 0) {
		return d === (1n << BigInt(m - 1)) ? 2n : 1n
	}

	const h = Math.floor(k / 2)
	const x = reciprocalRecursive(d, m, h)

	const term1 = x << BigInt(k - h + 1)
	const term2 = (d * x * x) >> BigInt(m + 2 * h - k)
	let candidate = term1 - term2

	const target = 1n << BigInt(m + k)
	let product = candidate * d

	while (product > target) {
		candidate -= 1n
		product -= d
	}
	while (target - product >= d) {
		candidate += 1n
		product += d
	}

	return candidate
}

/**
 * Compute exact integer floor(numerator / denominator) for non-negative
 * numerator and positive denominator using recursive Newton-Raphson reciprocal.
 *
 * @param {bigint} numerator Non-negative integer
 * @param {bigint} denominator Positive integer
 * @returns {bigint} Exact floor(numerator / denominator)
 */
function divideBigIntRecursive(numerator, denominator) {
	if (numerator < denominator) {
		return 0n
	}

	const m = bitLength(denominator)
	const nBits = bitLength(numerator)
	const k = nBits - m + 1
	const reciprocal = reciprocalRecursive(denominator, m, k)

	let quotient = (numerator * reciprocal) >> BigInt(m + k)
	let remainder = numerator - quotient * denominator

	while (remainder >= denominator) {
		quotient += 1n
		remainder -= denominator
	}

	return quotient
}

/**
 * Parse and validate an arbitrary-precision decimal string into sign,
 * unscaled BigInt magnitude, and decimal scale.
 *
 * @param {string} value
 * @param {string} label
 * @returns {{ negative: boolean, value: bigint, scale: number }}
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`Invalid ${label} decimal string: "${value}"`)
	}

	let negative = false
	let body = value
	if (body[0] === '-') {
		negative = true
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	let intPart
	let fracPart
	if (dotIndex === -1) {
		intPart = body
		fracPart = ''
	} else {
		intPart = body.slice(0, dotIndex)
		fracPart = body.slice(dotIndex + 1).replace(/0+$/, '')
	}

	const digits = (intPart + fracPart).replace(/^0+/, '') || '0'
	const magnitude = BigInt(digits)

	return {
		negative: magnitude === 0n ? false : negative,
		value: magnitude,
		scale: fracPart.length,
	}
}

/**
 * Format a non-negative scaled quotient BigInt with the given precision,
 * stripping unnecessary trailing fractional zeros and normalizing -0 to "0".
 *
 * @param {bigint} quotient
 * @param {number} precision
 * @param {boolean} negative
 * @returns {string}
 */
function formatQuotient(quotient, precision, negative) {
	if (quotient === 0n) {
		return '0'
	}

	const digits = quotient.toString()
	const sign = negative ? '-' : ''

	if (precision === 0) {
		return sign + digits
	}

	let intPart
	let fracPart
	if (digits.length <= precision) {
		intPart = '0'
		fracPart = '0'.repeat(precision - digits.length) + digits
	} else {
		const splitIndex = digits.length - precision
		intPart = digits.slice(0, splitIndex)
		fracPart = digits.slice(splitIndex)
	}

	const trimmedFrac = fracPart.replace(/0+$/, '')
	return trimmedFrac.length > 0 ? `${sign}${intPart}.${trimmedFrac}` : `${sign}${intPart}`
}

/**
 * Divide two arbitrary-precision decimal strings using a recursive
 * divide-and-conquer Newton-Raphson reciprocal algorithm.
 *
 * The quotient is truncated toward zero to at most `precision` fractional
 * digits, with unnecessary trailing fractional zeros removed and negative
 * zero normalized to `"0"`.
 *
 * @param {string} a Dividend as an arbitrary-precision decimal string (e.g. `"-12.5"`).
 * @param {string} b Divisor as an arbitrary-precision decimal string (must be non-zero).
 * @param {number} [precision=20] Maximum number of digits after the decimal point (non-negative safe integer).
 * @returns {string} Quotient formatted as a normalized decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, `precision` is invalid, or `b` is zero.
 */
export function divideDecimalRecursive(a, b, precision = 20) {
	const dividend = parseDecimal(a, 'dividend')
	const divisor = parseDecimal(b, 'divisor')

	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a non-negative safe integer')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}
	if (divisor.value === 0n) {
		throw new RangeError('Division by zero')
	}
	if (dividend.value === 0n) {
		return '0'
	}

	const netExp = precision + divisor.scale - dividend.scale
	let scaledNumerator
	let scaledDenominator

	if (netExp >= 0) {
		scaledNumerator = dividend.value * (10n ** BigInt(netExp))
		scaledDenominator = divisor.value
	} else {
		scaledNumerator = dividend.value
		scaledDenominator = divisor.value * (10n ** BigInt(-netExp))
	}

	const quotient = divideBigIntRecursive(scaledNumerator, scaledDenominator)
	const resultNegative = dividend.negative !== divisor.negative

	return formatQuotient(quotient, precision, resultNegative)
}
