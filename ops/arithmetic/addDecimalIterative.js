/**
 * Strips leading zeros from a non-empty digit string, keeping a single `'0'`
 * if all digits are zero.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let start = 0
	while (start < digits.length - 1 && digits.charCodeAt(start) === 48) {
		start += 1
	}
	return start === 0 ? digits : digits.slice(start)
}

/**
 * Strips trailing zeros from a digit string.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripTrailingZeros(digits) {
	let end = digits.length
	while (end > 0 && digits.charCodeAt(end - 1) === 48) {
		end -= 1
	}
	return end === digits.length ? digits : digits.slice(0, end)
}

/**
 * Validates and parses a base-10 decimal string into normalized sign, integer,
 * and fractional digit parts.
 *
 * Accepted format: optional leading `+` or `-`, followed by digits with at most
 * one decimal point and at least one digit overall (e.g. `"42"`, `"-0.5"`,
 * `".25"`, `"5."`).
 *
 * @param {string} value
 * @param {string} paramName
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string }}
 */
function parseDecimal(value, paramName) {
	if (typeof value !== 'string') {
		throw new TypeError(`${paramName} must be a decimal string`)
	}
	if (value.length === 0) {
		throw new RangeError(`${paramName} must not be empty`)
	}

	let idx = 0
	/** @type {1 | -1} */
	let sign = 1
	const firstCode = value.charCodeAt(0)
	if (firstCode === 45) {
		sign = -1
		idx = 1
	} else if (firstCode === 43) {
		idx = 1
	}

	let dotIndex = -1
	let digitCount = 0

	for (let i = idx; i < value.length; i += 1) {
		const code = value.charCodeAt(i)
		if (code >= 48 && code <= 57) {
			digitCount += 1
		} else if (code === 46 && dotIndex === -1) {
			dotIndex = i
		} else {
			throw new RangeError(`${paramName} is not a valid decimal string: "${value}"`)
		}
	}

	if (digitCount === 0) {
		throw new RangeError(`${paramName} is not a valid decimal string: "${value}"`)
	}

	const rawInt = dotIndex === -1 ? value.slice(idx) : value.slice(idx, dotIndex)
	const rawFrac = dotIndex === -1 ? '' : value.slice(dotIndex + 1)

	const intPart = rawInt.length === 0 ? '0' : stripLeadingZeros(rawInt)
	const fracPart = stripTrailingZeros(rawFrac)

	if (intPart === '0' && fracPart.length === 0) {
		sign = 1
	}

	return { sign, intPart, fracPart }
}

/**
 * Validates the optional fractional precision argument.
 *
 * @param {number | undefined} precision
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer or undefined')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError(`precision must be a non-negative safe integer, got ${precision}`)
	}
}

/**
 * Compares two equal-length unsigned digit strings lexicographically.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareDigitStrings(a, b) {
	for (let i = 0; i < a.length; i += 1) {
		const diff = a.charCodeAt(i) - b.charCodeAt(i)
		if (diff !== 0) {
			return diff > 0 ? 1 : -1
		}
	}
	return 0
}

/**
 * Adds two equal-length unsigned digit strings iteratively from right to left.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function addMagnitudes(a, b) {
	const len = a.length
	const out = new Array(len)
	let carry = 0

	for (let i = len - 1; i >= 0; i -= 1) {
		const sum = (a.charCodeAt(i) - 48) + (b.charCodeAt(i) - 48) + carry
		if (sum >= 10) {
			out[i] = String(sum - 10)
			carry = 1
		} else {
			out[i] = String(sum)
			carry = 0
		}
	}

	return carry === 1 ? `1${out.join('')}` : out.join('')
}

/**
 * Subtracts `smaller` from `larger` iteratively from right to left.
 * Both inputs must have equal length and satisfy `larger >= smaller`.
 *
 * @param {string} larger
 * @param {string} smaller
 * @returns {string}
 */
function subtractMagnitudes(larger, smaller) {
	const len = larger.length
	const out = new Array(len)
	let borrow = 0

	for (let i = len - 1; i >= 0; i -= 1) {
		let diff = (larger.charCodeAt(i) - 48) - (smaller.charCodeAt(i) - 48) - borrow
		if (diff < 0) {
			diff += 10
			borrow = 1
		} else {
			borrow = 0
		}
		out[i] = String(diff)
	}

	return out.join('')
}

