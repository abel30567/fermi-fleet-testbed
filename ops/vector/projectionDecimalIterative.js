/**
 * Vector projection of `u` onto `v` (`((u · v) / (v · v)) * v`) over
 * arbitrary-precision decimal strings using a straightforward iterative
 * BigInt implementation.
 *
 * All intermediate dot products (`u · v`, `v · v`) and component numerators
 * (`(u · v) * v[i]`) are computed exactly in arbitrary-precision BigInt
 * decimal form before performing a single final division per component,
 * rounded to `precision` fractional decimal places using round-half-to-even
 * (banker's rounding).
 *
 * Zero external dependencies; ESM; Node 20+.
 */

const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const MAX_EXPONENT = 1_000_000

/**
 * Parse a decimal string into an exact normalized BigInt decimal `{ coeff, exp }`
 * representing `coeff * 10^exp`.
 *
 * @param {string} value
 * @param {string} label
 * @returns {{ coeff: bigint, exp: number }}
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}
	if (!DECIMAL_RE.test(value)) {
		throw new RangeError(`${label} is not a valid decimal string: "${value}"`)
	}

	let idx = 0
	let negative = false
	if (value[0] === '-') {
		negative = true
		idx = 1
	} else if (value[0] === '+') {
		idx = 1
	}

	const unsigned = value.slice(idx)
	const ePos = unsigned.search(/[eE]/)
	const mantissa = ePos === -1 ? unsigned : unsigned.slice(0, ePos)
	let exp = 0
	if (ePos !== -1) {
		exp = Number(unsigned.slice(ePos + 1))
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
			throw new RangeError(`${label} exponent out of supported range`)
		}
	}

	const dotPos = mantissa.indexOf('.')
	let digits
	if (dotPos === -1) {
		digits = mantissa
	} else {
		const intPart = mantissa.slice(0, dotPos)
		const fracPart = mantissa.slice(dotPos + 1)
		digits = intPart + fracPart
		exp -= fracPart.length
	}

	// Strip leading zeros
	digits = digits.replace(/^0+/, '')
	if (digits.length === 0) {
		return { coeff: 0n, exp: 0 }
	}

	// Strip trailing zeros to keep BigInt coefficients compact
	const trimmed = digits.replace(/0+$/, '')
	exp += digits.length - trimmed.length

	if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
		throw new RangeError(`${label} exponent out of supported range`)
	}

	const coeff = negative ? -BigInt(trimmed) : BigInt(trimmed)
	return { coeff, exp }
}

/**
 * Multiply two exact BigInt decimals.
 *
 * @param {{ coeff: bigint, exp: number }} a
 * @param {{ coeff: bigint, exp: number }} b
 * @returns {{ coeff: bigint, exp: number }}
 */
function mulDecimal(a, b) {
	if (a.coeff === 0n || b.coeff === 0n) {
		return { coeff: 0n, exp: 0 }
	}
	return { coeff: a.coeff * b.coeff, exp: a.exp + b.exp }
}

/**
 * Add two exact BigInt decimals.
 *
 * @param {{ coeff: bigint, exp: number }} a
 * @param {{ coeff: bigint, exp: number }} b
 * @returns {{ coeff: bigint, exp: number }}
 */
function addDecimal(a, b) {
	if (a.coeff === 0n) return b
	if (b.coeff === 0n) return a

	let coeff
	let exp
	if (a.exp === b.exp) {
		coeff = a.coeff + b.coeff
		exp = a.exp
	} else if (a.exp > b.exp) {
		coeff = a.coeff * 10n ** BigInt(a.exp - b.exp) + b.coeff
		exp = b.exp
	} else {
		coeff = a.coeff + b.coeff * 10n ** BigInt(b.exp - a.exp)
		exp = a.exp
	}

	if (coeff === 0n) {
		return { coeff: 0n, exp: 0 }
	}
	return { coeff, exp }
}

