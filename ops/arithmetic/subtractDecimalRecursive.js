const LIMB_DIGITS = 7
const LIMB_BASE = 10_000_000
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * Validates and parses a base-10 decimal string into normalized components.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string, isZero: boolean }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`${name} must be a valid decimal string`)
	}

	let sign = 1
	let body = value
	if (body[0] === '-') {
		sign = -1
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	const rawInt = dotIndex === -1 ? body : body.slice(0, dotIndex)
	const rawFrac = dotIndex === -1 ? '' : body.slice(dotIndex + 1)

	const intPart = rawInt.replace(/^0+/, '') || '0'
	const fracPart = rawFrac.replace(/0+$/, '')
	const isZero = intPart === '0' && fracPart === ''

	return {
		sign: isZero ? 1 : sign,
		intPart,
		fracPart,
		isZero,
	}
}

/**
 * Validates the precision parameter.
 *
 * @param {number} precision - Maximum fractional decimal places in the result.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Converts a non-negative integer digit string into little-endian base-10^7 limbs.
 *
 * @param {string} digits - Non-empty base-10 digit string.
 * @returns {number[]} Little-endian limb array.
 */
function digitsToLimbs(digits) {
	const limbs = []
	for (let end = digits.length; end > 0; end -= LIMB_DIGITS) {
		const start = Math.max(0, end - LIMB_DIGITS)
		limbs.push(Number(digits.slice(start, end)))
	}
	return limbs.length === 0 ? [0] : limbs
}

/**
 * Converts a little-endian base-10^7 limb array back into a canonical digit string.
 *
 * @param {number[]} limbs - Little-endian limb array.
 * @returns {string} Canonical base-10 digit string.
 */
function limbsToDigits(limbs) {
	let top = limbs.length - 1
	while (top > 0 && limbs[top] === 0) {
		top--
	}
	const parts = [String(limbs[top])]
	for (let i = top - 1; i >= 0; i--) {
		parts.push(String(limbs[i]).padStart(LIMB_DIGITS, '0'))
	}
	return parts.join('')
}

/**
 * Pads two limb arrays to equal length in place (on shallow copies) for divide-and-conquer ops.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {[number[], number[], number]}
 */
function alignLimbs(a, b) {
	const len = Math.max(a.length, b.length, 1)
	const pa = a.slice()
	const pb = b.slice()
	while (pa.length < len) pa.push(0)
	while (pb.length < len) pb.push(0)
	return [pa, pb, len]
}

/**
 * Divide-and-conquer comparison of equal-length little-endian limb slices `[start, end)`.
 * Compares the more significant upper half first, recursing into the lower half only on a tie.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} start
 * @param {number} end
 * @returns {-1 | 0 | 1}
 */
function compareLimbsDC(a, b, start, end) {
	const count = end - start
	if (count <= 0) return 0
	if (count === 1) {
		if (a[start] === b[start]) return 0
		return a[start] > b[start] ? 1 : -1
	}

	const mid = start + (count >> 1)
	const highCmp = compareLimbsDC(a, b, mid, end)
	if (highCmp !== 0) return highCmp
	return compareLimbsDC(a, b, start, mid)
}

/**
 * Divide-and-conquer recursive limb subtraction with borrow propagation.
 * Computes `out[start..end-1] = a[start..end-1] - b[start..end-1] - borrowIn` in base `LIMB_BASE`.
 *
 * @param {number[]} a - Minuend limbs (little-endian).
 * @param {number[]} b - Subtrahend limbs (little-endian).
 * @param {number[]} out - Output limb buffer.
 * @param {number} start - Inclusive slice start index.
 * @param {number} end - Exclusive slice end index.
 * @param {0 | 1} borrowIn - Incoming borrow from less-significant limbs.
 * @returns {0 | 1} Outgoing borrow to more-significant limbs.
 */
function subtractLimbsDC(a, b, out, start, end, borrowIn) {
	const count = end - start
	if (count <= 0) return borrowIn
	if (count === 1) {
		const diff = a[start] - b[start] - borrowIn
		if (diff < 0) {
			out[start] = diff + LIMB_BASE
			return 1
		}
		out[start] = diff
		return 0
	}

	const mid = start + (count >> 1)
	const midBorrow = subtractLimbsDC(a, b, out, start, mid, borrowIn)
	return subtractLimbsDC(a, b, out, mid, end, midBorrow)
}

/**
 * Divide-and-conquer recursive limb addition with carry propagation.
 * Computes `out[start..end-1] = a[start..end-1] + b[start..end-1] + carryIn` in base `LIMB_BASE`.
 *
 * @param {number[]} a - Left addend limbs (little-endian).
 * @param {number[]} b - Right addend limbs (little-endian).
 * @param {number[]} out - Output limb buffer.
 * @param {number} start - Inclusive slice start index.
 * @param {number} end - Exclusive slice end index.
 * @param {0 | 1} carryIn - Incoming carry from less-significant limbs.
 * @returns {0 | 1} Outgoing carry to more-significant limbs.
 */
