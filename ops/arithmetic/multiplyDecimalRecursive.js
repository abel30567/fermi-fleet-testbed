/**
 * Base-case digit length threshold for Karatsuba recursion.
 * Operands with digit length at or below this threshold are multiplied directly.
 */
const KARATSUBA_THRESHOLD = 8

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * Strips leading zeros from a non-empty string of ASCII digits.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let i = 0
	const last = digits.length - 1
	while (i < last && digits.charCodeAt(i) === 48) {
		i += 1
	}
	return i === 0 ? digits : digits.slice(i)
}

/**
 * Validates and parses an arbitrary-precision decimal string into sign,
 * unscaled digit string, and decimal scale.
 *
 * @param {string} value
 * @param {string} name
 * @returns {{ negative: boolean, digits: string, scale: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	if (trimmed.length === 0 || !DECIMAL_PATTERN.test(trimmed)) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	let negative = false
	let body = trimmed
	if (body[0] === '-') {
		negative = true
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	let rawDigits
	let scale
	if (dotIndex === -1) {
		rawDigits = body
		scale = 0
	} else {
		const intPart = body.slice(0, dotIndex)
		const fracPart = body.slice(dotIndex + 1)
		rawDigits = intPart + fracPart
		scale = fracPart.length
	}

	const digits = stripLeadingZeros(rawDigits)
	return {
		negative: digits === '0' ? false : negative,
		digits,
		scale,
	}
}

/**
 * Validates the precision argument.
 *
 * @param {number} precision
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || !Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Computes 10^exp as a BigInt.
 *
 * @param {number} exp
 * @returns {bigint}
 */
function pow10(exp) {
	return 10n ** BigInt(exp)
}

/**
 * Multiplies two non-negative base-10 digit strings using recursive
 * divide-and-conquer Karatsuba multiplication.
 *
 * For numbers x = x1 * 10^m + x0 and y = y1 * 10^m + y0:
 *   x * y = z2 * 10^(2m) + z1 * 10^m + z0
 * where:
 *   z0 = x0 * y0
 *   z2 = x1 * y1
 *   z1 = (x1 + x0) * (y1 + y0) - z2 - z0
 *
 * @param {string} aDigits
 * @param {string} bDigits
 * @returns {bigint}
 */
function karatsubaMultiply(aDigits, bDigits) {
	const x = stripLeadingZeros(aDigits)
	const y = stripLeadingZeros(bDigits)

	if (x === '0' || y === '0') {
		return 0n
	}

	const maxLen = Math.max(x.length, y.length)
	if (maxLen <= KARATSUBA_THRESHOLD) {
		return BigInt(x) * BigInt(y)
	}

	const split = Math.floor(maxLen / 2)

	const xHigh = x.length > split ? x.slice(0, x.length - split) : '0'
	const xLow = x.length > split ? x.slice(x.length - split) : x

	const yHigh = y.length > split ? y.slice(0, y.length - split) : '0'
	const yLow = y.length > split ? y.slice(y.length - split) : y

	const z0 = karatsubaMultiply(xLow, yLow)
	const z2 = karatsubaMultiply(xHigh, yHigh)

	const xSum = (BigInt(xHigh) + BigInt(xLow)).toString()
	const ySum = (BigInt(yHigh) + BigInt(yLow)).toString()
	const z1 = karatsubaMultiply(xSum, ySum) - z2 - z0

	const shift1 = pow10(split)
	const shift2 = shift1 * shift1

	return z2 * shift2 + z1 * shift1 + z0
}

/**
 * Formats an unscaled non-negative BigInt with the given decimal scale and sign,
 * stripping redundant trailing fractional zeros and normalizing zero to "0".
 *
 * @param {bigint} value
 * @param {number} scale
 * @param {boolean} negative
 * @returns {string}
 */
function formatDecimal(value, scale, negative) {
	if (value === 0n) {
		return '0'
	}

	const sign = negative ? '-' : ''
	const digits = value.toString()

	if (scale === 0) {
		return sign + digits
	}

	const padded = digits.padStart(scale + 1, '0')
	const splitIndex = padded.length - scale
	const intPart = padded.slice(0, splitIndex)
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '')

	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

/**
 * Multiplies two arbitrary-precision decimal strings using recursive
 * divide-and-conquer Karatsuba multiplication and rounds the result to at most
 * `precision` fractional digits (round half away from zero).
 *
 * @param {string} a - First decimal string operand (optional leading `+`/`-` sign).
 * @param {string} b - Second decimal string operand (optional leading `+`/`-` sign).
 * @param {number} [precision=20] - Maximum number of fractional digits to retain (non-negative safe integer).
 * @returns {string} The product formatted as a normalized decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function multiplyDecimalRecursive(a, b, precision = 20) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')
	validatePrecision(precision)

	if (parsedA.digits === '0' || parsedB.digits === '0') {
		return '0'
	}

	const negative = parsedA.negative !== parsedB.negative
	const totalScale = parsedA.scale + parsedB.scale
	let product = karatsubaMultiply(parsedA.digits, parsedB.digits)
	let effectiveScale = totalScale

	if (totalScale > precision) {
		const drop = totalScale - precision
		const divisor = pow10(drop)
		const half = divisor / 2n
		let quotient = product / divisor
		const remainder = product % divisor
		if (remainder >= half) {
			quotient += 1n
		}
		product = quotient
		effectiveScale = precision
	}

	return formatDecimal(product, effectiveScale, negative)
}
