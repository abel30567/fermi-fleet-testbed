const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/

/**
 * Parses and validates an arbitrary-precision decimal string.
 *
 * @param {string} value - The decimal string to parse.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ negative: boolean, digits: bigint, scale: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`Expected ${name} to be a decimal string, got ${typeof value}`)
	}

	const trimmed = value.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new SyntaxError(`Invalid decimal string for ${name}: ${JSON.stringify(value)}`)
	}

	const negative = match[1] === '-'
	const intPart = match[2] ?? ''
	const rawFracPart = match[3] ?? match[4] ?? ''
	const fracPart = rawFracPart.replace(/0+$/, '')

	const combined = `${intPart}${fracPart}`
	const digits = combined.length === 0 ? 0n : BigInt(combined)

	return {
		negative,
		digits,
		scale: fracPart.length,
	}
}

/**
 * Divides two arbitrary-precision decimal strings (`a / b`) using a
 * straightforward iterative long-division algorithm.
 *
 * Produces exact digits up to `precision` fractional places, rounding half
 * away from zero when the quotient does not terminate within `precision`
 * fractional digits. Trailing fractional zeros and negative zero (`-0`) are
 * normalized out.
 *
 * @param {string} a - Dividend as a base-10 decimal string (optional leading `+`/`-`).
 * @param {string} b - Divisor as a base-10 decimal string (must be non-zero).
 * @param {number} [precision=20] - Maximum number of fractional digits (non-negative safe integer).
 * @returns {string} The decimal quotient formatted as a normalized base-10 string.
 * @throws {TypeError} If `a` or `b` is not a string, or if `precision` is not a number.
 * @throws {SyntaxError} If `a` or `b` is not a valid base-10 decimal string.
 * @throws {RangeError} If `precision` is negative or not a safe integer, or if `b` is zero.
 */
export function divideDecimalIterative(a, b, precision = 20) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')

	if (typeof precision !== 'number') {
		throw new TypeError(`Expected precision to be a number, got ${typeof precision}`)
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`Expected precision to be a non-negative safe integer, got ${precision}`)
	}

	if (parsedB.digits === 0n) {
		throw new RangeError('Division by zero')
	}

	if (parsedA.digits === 0n) {
		return '0'
	}

	const negative = parsedA.negative !== parsedB.negative

	// Align decimal scales so that |a / b| = dividend / divisor with integer BigInts.
	let dividend = parsedA.digits
	let divisor = parsedB.digits
	const scaleDiff = parsedB.scale - parsedA.scale
	if (scaleDiff > 0) {
		dividend = BigInt(dividend.toString() + '0'.repeat(scaleDiff))
	} else if (scaleDiff < 0) {
		divisor = BigInt(divisor.toString() + '0'.repeat(-scaleDiff))
	}

	// Iterative long division for the integer part (digit by digit).
	const dividendStr = dividend.toString()
	let remainder = 0n
	const intDigits = []
	for (let i = 0; i < dividendStr.length; i++) {
		remainder = remainder * 10n + BigInt(dividendStr.charCodeAt(i) - 48)
		let quotientDigit = 0
		while (remainder >= divisor) {
			remainder -= divisor
			quotientDigit++
		}
		if (intDigits.length > 0 || quotientDigit > 0) {
			intDigits.push(quotientDigit)
		}
	}
	if (intDigits.length === 0) {
		intDigits.push(0)
	}

	// Iterative long division for up to `precision` fractional digits.
	const fracDigits = []
	for (let i = 0; i < precision && remainder !== 0n; i++) {
		remainder *= 10n
		let quotientDigit = 0
		while (remainder >= divisor) {
			remainder -= divisor
			quotientDigit++
		}
		fracDigits.push(quotientDigit)
	}

	// Round half away from zero: next fractional digit >= 5 iff 2 * remainder >= divisor.
	if (remainder !== 0n && remainder * 2n >= divisor) {
		let carry = 1
		for (let i = fracDigits.length - 1; i >= 0 && carry > 0; i--) {
			const sum = fracDigits[i] + carry
			if (sum === 10) {
				fracDigits[i] = 0
			} else {
				fracDigits[i] = sum
				carry = 0
			}
		}
		for (let i = intDigits.length - 1; i >= 0 && carry > 0; i--) {
			const sum = intDigits[i] + carry
			if (sum === 10) {
				intDigits[i] = 0
			} else {
				intDigits[i] = sum
				carry = 0
			}
		}
		if (carry > 0) {
			intDigits.unshift(1)
		}
	}

	// Trim trailing fractional zeros.
	while (fracDigits.length > 0 && fracDigits[fracDigits.length - 1] === 0) {
		fracDigits.pop()
	}

	// Normalize -0 to 0.
	if (intDigits.length === 1 && intDigits[0] === 0 && fracDigits.length === 0) {
		return '0'
	}

	const sign = negative ? '-' : ''
	const intPart = intDigits.join('')
	if (fracDigits.length === 0) {
		return `${sign}${intPart}`
	}
	return `${sign}${intPart}.${fracDigits.join('')}`
}