function addLimbsDC(a, b, out, start, end, carryIn) {
	const count = end - start
	if (count <= 0) return carryIn
	if (count === 1) {
		const sum = a[start] + b[start] + carryIn
		if (sum >= LIMB_BASE) {
			out[start] = sum - LIMB_BASE
			return 1
		}
		out[start] = sum
		return 0
	}

	const mid = start + (count >> 1)
	const midCarry = addLimbsDC(a, b, out, start, mid, carryIn)
	return addLimbsDC(a, b, out, mid, end, midCarry)
}

/**
 * Adds two non-negative limb arrays using divide-and-conquer carry propagation.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function addLimbs(a, b) {
	const [pa, pb, len] = alignLimbs(a, b)
	const out = new Array(len)
	const carry = addLimbsDC(pa, pb, out, 0, len, 0)
	if (carry > 0) {
		out.push(carry)
	}
	return out
}

/**
 * Subtracts non-negative limb array `b` from `a` (requires `a >= b`) using divide-and-conquer borrow propagation.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function subtractLimbs(a, b) {
	const [pa, pb, len] = alignLimbs(a, b)
	const out = new Array(len)
	subtractLimbsDC(pa, pb, out, 0, len, 0)
	return out
}

/**
 * Rounds a non-negative scaled decimal digit string to at most `precision` fractional digits
 * using half-away-from-zero rounding.
 *
 * @param {string} digits - Canonical non-negative scaled integer digits.
 * @param {number} scale - Current number of fractional digits.
 * @param {number} precision - Target maximum number of fractional digits.
 * @returns {{ digits: string, scale: number }}
 */
function roundScaledDigits(digits, scale, precision) {
	if (digits === '0') {
		return { digits: '0', scale: 0 }
	}
	if (scale <= precision) {
		return { digits, scale }
	}

	const drop = scale - precision
	const padded = digits.padStart(drop + 1, '0')
	const cut = padded.length - drop
	let kept = padded.slice(0, cut).replace(/^0+/, '') || '0'
	const firstDroppedDigit = Number(padded[cut])

	if (firstDroppedDigit >= 5) {
		const incremented = addLimbs(digitsToLimbs(kept), [1])
		kept = limbsToDigits(incremented)
	}

	return {
		digits: kept,
		scale: kept === '0' ? 0 : precision,
	}
}

/**
 * Formats a scaled non-negative digit string and sign into a canonical decimal string
 * without trailing fractional zeros or negative zero.
 *
 * @param {string} digits - Canonical non-negative scaled integer digits.
 * @param {number} scale - Number of fractional digits.
 * @param {1 | -1} sign - Result sign.
 * @returns {string}
 */
function formatScaledDecimal(digits, scale, sign) {
	if (digits === '0') {
		return '0'
	}
	if (scale === 0) {
		return sign < 0 ? `-${digits}` : digits
	}

	const padded = digits.padStart(scale + 1, '0')
	const splitIndex = padded.length - scale
	const intPart = padded.slice(0, splitIndex)
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '')
	const unsigned = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart

	return sign < 0 ? `-${unsigned}` : unsigned
}

/**
 * Subtracts two arbitrary-precision base-10 decimal strings (`a - b`) using a recursive
 * divide-and-conquer limb arithmetic engine with borrow/carry propagation.
 *
 * Inputs must be standard decimal strings matching `/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/`.
 * Exact arithmetic is performed over scaled base-10^7 limbs and the result is rounded
 * to at most `precision` fractional decimal places (half away from zero), with trailing
 * fractional zeros stripped and `-0` normalized to `'0'`.
 *
 * @param {string} a - Minuend as a base-10 decimal string.
 * @param {string} b - Subtrahend as a base-10 decimal string.
 * @param {number} [precision=20] - Maximum fractional decimal digits in the returned string.
 * @returns {string} Canonical decimal string representation of `a - b`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function subtractDecimalRecursive(a, b, precision = 20) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')
	validatePrecision(precision)

	const scale = Math.max(parsedA.fracPart.length, parsedB.fracPart.length)
	const scaledA = (parsedA.intPart + parsedA.fracPart.padEnd(scale, '0')).replace(/^0+/, '') || '0'
	const scaledB = (parsedB.intPart + parsedB.fracPart.padEnd(scale, '0')).replace(/^0+/, '') || '0'

	const limbsA = digitsToLimbs(scaledA)
	const limbsB = digitsToLimbs(scaledB)

	// a - b === a + (-b)
	const negSignB = parsedB.isZero ? 1 : -parsedB.sign
	let resultSign = 1
	let resultLimbs

	if (parsedA.sign === negSignB) {
		resultSign = parsedA.sign
		resultLimbs = addLimbs(limbsA, limbsB)
	} else {
		const [pa, pb, len] = alignLimbs(limbsA, limbsB)
		const cmp = compareLimbsDC(pa, pb, 0, len)
		if (cmp === 0) {
			return '0'
		}
		if (cmp > 0) {
			resultSign = parsedA.sign
			resultLimbs = subtractLimbs(pa, pb)
		} else {
			resultSign = negSignB
			resultLimbs = subtractLimbs(pb, pa)
		}
	}

	const rawDigits = limbsToDigits(resultLimbs)
	const rounded = roundScaledDigits(rawDigits, scale, precision)
	return formatScaledDecimal(rounded.digits, rounded.scale, resultSign)
}
