const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const CHUNK_SIZE = 4

/**
 * Strip leading zeros from a non-negative integer digit string, preserving a single `'0'`.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let i = 0
	while (i < digits.length - 1 && digits.charCodeAt(i) === 48) {
		i++
	}
	return digits.slice(i)
}

/**
 * Strip trailing zeros from a fractional digit string.
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
 * Validate and parse a decimal string into its normalized sign, integer digits, and fractional digits.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	if (!DECIMAL_PATTERN.test(trimmed)) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	let sign = 1
	let body = trimmed
	if (body[0] === '-') {
		sign = -1
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	const rawInt = dotIndex === -1 ? body : body.slice(0, dotIndex)
	const rawFrac = dotIndex === -1 ? '' : body.slice(dotIndex + 1)

	const intPart = rawInt.length === 0 ? '0' : stripLeadingZeros(rawInt)
	const fracPart = stripTrailingZeros(rawFrac)

	if (intPart === '0' && fracPart.length === 0) {
		sign = 1
	}

	return { sign, intPart, fracPart }
}

/**
 * Validate the precision parameter.
 *
 * @param {unknown} precision
 * @returns {number}
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
	return precision
}

/**
 * Recursively compare two equal-length non-negative digit strings using divide-and-conquer.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareDigitsRecursive(a, b) {
	const len = a.length
	if (len <= CHUNK_SIZE) {
		const va = Number(a)
		const vb = Number(b)
		return va < vb ? -1 : va > vb ? 1 : 0
	}

	const mid = Math.floor(len / 2)
	const highCmp = compareDigitsRecursive(a.slice(0, mid), b.slice(0, mid))
	if (highCmp !== 0) {
		return highCmp
	}
	return compareDigitsRecursive(a.slice(mid), b.slice(mid))
}

/**
 * Recursively add two equal-length non-negative digit strings with an incoming carry
 * using divide-and-conquer limb splitting and carry propagation.
 *
 * @param {string} a
 * @param {string} b
 * @param {0 | 1} carryIn
 * @returns {{ digits: string, carry: 0 | 1 }}
 */
function addDigitsRecursive(a, b, carryIn) {
	const len = a.length
	if (len <= CHUNK_SIZE) {
		const base = 10 ** len
		const sum = Number(a) + Number(b) + carryIn
		const carry = sum >= base ? 1 : 0
		const digits = String(carry ? sum - base : sum).padStart(len, '0')
		return { digits, carry }
	}

	const mid = Math.floor(len / 2)
	const low = addDigitsRecursive(a.slice(mid), b.slice(mid), carryIn)
	const high = addDigitsRecursive(a.slice(0, mid), b.slice(0, mid), low.carry)
	return {
		digits: high.digits + low.digits,
		carry: high.carry,
	}
}

/**
 * Recursively subtract two equal-length non-negative digit strings (`a >= b`) with an incoming borrow
 * using divide-and-conquer limb splitting and borrow propagation.
 *
 * @param {string} a
 * @param {string} b
 * @param {0 | 1} borrowIn
 * @returns {{ digits: string, borrow: 0 | 1 }}
 */
function subDigitsRecursive(a, b, borrowIn) {
	const len = a.length
	if (len <= CHUNK_SIZE) {
		const base = 10 ** len
		let diff = Number(a) - Number(b) - borrowIn
		let borrow = 0
		if (diff < 0) {
			diff += base
			borrow = 1
		}
		const digits = String(diff).padStart(len, '0')
		return { digits, borrow }
	}

	const mid = Math.floor(len / 2)
	const low = subDigitsRecursive(a.slice(mid), b.slice(mid), borrowIn)
	const high = subDigitsRecursive(a.slice(0, mid), b.slice(0, mid), low.borrow)
	return {
		digits: high.digits + low.digits,
		borrow: high.borrow,
	}
}