/**
 * Rounds an unsigned decimal magnitude `(intPart, fracPart)` to at most
 * `precision` fractional digits using half-away-from-zero rounding via
 * iterative carry propagation.
 *
 * @param {string} intPart
 * @param {string} fracPart
 * @param {number} precision
 * @returns {{ intPart: string, fracPart: string }}
 */
function roundMagnitude(intPart, fracPart, precision) {
	if (fracPart.length <= precision) {
		return { intPart, fracPart }
	}

	const nextDigit = fracPart.charCodeAt(precision) - 48
	const keptFrac = fracPart.slice(0, precision)

	if (nextDigit < 5) {
		return { intPart, fracPart: keptFrac }
	}

	const combined = intPart + keptFrac
	const out = new Array(combined.length)
	let carry = 1

	for (let i = combined.length - 1; i >= 0; i -= 1) {
		const digit = (combined.charCodeAt(i) - 48) + carry
		if (digit === 10) {
			out[i] = '0'
			carry = 1
		} else {
			out[i] = String(digit)
			carry = 0
		}
	}

	const rounded = carry === 1 ? `1${out.join('')}` : out.join('')
	if (precision === 0) {
		return { intPart: rounded, fracPart: '' }
	}

	const splitIdx = rounded.length - precision
	return {
		intPart: rounded.slice(0, splitIdx),
		fracPart: rounded.slice(splitIdx),
	}
}

/**
 * Adds two arbitrary-precision base-10 decimal strings using a straightforward
 * iterative digit-by-digit algorithm with no IEEE 754 floating-point conversion.
 *
 * The returned string is canonically normalized: no unnecessary leading zeros,
 * no trailing fractional zeros or trailing decimal point, and negative zero is
 * always normalized to `"0"`.
 *
 * When `precision` is provided, the exact sum is rounded to at most `precision`
 * fractional decimal places using half-away-from-zero rounding before canonical
 * normalization. When omitted (`undefined`), the full exact sum is returned.
 *
 * @param {string} a - First decimal string (e.g. `"0.1"`, `"-123456.789"`).
 * @param {string} b - Second decimal string.
 * @param {number} [precision] - Optional maximum number of fractional digits
 *   (non-negative safe integer) to round the result to.
 * @returns {string} Canonical decimal string representation of `a + b`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is neither
 *   `undefined` nor a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or
 *   `precision` is not a non-negative safe integer.
 */
export function addDecimalIterative(a, b, precision) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')
	validatePrecision(precision)

	const intLen = Math.max(parsedA.intPart.length, parsedB.intPart.length)
	const fracLen = Math.max(parsedA.fracPart.length, parsedB.fracPart.length)

	const digitsA = parsedA.intPart.padStart(intLen, '0') + parsedA.fracPart.padEnd(fracLen, '0')
	const digitsB = parsedB.intPart.padStart(intLen, '0') + parsedB.fracPart.padEnd(fracLen, '0')

	/** @type {1 | -1} */
	let resultSign
	let rawDigits

	if (parsedA.sign === parsedB.sign) {
		resultSign = parsedA.sign
		rawDigits = addMagnitudes(digitsA, digitsB)
	} else {
		const cmp = compareDigitStrings(digitsA, digitsB)
		if (cmp === 0) {
			return '0'
		}
		if (cmp > 0) {
			resultSign = parsedA.sign
			rawDigits = subtractMagnitudes(digitsA, digitsB)
		} else {
			resultSign = parsedB.sign
			rawDigits = subtractMagnitudes(digitsB, digitsA)
		}
	}

	let resInt
	let resFrac
	if (fracLen === 0) {
		resInt = rawDigits
		resFrac = ''
	} else {
		const splitIdx = rawDigits.length - fracLen
		resInt = rawDigits.slice(0, splitIdx)
		resFrac = rawDigits.slice(splitIdx)
	}

	if (precision !== undefined) {
		const rounded = roundMagnitude(resInt, resFrac, precision)
		resInt = rounded.intPart
		resFrac = rounded.fracPart
	}

	resInt = stripLeadingZeros(resInt)
	resFrac = stripTrailingZeros(resFrac)

	if (resInt === '0' && resFrac.length === 0) {
		return '0'
	}

	const signPrefix = resultSign < 0 ? '-' : ''
	return resFrac.length > 0 ? `${signPrefix}${resInt}.${resFrac}` : `${signPrefix}${resInt}`
}