/**
 * Divide signed BigInt `num` by positive BigInt `den`, rounding to the nearest
 * integer using round-half-to-even (banker's rounding).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfEven(num, den) {
	if (num === 0n) return 0n
	const negative = num < 0n
	const absNum = negative ? -num : num
	let q = absNum / den
	const r = absNum % den
	const twiceR = r * 2n
	if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) {
		q += 1n
	}
	return negative ? -q : q
}

/**
 * Format a scaled BigInt `value * 10^(-precision)` into a canonical decimal
 * string with trailing fractional zeros removed and no negative zero.
 *
 * @param {bigint} scaled
 * @param {number} precision
 * @returns {string}
 */
function formatScaledDecimal(scaled, precision) {
	if (scaled === 0n) return '0'

	const negative = scaled < 0n
	const digits = (negative ? -scaled : scaled).toString()
	const sign = negative ? '-' : ''

	if (precision === 0) {
		return sign + digits
	}

	let intPart
	let fracPart
	if (digits.length <= precision) {
		intPart = '0'
		fracPart = digits.padStart(precision, '0')
	} else {
		const split = digits.length - precision
		intPart = digits.slice(0, split)
		fracPart = digits.slice(split)
	}

	const trimmedFrac = fracPart.replace(/0+$/, '')
	if (trimmedFrac.length === 0) {
		return sign + intPart
	}
	return `${sign}${intPart}.${trimmedFrac}`
}

/**
 * Compute the vector projection of `u` onto `v`:
 *
 *     proj_v(u) = ((u · v) / (v · v)) * v
 *
 * over arbitrary-precision decimal strings using an iterative BigInt algorithm.
 *
 * Each output component is rounded to `precision` fractional decimal places
 * using round-half-to-even, with trailing fractional zeros omitted.
 *
 * @param {string[]} u - Source vector of decimal strings (non-empty).
 * @param {string[]} v - Target vector of decimal strings (same length as `u`, non-zero).
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal places.
 * @returns {string[]} Projected vector as canonical decimal strings.
 * @throws {TypeError} If `u` or `v` is not an array, an element is not a string, or `precision` is not a number.
 * @throws {RangeError} If vectors are empty, have mismatched lengths, contain invalid decimals, `v` is the zero vector, or `precision` is not a non-negative integer.
 */
export function projectionDecimalIterative(u, v, precision = 20) {
	if (!Array.isArray(u)) {
		throw new TypeError('u must be an array of decimal strings')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array of decimal strings')
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative integer')
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Input vectors must be non-empty')
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Vector length mismatch: u has length ${u.length}, v has length ${v.length}`
		)
	}

	const n = u.length
	const uDec = new Array(n)
	const vDec = new Array(n)

	for (let i = 0; i < n; i++) {
		uDec[i] = parseDecimal(u[i], `u[${i}]`)
		vDec[i] = parseDecimal(v[i], `v[${i}]`)
	}

	let dotUV = { coeff: 0n, exp: 0 }
	let dotVV = { coeff: 0n, exp: 0 }

	for (let i = 0; i < n; i++) {
		dotUV = addDecimal(dotUV, mulDecimal(uDec[i], vDec[i]))
		dotVV = addDecimal(dotVV, mulDecimal(vDec[i], vDec[i]))
	}

	if (dotVV.coeff === 0n) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const result = new Array(n)
	if (dotUV.coeff === 0n) {
		for (let i = 0; i < n; i++) {
			result[i] = '0'
		}
		return result
	}

	for (let i = 0; i < n; i++) {
		const num = mulDecimal(dotUV, vDec[i])
		if (num.coeff === 0n) {
			result[i] = '0'
			continue
		}

		const shift = num.exp - dotVV.exp + precision
		let scaledNum
		let scaledDen
		if (shift >= 0) {
			scaledNum = num.coeff * 10n ** BigInt(shift)
			scaledDen = dotVV.coeff
		} else {
			scaledNum = num.coeff
			scaledDen = dotVV.coeff * 10n ** BigInt(-shift)
		}

		const rounded = divRoundHalfEven(scaledNum, scaledDen)
		result[i] = formatScaledDecimal(rounded, precision)
	}

	return result
}
