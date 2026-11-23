const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_OUTPUT_DIGITS = 10_000_000

/**
 * Strip trailing base-10 zeros from a BigInt coefficient, adjusting the exponent.
 *
 * @param {bigint} coeff
 * @param {number} exp
 * @returns {{ coeff: bigint, exp: number }}
 */
function normalizeDecimal(coeff, exp) {
	if (coeff === 0n) {
		return { coeff: 0n, exp: 0 }
	}
	if (coeff % 10n !== 0n) {
		return { coeff, exp }
	}
	const negative = coeff < 0n
	const digits = (negative ? -coeff : coeff).toString()
	const trimmed = digits.replace(/0+$/, '')
	const trailing = digits.length - trimmed.length
	const nextExp = exp + trailing
	if (!Number.isSafeInteger(nextExp)) {
		throw new RangeError('Decimal exponent overflow')
	}
	const nextCoeff = BigInt(trimmed)
	return { coeff: negative ? -nextCoeff : nextCoeff, exp: nextExp }
}

/**
 * Parse and validate an arbitrary-precision decimal string into `{ coeff, exp }`
 * representing `coeff * 10^exp`.
 *
 * @param {unknown} raw
 * @returns {{ coeff: bigint, exp: number }}
 */
function parseDecimal(raw) {
	if (typeof raw !== 'string') {
		throw new TypeError(`Expected decimal string element, received ${raw === null ? 'null' : typeof raw}`)
	}
	const trimmed = raw.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: ${JSON.stringify(raw)}`)
	}

	const negative = match[1] === '-'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	let parsedExp = 0
	if (expPart !== undefined) {
		parsedExp = Number(expPart)
		if (!Number.isSafeInteger(parsedExp)) {
			throw new RangeError(`Decimal exponent out of safe range: ${JSON.stringify(raw)}`)
		}
	}

	const combined = intPart + fracPart
	const withoutLeadingZeros = combined.replace(/^0+/, '')
	if (withoutLeadingZeros.length === 0) {
		return { coeff: 0n, exp: 0 }
	}

	const withoutTrailingZeros = withoutLeadingZeros.replace(/0+$/, '')
	const trailingZeros = withoutLeadingZeros.length - withoutTrailingZeros.length
	const exp = parsedExp - fracPart.length + trailingZeros
	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`Decimal exponent out of safe range: ${JSON.stringify(raw)}`)
	}

	const magnitude = BigInt(withoutTrailingZeros)
	return { coeff: negative ? -magnitude : magnitude, exp }
}

/**
 * Lazily validate and parse an iterable of decimal strings one element at a time.
 *
 * @param {Iterable<string>} iterable
 * @yields {{ coeff: bigint, exp: number }}
 */
function* parseDecimalStream(iterable) {
	for (const item of iterable) {
		yield parseDecimal(item)
	}
}

/**
 * Lazily compute running products over a stream of parsed decimals.
 * Short-circuits immediately upon encountering zero so upstream iterators
 * stop pulling values and can run cleanup logic.
 *
 * @param {Iterable<{ coeff: bigint, exp: number }>} parsedStream
 * @yields {{ coeff: bigint, exp: number }}
 */
function* runningProductStream(parsedStream) {
	let accCoeff = 1n
	let accExp = 0

	for (const { coeff, exp } of parsedStream) {
		if (coeff === 0n) {
			yield { coeff: 0n, exp: 0 }
			return
		}

		const nextExp = accExp + exp
		if (!Number.isSafeInteger(nextExp)) {
			throw new RangeError('Decimal exponent overflow during multiplication')
		}

		const normalized = normalizeDecimal(accCoeff * coeff, nextExp)
		accCoeff = normalized.coeff
		accExp = normalized.exp
		yield normalized
	}
}

/**
 * Round and format a parsed decimal `{ coeff, exp }` to at most `precision`
 * fractional decimal places using round-half-to-even (banker's rounding).
 *
 * @param {{ coeff: bigint, exp: number }} value
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal({ coeff, exp }, precision) {
	if (coeff === 0n) {
		return '0'
	}

	const negative = coeff < 0n
	let absCoeff = negative ? -coeff : coeff
	let finalExp = exp

	if (finalExp < -precision) {
		const shift = -finalExp - precision
		const digitCount = absCoeff.toString().length
		// If shift > digitCount, absCoeff / 10^shift < 0.1 < 0.5, so it always rounds to 0.
		if (shift > digitCount) {
			return '0'
		}
		const divisor = 10n ** BigInt(shift)
		const quotient = absCoeff / divisor
		const remainder = absCoeff % divisor
		const twiceRemainder = remainder * 2n

		let rounded = quotient
		if (twiceRemainder > divisor || (twiceRemainder === divisor && (quotient & 1n) === 1n)) {
			rounded += 1n
		}

		if (rounded === 0n) {
			return '0'
		}
		absCoeff = rounded
		finalExp = -precision
	}

	const digits = absCoeff.toString()

	if (finalExp >= 0) {
		if (digits.length + finalExp > MAX_OUTPUT_DIGITS) {
			throw new RangeError('Formatted decimal exceeds maximum supported output length')
		}
		return `${negative ? '-' : ''}${digits}${'0'.repeat(finalExp)}`
	}

	const scale = -finalExp
	let intPart
	let fracPart
	if (digits.length > scale) {
		intPart = digits.slice(0, digits.length - scale)
		fracPart = digits.slice(digits.length - scale)
	} else {
		if (scale + 2 > MAX_OUTPUT_DIGITS) {
			throw new RangeError('Formatted decimal exceeds maximum supported output length')
		}
		intPart = '0'
		fracPart = `${'0'.repeat(scale - digits.length)}${digits}`
	}

	fracPart = fracPart.replace(/0+$/, '')
	const sign = negative ? '-' : ''
	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

/**
 * Compute the discrete product of an iterable of arbitrary-precision decimal strings
 * using a lazy, generator-based streaming pipeline backed by `BigInt`.
 *
 * - Consumes `values` lazily without materializing the input sequence.
 * - Short-circuits immediately when a zero value is encountered, closing the
 *   upstream iterator without pulling remaining elements (so even infinite
 *   generators containing a zero terminate).
 * - Returns `'1'` (the multiplicative identity) for empty iterables.
 * - Accumulates exact products during streaming and rounds the final result to
 *   at most `precision` fractional decimal places using round-half-to-even
 *   (banker's rounding), stripping trailing fractional zeros and normalizing `-0` to `'0'`.
 *
 * @param {Iterable<string>} values - Iterable sequence of decimal strings (standard or scientific notation). Primitive strings are rejected.
 * @param {number} [precision=20] - Non-negative safe integer specifying the maximum number of fractional decimal places in the result.
 * @returns {string} Canonical decimal string representation of the product.
 * @throws {TypeError} If `values` is not a non-string iterable, an element is not a string, or `precision` is not a number.
 * @throws {RangeError} If `precision` is negative or not a safe integer, an element is not a valid decimal string, or an exponent/output length overflows.
 */
export function productDecimalLazy(values, precision = 20) {
	if (values == null || typeof values === 'string' || typeof values[Symbol.iterator] !== 'function') {
		throw new TypeError('Expected values to be a non-string iterable of decimal strings')
	}
	if (typeof precision !== 'number') {
		throw new TypeError(`Expected precision to be a number, received ${precision === null ? 'null' : typeof precision}`)
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`Expected precision to be a non-negative safe integer, received ${precision}`)
	}

	let result = { coeff: 1n, exp: 0 }
	for (const partial of runningProductStream(parseDecimalStream(values))) {
		result = partial
	}

	return formatDecimal(result, precision)
}
