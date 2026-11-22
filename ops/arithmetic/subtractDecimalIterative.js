const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/

/**
 * Removes leading `'0'` characters while preserving at least one digit.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let start = 0
	while (start < digits.length - 1 && digits.charCodeAt(start) === 48) {
		start++
	}
	return digits.slice(start)
}

/**
 * Removes trailing `'0'` characters from a fractional digit string.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripTrailingZeros(digits) {
	let end = digits.length
	while (end > 0 && digits.charCodeAt(end - 1) === 48) {
		end--
	}
	return digits.slice(0, end)
}

/**
 * Validates and parses a decimal string into a normalized sign and digit parts.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const match = DECIMAL_PATTERN.exec(value)
	if (!match) {
		throw new RangeError(`${name} is not a valid decimal string: ${JSON.stringify(value)}`)
	}

	const signChar = match[1]
	const rawInt = match[2] ?? '0'
	const rawFrac = match[3] ?? match[4] ?? ''

	const intPart = stripLeadingZeros(rawInt)
	const fracPart = stripTrailingZeros(rawFrac)
	const isZero = intPart === '0' && fracPart === ''

	return {
		sign: isZero || signChar !== '-' ? 1 : -1,
		intPart,
		fracPart,
	}
}

/**
 * Validates the optional fractional precision argument.
 *
 * @param {unknown} precision
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
 * Compares the magnitudes of two normalized non-negative decimal parts iteratively.
 *
 * @param {{ intPart: string, fracPart: string }} x
 * @param {{ intPart: string, fracPart: string }} y
 * @returns {-1 | 0 | 1}
 */
function compareMagnitudesIterative(x, y) {
	if (x.intPart.length !== y.intPart.length) {
		return x.intPart.length > y.intPart.length ? 1 : -1
	}

	for (let i = 0; i < x.intPart.length; i++) {
		const dx = x.intPart.charCodeAt(i)
		const dy = y.intPart.charCodeAt(i)
		if (dx !== dy) {
			return dx > dy ? 1 : -1
		}
	}

	const maxFrac = Math.max(x.fracPart.length, y.fracPart.length)
	for (let i = 0; i < maxFrac; i++) {
		const dx = i < x.fracPart.length ? x.fracPart.charCodeAt(i) : 48
		const dy = i < y.fracPart.length ? y.fracPart.charCodeAt(i) : 48
		if (dx !== dy) {
			return dx > dy ? 1 : -1
		}
	}

	return 0
}

/**
 * Adds two magnitudes digit-by-digit iteratively from least to most significant digit.
 *
 * @param {{ intPart: string, fracPart: string }} x
 * @param {{ intPart: string, fracPart: string }} y
 * @returns {{ intPart: string, fracPart: string }}
 */
function addMagnitudesIterative(x, y) {
	const maxInt = Math.max(x.intPart.length, y.intPart.length)
	const maxFrac = Math.max(x.fracPart.length, y.fracPart.length)
	const digitsX = x.intPart.padStart(maxInt, '0') + x.fracPart.padEnd(maxFrac, '0')
	const digitsY = y.intPart.padStart(maxInt, '0') + y.fracPart.padEnd(maxFrac, '0')
	const totalLen = maxInt + maxFrac

	const out = new Array(totalLen)
	let carry = 0

	for (let i = totalLen - 1; i >= 0; i--) {
		const sum = (digitsX.charCodeAt(i) - 48) + (digitsY.charCodeAt(i) - 48) + carry
		if (sum >= 10) {
			out[i] = String.fromCharCode(48 + sum - 10)
			carry = 1
		} else {
			out[i] = String.fromCharCode(48 + sum)
			carry = 0
		}
	}

	const intRaw = (carry ? '1' : '') + out.slice(0, maxInt).join('')
	const fracRaw = maxFrac > 0 ? out.slice(maxInt).join('') : ''

	return {
		intPart: stripLeadingZeros(intRaw),
		fracPart: stripTrailingZeros(fracRaw),
	}
}

/**
 * Subtracts magnitude `smaller` from `larger` (where `|larger| >= |smaller|`)
 * digit-by-digit iteratively, propagating borrows seamlessly across the decimal point.
 *
 * @param {{ intPart: string, fracPart: string }} larger
 * @param {{ intPart: string, fracPart: string }} smaller
 * @returns {{ intPart: string, fracPart: string }}
 */
