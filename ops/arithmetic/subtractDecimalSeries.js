/**
 * Arbitrary-precision decimal subtraction using exact base-10 positional
 * series representation and the additive-inverse identity:
 *
 *   a - b = a + (-b) = (M_a * 10^(E - e_a) - M_b * 10^(E - e_b)) * 10^(-E)
 *
 * where each decimal string x is decomposed into its closed-form scaled
 * integer form x = M_x * 10^(-e_x) with BigInt mantissa M_x and non-negative
 * integer scale e_x.
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Parses and validates an arbitrary-precision decimal string into canonical
 * `{ mantissa: bigint, scale: number }` form where `value = mantissa * 10^(-scale)`
 * and `scale >= 0`.
 *
 * @param {string} value - Decimal string (supports signs and scientific notation).
 * @param {string} name - Parameter name for error messages.
 * @returns {{ mantissa: bigint, scale: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	const sign = match[1]
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	let exp = 0
	if (expPart !== undefined) {
		exp = Number(expPart)
		if (!Number.isSafeInteger(exp)) {
			throw new RangeError(`${name} exponent is out of safe integer range`)
		}
	}

	let digits = (intPart + fracPart).replace(/^0+/, '')
	if (digits.length === 0) {
		return { mantissa: 0n, scale: 0 }
	}

	let scale = fracPart.length - exp
	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`${name} decimal scale is out of safe integer range`)
	}

	const trimmedTrailing = digits.replace(/0+$/, '')
	const trailingZeros = digits.length - trimmedTrailing.length
	if (trailingZeros > 0) {
		digits = trimmedTrailing
		scale -= trailingZeros
		if (!Number.isSafeInteger(scale)) {
			throw new RangeError(`${name} decimal scale is out of safe integer range`)
		}
	}

	let mantissa = BigInt(digits)
	if (scale < 0) {
		mantissa *= 10n ** BigInt(-scale)
		scale = 0
	}

	if (sign === '-') {
		mantissa = -mantissa
	}

	return { mantissa, scale }
}

/**
 * Formats a scaled BigInt value `mantissa * 10^(-scale)` as a canonical
 * decimal string with no leading/trailing insignificant zeros and no `-0`.
 *
 * @param {bigint} mantissa
 * @param {number} scale - Non-negative decimal scale.
 * @returns {string}
 */
function formatDecimal(mantissa, scale) {
	if (mantissa === 0n) {
		return '0'
	}

	const negative = mantissa < 0n
	const digits = (negative ? -mantissa : mantissa).toString()

	if (scale === 0) {
		return negative ? `-${digits}` : digits
	}

	let intPart
	let fracPart
	if (digits.length <= scale) {
		intPart = '0'
		fracPart = digits.padStart(scale, '0')
	} else {
		const splitIndex = digits.length - scale
		intPart = digits.slice(0, splitIndex)
		fracPart = digits.slice(splitIndex)
	}

	fracPart = fracPart.replace(/0+$/, '')
	const body = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart
	return negative ? `-${body}` : body
}

/**
 * Subtracts two arbitrary-precision decimal strings (`a - b`) using exact
 * base-10 scaled BigInt arithmetic and rounds the result to at most
 * `precision` fractional digits (half away from zero).
 *
 * @param {string} a - Minuend as a decimal string (e.g. `"123.45"`, `"-1.5e-10"`).
 * @param {string} b - Subtrahend as a decimal string.
 * @param {number} [precision=20] - Maximum number of fractional digits in the result (non-negative safe integer).
 * @returns {string} Canonical decimal string representation of `a - b` rounded to `precision` fractional digits.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number (when provided).
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function subtractDecimalSeries(a, b, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')

	const commonScale = Math.max(parsedA.scale, parsedB.scale)
	const alignedA =
		parsedA.scale < commonScale
			? parsedA.mantissa * 10n ** BigInt(commonScale - parsedA.scale)
			: parsedA.mantissa
	const alignedB =
		parsedB.scale < commonScale
			? parsedB.mantissa * 10n ** BigInt(commonScale - parsedB.scale)
			: parsedB.mantissa

	// Additive-inverse identity: a - b = a + (-b)
	let diffMantissa = alignedA + -alignedB
	let resultScale = commonScale

	if (diffMantissa === 0n) {
		return '0'
	}

	if (resultScale > precision) {
		const dropDigits = resultScale - precision
		const negative = diffMantissa < 0n
		const absMantissa = negative ? -diffMantissa : diffMantissa
		const divisor = 10n ** BigInt(dropDigits)
		const quotient = absMantissa / divisor
		const remainder = absMantissa % divisor
		// Round half away from zero to preserve odd symmetry: round(-x) === -round(x)
		const roundedAbs = remainder * 2n >= divisor ? quotient + 1n : quotient
		if (roundedAbs === 0n) {
			return '0'
		}
		diffMantissa = negative ? -roundedAbs : roundedAbs
		resultScale = precision
	}

	return formatDecimal(diffMantissa, resultScale)
}
