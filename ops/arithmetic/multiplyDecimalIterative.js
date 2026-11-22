const DECIMAL_STRING_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * Validates and parses a decimal string into sign, unscaled digit string, and fractional scale.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} paramName - Parameter name used in error messages.
 * @returns {{ negative: boolean, digits: string, scale: number }} Parsed representation.
 * @throws {TypeError} If value is not a string.
 * @throws {RangeError} If value is not a valid base-10 decimal string.
 */
function parseDecimalString(value, paramName) {
	if (typeof value !== 'string') {
		throw new TypeError(`${paramName} must be a decimal string`)
	}
	if (!DECIMAL_STRING_PATTERN.test(value)) {
		throw new RangeError(`${paramName} is not a valid decimal string: "${value}"`)
	}

	let start = 0
	let negative = false
	if (value[0] === '-') {
		negative = true
		start = 1
	} else if (value[0] === '+') {
		start = 1
	}

	const unsigned = value.slice(start)
	const dotIndex = unsigned.indexOf('.')
	const rawDigits =
		dotIndex === -1
			? unsigned
			: unsigned.slice(0, dotIndex) + unsigned.slice(dotIndex + 1)
	const scale = dotIndex === -1 ? 0 : unsigned.length - dotIndex - 1

	let firstNonZero = 0
	while (firstNonZero < rawDigits.length && rawDigits[firstNonZero] === '0') {
		firstNonZero++
	}

	if (firstNonZero === rawDigits.length) {
		return { negative: false, digits: '0', scale: 0 }
	}

	return {
		negative,
		digits: rawDigits.slice(firstNonZero),
		scale,
	}
}

/**
 * Validates the optional fractional precision parameter.
 *
 * @param {number | undefined} precision - Maximum fractional decimal digits to keep.
 * @throws {TypeError} If precision is neither undefined nor a number.
 * @throws {RangeError} If precision is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer or undefined')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Multiplies two arbitrary-precision base-10 decimal strings using a straightforward
 * iterative schoolbook digit-by-digit multiplication algorithm.
 *
 * Accepted inputs are base-10 decimal strings matching `/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/`
 * (scientific notation and surrounding whitespace are rejected).
 *
 * When `precision` is omitted (`undefined`), the exact full product is returned.
 * When `precision` is a non-negative safe integer, the product is rounded to at most
 * `precision` fractional digits using round-half-away-from-zero.
 *
 * Output is normalized to canonical decimal form: insignificant leading integer zeros,
 * insignificant trailing fractional zeros, trailing decimal points, and negative zero
 * (`-0`) are removed.
 *
 * @param {string} a - First decimal operand as a string.
 * @param {string} b - Second decimal operand as a string.
 * @param {number} [precision] - Optional maximum number of fractional decimal digits.
 * @returns {string} Canonical decimal string representation of `a * b`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number/undefined.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is invalid.
 */
export function multiplyDecimalIterative(a, b, precision) {
	const parsedA = parseDecimalString(a, 'a')
	const parsedB = parseDecimalString(b, 'b')
	validatePrecision(precision)

	if (parsedA.digits === '0' || parsedB.digits === '0') {
		return '0'
	}

	const negative = parsedA.negative !== parsedB.negative
	const digitsA = parsedA.digits
	const digitsB = parsedB.digits
	const lenA = digitsA.length
	const lenB = digitsB.length
	const product = new Array(lenA + lenB).fill(0)

	// Iterative schoolbook digit-by-digit multiplication (right to left)
	for (let i = lenA - 1; i >= 0; i--) {
		const digitA = digitsA.charCodeAt(i) - 48
		for (let j = lenB - 1; j >= 0; j--) {
			const digitB = digitsB.charCodeAt(j) - 48
			const sum = product[i + j + 1] + digitA * digitB
			product[i + j + 1] = sum % 10
			product[i + j] += Math.floor(sum / 10)
		}
	}

	// Strip leading zeros from the raw product buffer
	let startIndex = 0
	while (startIndex < product.length - 1 && product[startIndex] === 0) {
		startIndex++
	}

	const totalScale = parsedA.scale + parsedB.scale
	const significantLength = product.length - startIndex
	const padZeros = Math.max(0, totalScale + 1 - significantLength)

	// Build normalized digit array with at least one integer digit before the decimal point
	const digits = new Array(padZeros + significantLength)
	for (let i = 0; i < padZeros; i++) {
		digits[i] = 0
	}
	for (let i = 0; i < significantLength; i++) {
		digits[padZeros + i] = product[startIndex + i]
	}

	let intLength = digits.length - totalScale
	let finalDigits = digits
	let finalScale = totalScale

	// Apply round-half-away-from-zero when precision limits fractional digits
	if (precision !== undefined && precision < totalScale) {
		const keepLength = intLength + precision
		const roundDigit = digits[keepLength]
		finalDigits = digits.slice(0, keepLength)
		finalScale = precision

		if (roundDigit >= 5) {
			let carry = 1
			for (let i = finalDigits.length - 1; i >= 0 && carry > 0; i--) {
				const sum = finalDigits[i] + carry
				if (sum === 10) {
					finalDigits[i] = 0
					carry = 1
				} else {
					finalDigits[i] = sum
					carry = 0
				}
			}
			if (carry > 0) {
				finalDigits.unshift(1)
				intLength++
			}
		}
	}

	// Strip insignificant leading zeros from the integer part (keep at least one digit)
	let intStart = 0
	while (intStart < intLength - 1 && finalDigits[intStart] === 0) {
		intStart++
	}

	// Strip insignificant trailing zeros from the fractional part
	let fracEnd = finalDigits.length
	while (fracEnd > intLength && finalDigits[fracEnd - 1] === 0) {
		fracEnd--
	}

	const intPart = finalDigits.slice(intStart, intLength).join('')
	const fracPart = finalScale > 0 && fracEnd > intLength
		? finalDigits.slice(intLength, fracEnd).join('')
		: ''

	// Normalize negative zero to "0"
	if (intPart === '0' && fracPart === '') {
		return '0'
	}

	const signPrefix = negative ? '-' : ''
	return fracPart === '' ? `${signPrefix}${intPart}` : `${signPrefix}${intPart}.${fracPart}`
}