/**
 * Round an exact unsigned decimal representation to `precision` fractional digits
 * using half-away-from-zero rounding and recursive carry propagation.
 *
 * @param {string} intPart
 * @param {string} fracPart
 * @param {number} precision
 * @returns {{ intPart: string, fracPart: string }}
 */
function roundDecimal(intPart, fracPart, precision) {
	if (fracPart.length <= precision) {
		return {
			intPart: stripLeadingZeros(intPart),
			fracPart: stripTrailingZeros(fracPart),
		}
	}

	const keptFrac = fracPart.slice(0, precision)
	const roundUp = fracPart.charCodeAt(precision) >= 53 // '5'

	if (!roundUp) {
		return {
			intPart: stripLeadingZeros(intPart),
			fracPart: stripTrailingZeros(keptFrac),
		}
	}

	const combined = intPart + keptFrac
	const { digits, carry } = addDigitsRecursive(combined, '0'.repeat(combined.length), 1)
	const incremented = carry ? '1' + digits : digits

	if (precision === 0) {
		return {
			intPart: stripLeadingZeros(incremented),
			fracPart: '',
		}
	}

	const splitIdx = incremented.length - precision
	return {
		intPart: stripLeadingZeros(incremented.slice(0, splitIdx)),
		fracPart: stripTrailingZeros(incremented.slice(splitIdx)),
	}
}

/**
 * Add two arbitrary-precision decimal strings using a recursive divide-and-conquer
 * limb addition/subtraction algorithm, rounding the result to at most `precision`
 * fractional digits (round half away from zero) and trimming insignificant zeros.
 *
 * @param {string} a - First decimal string (e.g. `"123.45"`, `"-0.001"`, `".5"`).
 * @param {string} b - Second decimal string.
 * @param {number} [precision=20] - Maximum fractional digits in the returned string (non-negative safe integer).
 * @returns {string} The normalized decimal sum string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function addDecimalRecursive(a, b, precision = 20) {
	const left = parseDecimal(a, 'a')
	const right = parseDecimal(b, 'b')
	const maxFracDigits = validatePrecision(precision)

	const scale = Math.max(left.fracPart.length, right.fracPart.length)
	const leftScaled = left.intPart + left.fracPart.padEnd(scale, '0')
	const rightScaled = right.intPart + right.fracPart.padEnd(scale, '0')

	const width = Math.max(leftScaled.length, rightScaled.length)
	const alignedLeft = leftScaled.padStart(width, '0')
	const alignedRight = rightScaled.padStart(width, '0')

	let resultSign = 1
	let rawDigits

	if (left.sign === right.sign) {
		resultSign = left.sign
		const { digits, carry } = addDigitsRecursive(alignedLeft, alignedRight, 0)
		rawDigits = carry ? '1' + digits : digits
	} else {
		const cmp = compareDigitsRecursive(alignedLeft, alignedRight)
		if (cmp === 0) {
			return '0'
		}
		if (cmp > 0) {
			resultSign = left.sign
			rawDigits = subDigitsRecursive(alignedLeft, alignedRight, 0).digits
		} else {
			resultSign = right.sign
			rawDigits = subDigitsRecursive(alignedRight, alignedLeft, 0).digits
		}
	}

	const rawInt = scale === 0 ? rawDigits : rawDigits.slice(0, rawDigits.length - scale)
	const rawFrac = scale === 0 ? '' : rawDigits.slice(rawDigits.length - scale)

	const rounded = roundDecimal(
		stripLeadingZeros(rawInt),
		stripTrailingZeros(rawFrac),
		maxFracDigits,
	)

	if (rounded.intPart === '0' && rounded.fracPart.length === 0) {
		return '0'
	}

	const signPrefix = resultSign < 0 ? '-' : ''
	return rounded.fracPart.length > 0
		? `${signPrefix}${rounded.intPart}.${rounded.fracPart}`
		: `${signPrefix}${rounded.intPart}`
}
