/**
 * Arbitrary-precision decimal division using a streaming generator that
 * consumes input iterables lazily.
 *
 * Supports two calling modes:
 * 1. Cumulative (running) division over a single sequence of decimal strings:
 *    `divideDecimalLazy(values, precision = 20)`
 *    Yields the normalized first value, then each successive running quotient
 *    `acc / next` rounded to `precision` fractional digits.
 * 2. Pairwise (element-wise) division over two sequences of decimal strings:
 *    `divideDecimalLazy(dividends, divisors, precision = 20)`
 *    Lazily zips both iterables and yields `dividend / divisor` rounded to
 *    `precision` fractional digits until the shorter iterable is exhausted.
 *
 * Rounding uses half-away-from-zero (`ROUND_HALF_UP`) at the specified
 * fractional `precision`, and output strings are normalized (no trailing
 * fractional zeros, no `-0`).
 *
 * @module ops/arithmetic/divideDecimalLazy
 */

const DEFAULT_PRECISION = 20
const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_ABS_EXPONENT = 1_000_000

/**
 * Checks whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSequenceIterable(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates the precision argument.
 *
 * @param {unknown} precision
 * @returns {number}
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a non-negative integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}
	return precision
}

/**
 * Parses an arbitrary-precision decimal string into canonical `{ unscaled, scale }`
 * form where the represented value is `unscaled * 10^(-scale)`.
 *
 * @param {unknown} input
 * @returns {{ unscaled: bigint, scale: number }}
 */
function parseDecimal(input) {
	if (typeof input !== 'string') {
		throw new TypeError(`Expected decimal string, received ${typeof input}`)
	}

	const match = DECIMAL_PATTERN.exec(input)
	if (!match) {
		throw new SyntaxError(`Invalid decimal string: "${input}"`)
	}

	const [, signStr, intPart = '', fracAfterDot = '', leadingDotFrac = '', expStr] = match
	const fracPart = fracAfterDot || leadingDotFrac
	const negative = signStr === '-'

	let exponent = 0
	if (expStr !== undefined) {
		exponent = Number(expStr)
		if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_ABS_EXPONENT) {
			throw new RangeError(`Exponent out of supported range in "${input}"`)
		}
	}

	const rawDigits = (intPart + fracPart).replace(/^0+/, '')
	if (rawDigits.length === 0) {
		return { unscaled: 0n, scale: 0 }
	}

	const trimmedDigits = rawDigits.replace(/0+$/, '')
	const trailingZeros = rawDigits.length - trimmedDigits.length
	const scale = fracPart.length - exponent - trailingZeros

	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`Scale out of supported range in "${input}"`)
	}

	const magnitude = BigInt(trimmedDigits)
	return {
		unscaled: negative ? -magnitude : magnitude,
		scale,
	}
}

/**
 * Formats a `{ unscaled, scale }` decimal into a canonical decimal string
 * (no trailing fractional zeros, no `-0`).
 *
 * @param {{ unscaled: bigint, scale: number }} dec
 * @returns {string}
 */
function formatDecimal({ unscaled, scale }) {
	if (unscaled === 0n) {
		return '0'
	}

	const negative = unscaled < 0n
	const digits = (negative ? -unscaled : unscaled).toString()
	const sign = negative ? '-' : ''

	if (scale <= 0) {
		return sign + digits + '0'.repeat(-scale)
	}

	const intLen = digits.length - scale
	if (intLen > 0) {
		const intPart = digits.slice(0, intLen)
		const fracPart = digits.slice(intLen).replace(/0+$/, '')
		return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
	}

	const fracPart = ('0'.repeat(-intLen) + digits).replace(/0+$/, '')
	return `${sign}0.${fracPart}`
}

/**
 * Normalizes a non-negative quotient integer at a given scale into a canonical
 * `{ unscaled, scale }` object.
 *
 * @param {bigint} absQuotient
 * @param {number} scale
 * @param {boolean} negative
 * @returns {{ unscaled: bigint, scale: number }}
 */
function normalizeQuotient(absQuotient, scale, negative) {
	if (absQuotient === 0n) {
		return { unscaled: 0n, scale: 0 }
	}

	const digits = absQuotient.toString()
	const trimmed = digits.replace(/0+$/, '')
	const trailingZeros = digits.length - trimmed.length
	const normalizedScale = scale - trailingZeros
	const magnitude = BigInt(trimmed)

	return {
		unscaled: negative ? -magnitude : magnitude,
		scale: normalizedScale,
	}
}

/**
 * Divides two parsed decimals to `precision` fractional decimal places using
 * half-away-from-zero rounding.
 *
 * @param {{ unscaled: bigint, scale: number }} dividend
 * @param {{ unscaled: bigint, scale: number }} divisor
 * @param {number} precision
 * @returns {{ unscaled: bigint, scale: number }}
 */
