/**
 * Parses and validates an arbitrary-precision decimal string iteratively.
 *
 * @param {string} value - The input decimal string to parse.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ isNegative: boolean, digits: number[], scale: number, isZero: boolean }}
 */
function parseDecimalString(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}
	if (value.length === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	let index = 0
	let isNegative = false
	const firstCode = value.charCodeAt(0)
	if (firstCode === 45) { // '-'
		isNegative = true
		index = 1
	} else if (firstCode === 43) { // '+'
		index = 1
	}

	let dotIndex = -1
	let digitCount = 0
	const startIdx = index

	for (; index < value.length; index++) {
		const code = value.charCodeAt(index)
		if (code === 46) { // '.'
			if (dotIndex !== -1) {
				throw new RangeError(`${name} contains multiple decimal points`)
			}
			dotIndex = index
		} else if (code >= 48 && code <= 57) { // '0'..'9'
			digitCount++
		} else {
			throw new RangeError(`${name} contains invalid character at index ${index}`)
		}
	}

	if (digitCount === 0) {
		throw new RangeError(`${name} must contain at least one digit`)
	}

	const intPart = dotIndex === -1 ? value.slice(startIdx) : value.slice(startIdx, dotIndex)
	let fracPart = dotIndex === -1 ? '' : value.slice(dotIndex + 1)

	// Strip trailing fractional zeros to minimize work
	let fracEnd = fracPart.length
	while (fracEnd > 0 && fracPart.charCodeAt(fracEnd - 1) === 48) {
		fracEnd--
	}
	fracPart = fracPart.slice(0, fracEnd)

	const scale = fracPart.length
	const combined = intPart + fracPart

	// Strip leading zeros
	let firstNonZero = 0
	while (firstNonZero < combined.length && combined.charCodeAt(firstNonZero) === 48) {
		firstNonZero++
	}

	if (firstNonZero === combined.length) {
		return { isNegative: false, digits: [0], scale: 0, isZero: true }
	}

	const digits = new Array(combined.length - firstNonZero)
	for (let i = firstNonZero; i < combined.length; i++) {
		digits[i - firstNonZero] = combined.charCodeAt(i) - 48
	}

	return { isNegative, digits, scale, isZero: false }
}

/**
 * Validates the optional precision argument.
 *
 * @param {number | undefined} precision - Desired number of fractional digits.
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer or undefined')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Multiplies two arbitrary-precision decimal strings using a straightforward
 * iterative base-10 long-multiplication algorithm.
 *
 * When `precision` is omitted (`undefined`), returns the exact normalized
 * product with unnecessary leading integer zeros and trailing fractional zeros
 * removed. When `precision` is provided as a non-negative safe integer, rounds
 * the result to exactly `precision` fractional digits using round-half-away-from-zero
 * (padding with trailing zeros if needed, or omitting the decimal point when
 * `precision === 0`). Negative zero is always normalized to positive zero.
 *
 * @param {string} a - First decimal string operand (e.g. `"-123.45"`, `".5"`, `"100"`).
 * @param {string} b - Second decimal string operand.
 * @param {number} [precision] - Optional non-negative integer number of fractional digits in the output.
 * @returns {string} The product formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is defined and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is negative, non-integer, or unsafe.
 */
export function multiplyDecimalIterative(a, b, precision) {
	const left = parseDecimalString(a, 'a')
	const right = parseDecimalString(b, 'b')
	validatePrecision(precision)

	if (left.isZero || right.isZero) {
		if (precision === undefined || precision === 0) {
			return '0'
		}
		return `0.${'0'.repeat(precision)}`
	}

	const isNegative = left.isNegative !== right.isNegative
	const digitsA = left.digits
	const digitsB = right.digits
	const lenA = digitsA.length
	const lenB = digitsB.length
	const product = new Array(lenA + lenB).fill(0)

	// Straightforward iterative grade-school multiplication
	for (let i = lenA - 1; i >= 0; i--) {
		const da = digitsA[i]
		for (let j = lenB - 1; j >= 0; j--) {
			const posLow = i + j + 1
			const posHigh = i + j
			const sum = da * digitsB[j] + product[posLow]
			product[posLow] = sum % 10
			product[posHigh] += Math.floor(sum / 10)
		}
	}

	// Strip leading zeros from the product digit array
	let firstNonZero = 0
	while (firstNonZero < product.length && product[firstNonZero] === 0) {
		firstNonZero++
	}
	const significant = product.slice(firstNonZero)
	const resultScale = left.scale + right.scale

	let intStr
	let fracStr
	if (resultScale === 0) {
		intStr = significant.join('')
		fracStr = ''
	} else if (significant.length <= resultScale) {
		intStr = '0'
		fracStr = '0'.repeat(resultScale - significant.length) + significant.join('')
	} else {
		const splitPos = significant.length - resultScale
		intStr = significant.slice(0, splitPos).join('')
		fracStr = significant.slice(splitPos).join('')
	}

	// Exact normalized output when precision is omitted
	if (precision === undefined) {
		let fracEnd = fracStr.length
		while (fracEnd > 0 && fracStr.charCodeAt(fracEnd - 1) === 48) {
			fracEnd--
		}
		fracStr = fracStr.slice(0, fracEnd)
		const magnitude = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr
		return isNegative ? `-${magnitude}` : magnitude
	}

	// Pad with trailing zeros if exact scale is within requested precision
	if (fracStr.length <= precision) {
		fracStr = fracStr + '0'.repeat(precision - fracStr.length)
		const magnitude = precision > 0 ? `${intStr}.${fracStr}` : intStr
		return isNegative ? `-${magnitude}` : magnitude
	}

	// Round half away from zero to requested precision
	const roundDigit = fracStr.charCodeAt(precision) - 48
	const keptDigits = (intStr + fracStr.slice(0, precision)).split('')

	if (roundDigit >= 5) {
		let carry = 1
		for (let i = keptDigits.length - 1; i >= 0 && carry > 0; i--) {
			const sum = (keptDigits[i].charCodeAt(0) - 48) + carry
			if (sum === 10) {
				keptDigits[i] = '0'
				carry = 1
			} else {
				keptDigits[i] = String(sum)
				carry = 0
			}
		}
		if (carry > 0) {
			keptDigits.unshift('1')
		}
	}

	let allZero = true
	for (let i = 0; i < keptDigits.length; i++) {
		if (keptDigits[i] !== '0') {
			allZero = false
			break
		}
	}

	let magnitude
	if (precision === 0) {
		magnitude = keptDigits.join('')
	} else {
		const splitPos = keptDigits.length - precision
		magnitude = `${keptDigits.slice(0, splitPos).join('')}.${keptDigits.slice(splitPos).join('')}`
	}

	return isNegative && !allZero ? `-${magnitude}` : magnitude
}