function subtractMagnitudesIterative(larger, smaller) {
	const maxInt = Math.max(larger.intPart.length, smaller.intPart.length)
	const maxFrac = Math.max(larger.fracPart.length, smaller.fracPart.length)
	const digitsA = larger.intPart.padStart(maxInt, '0') + larger.fracPart.padEnd(maxFrac, '0')
	const digitsB = smaller.intPart.padStart(maxInt, '0') + smaller.fracPart.padEnd(maxFrac, '0')
	const totalLen = maxInt + maxFrac

	const out = new Array(totalLen)
	let borrow = 0

	for (let i = totalLen - 1; i >= 0; i--) {
		let diff = (digitsA.charCodeAt(i) - 48) - (digitsB.charCodeAt(i) - 48) - borrow
		if (diff < 0) {
			diff += 10
			borrow = 1
		} else {
			borrow = 0
		}
		out[i] = String.fromCharCode(48 + diff)
	}

	const intRaw = out.slice(0, maxInt).join('')
	const fracRaw = maxFrac > 0 ? out.slice(maxInt).join('') : ''

	return {
		intPart: stripLeadingZeros(intRaw),
		fracPart: stripTrailingZeros(fracRaw),
	}
}

/**
 * Rounds a normalized magnitude to at most `precision` fractional digits using
 * half-away-from-zero rounding, propagating any carry iteratively.
 *
 * @param {string} intPart
 * @param {string} fracPart
 * @param {number | undefined} precision
 * @returns {{ intPart: string, fracPart: string }}
 */
function roundMagnitudeIterative(intPart, fracPart, precision) {
	if (precision === undefined || fracPart.length <= precision) {
		return { intPart, fracPart }
	}

	const roundDigit = fracPart.charCodeAt(precision) - 48
	const keptFrac = fracPart.slice(0, precision)

	if (roundDigit < 5) {
		return {
			intPart,
			fracPart: stripTrailingZeros(keptFrac),
		}
	}

	const combined = intPart + keptFrac
	const chars = combined.split('')
	let carry = 1

	for (let i = chars.length - 1; i >= 0 && carry > 0; i--) {
		const next = (chars[i].charCodeAt(0) - 48) + carry
		if (next >= 10) {
			chars[i] = '0'
			carry = 1
		} else {
			chars[i] = String.fromCharCode(48 + next)
			carry = 0
		}
	}

	const newInt = (carry ? '1' : '') + chars.slice(0, intPart.length).join('')
	const newFrac = precision > 0 ? chars.slice(intPart.length).join('') : ''

	return {
		intPart: stripLeadingZeros(newInt),
		fracPart: stripTrailingZeros(newFrac),
	}
}

/**
 * Subtracts two arbitrary-precision base-10 decimal strings (`a - b`) using a
 * straightforward iterative digit-by-digit implementation.
 *
 * Supports optional leading `+`/`-` signs, integer or fractional inputs (including
 * forms like `".5"` and `"5."`), borrows/carries across the decimal point, and
 * optional fractional precision rounding (half away from zero). Unnecessary
 * leading/trailing zeros are stripped from the normalized result, and zero is
 * always returned as `"0"` (never `"-0"`).
 *
 * @param {string} a - Minuend as a base-10 decimal string.
 * @param {string} b - Subtrahend as a base-10 decimal string.
 * @param {number} [precision] - Optional maximum number of fractional digits to
 *   retain (non-negative safe integer). When omitted, the exact difference is returned.
 * @returns {string} The normalized decimal string representation of `a - b`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is defined and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid base-10 decimal string, or
 *   `precision` is not a non-negative safe integer.
 */
export function subtractDecimalIterative(a, b, precision) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')
	validatePrecision(precision)

	// Compute a - b as a + (-b)
	const negBIsZero = parsedB.intPart === '0' && parsedB.fracPart === ''
	const negB = {
		sign: negBIsZero ? 1 : /** @type {1 | -1} */ (-parsedB.sign),
		intPart: parsedB.intPart,
		fracPart: parsedB.fracPart,
	}

	let resultSign
	let magnitude

	if (parsedA.sign === negB.sign) {
		resultSign = parsedA.sign
		magnitude = addMagnitudesIterative(parsedA, negB)
	} else {
		const cmp = compareMagnitudesIterative(parsedA, negB)
		if (cmp === 0) {
			return '0'
		}
		if (cmp > 0) {
			resultSign = parsedA.sign
			magnitude = subtractMagnitudesIterative(parsedA, negB)
		} else {
			resultSign = negB.sign
			magnitude = subtractMagnitudesIterative(negB, parsedA)
		}
	}

	const rounded = roundMagnitudeIterative(magnitude.intPart, magnitude.fracPart, precision)
	if (rounded.intPart === '0' && rounded.fracPart === '') {
		return '0'
	}

	const signPrefix = resultSign < 0 ? '-' : ''
	const fracSuffix = rounded.fracPart.length > 0 ? `.${rounded.fracPart}` : ''
	return `${signPrefix}${rounded.intPart}${fracSuffix}`
}