function divideDecimals(dividend, divisor, precision) {
	if (divisor.unscaled === 0n) {
		throw new RangeError('Division by zero')
	}
	if (dividend.unscaled === 0n) {
		return { unscaled: 0n, scale: 0 }
	}

	const negative = (dividend.unscaled < 0n) !== (divisor.unscaled < 0n)
	const num = dividend.unscaled < 0n ? -dividend.unscaled : dividend.unscaled
	const den = divisor.unscaled < 0n ? -divisor.unscaled : divisor.unscaled

	const shift = precision + divisor.scale - dividend.scale
	let scaledNum
	let scaledDen

	if (shift >= 0) {
		scaledNum = num * 10n ** BigInt(shift)
		scaledDen = den
	} else {
		scaledNum = num
		scaledDen = den * 10n ** BigInt(-shift)
	}

	let quotient = scaledNum / scaledDen
	const remainder = scaledNum % scaledDen

	if (2n * remainder >= scaledDen) {
		quotient += 1n
	}

	return normalizeQuotient(quotient, precision, negative)
}

/**
 * Generator implementing lazy cumulative division over a single iterable.
 *
 * @param {Iterable<string>} values
 * @param {number} precision
 * @returns {Generator<string, void, undefined>}
 */
function* cumulativeDivideGenerator(values, precision) {
	const iterator = values[Symbol.iterator]()
	let completed = false

	try {
		const first = iterator.next()
		if (first.done) {
			completed = true
			return
		}

		let acc = parseDecimal(first.value)
		yield formatDecimal(acc)

		while (true) {
			const step = iterator.next()
			if (step.done) {
				completed = true
				return
			}

			const divisor = parseDecimal(step.value)
			acc = divideDecimals(acc, divisor, precision)
			yield formatDecimal(acc)
		}
	} finally {
		if (!completed && typeof iterator.return === 'function') {
			iterator.return()
		}
	}
}

/**
 * Generator implementing lazy element-wise division over two iterables.
 *
 * @param {Iterable<string>} dividends
 * @param {Iterable<string>} divisors
 * @param {number} precision
 * @returns {Generator<string, void, undefined>}
 */
function* pairwiseDivideGenerator(dividends, divisors, precision) {
	const dividendIter = dividends[Symbol.iterator]()
	const divisorIter = divisors[Symbol.iterator]()
	let dividendDone = false
	let divisorDone = false

	try {
		while (true) {
			const nextDividend = dividendIter.next()
			if (nextDividend.done) {
				dividendDone = true
				return
			}

			const nextDivisor = divisorIter.next()
			if (nextDivisor.done) {
				divisorDone = true
				return
			}

			const a = parseDecimal(nextDividend.value)
			const b = parseDecimal(nextDivisor.value)
			const quotient = divideDecimals(a, b, precision)
			yield formatDecimal(quotient)
		}
	} finally {
		if (!dividendDone && typeof dividendIter.return === 'function') {
			dividendIter.return()
		}
		if (!divisorDone && typeof divisorIter.return === 'function') {
			divisorIter.return()
		}
	}
}

/**
 * Lazily divides arbitrary-precision decimal strings with configurable
 * fractional precision.
 *
 * Calling signatures:
 * - `divideDecimalLazy(values, precision = 20)`:
 *   Consumes `values` one element at a time and yields running quotients
 *   (`v0`, `v0 / v1`, `(v0 / v1) / v2`, ...).
 * - `divideDecimalLazy(dividends, divisors, precision = 20)`:
 *   Lazily zips `dividends` and `divisors` and yields `dividends[i] / divisors[i]`
 *   until either iterable finishes.
 *
 * @param {Iterable<string>} first - Sequence of decimal strings (or dividends in pairwise mode).
 * @param {Iterable<string>|number} [second] - Precision (cumulative mode) or divisors sequence (pairwise mode).
 * @param {number} [third] - Precision in pairwise mode (default: 20).
 * @returns {Generator<string, void, undefined>} Generator yielding normalized decimal string quotients.
 * @throws {TypeError} If sequence arguments are not non-string iterables, precision is not a number, or elements are not strings.
 * @throws {RangeError} If precision is not a non-negative safe integer, exponent is out of range, or division by zero occurs.
 * @throws {SyntaxError} If an input element is not a valid decimal string.
 */
export function divideDecimalLazy(first, second, third) {
	if (!isSequenceIterable(first)) {
		throw new TypeError('First argument must be a non-string iterable of decimal strings')
	}

	if (isSequenceIterable(second)) {
		const precision = third === undefined ? DEFAULT_PRECISION : validatePrecision(third)
		return pairwiseDivideGenerator(first, second, precision)
	}

	if (third !== undefined) {
		throw new TypeError('Second argument must be a non-string iterable when three arguments are provided')
	}

	const precision = second === undefined ? DEFAULT_PRECISION : validatePrecision(second)
	return cumulativeDivideGenerator(first, precision)
}
