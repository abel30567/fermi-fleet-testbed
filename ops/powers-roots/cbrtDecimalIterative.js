/**
 * Computes the cube root of an arbitrary-precision decimal string using an
 * iterative Newton-Raphson method over scaled BigInt arithmetic.
 *
 * Supports positive, zero, and negative decimal strings (including optional
 * leading signs and scientific notation such as `"1.25e-1"`). The result is
 * rounded half-away-from-zero to `precision` decimal places and formatted in
 * canonical decimal form (trailing fractional zeros trimmed, never `"-0"`).
 *
 * @param {string} value - Decimal string representation of the radicand.
 * @param {number} [precision=20] - Non-negative integer number of decimal places.
 * @returns {string} Canonical decimal string representation of `cbrt(value)`.
 * @throws {TypeError} If `value` is not a string or `precision` is not a number.
 * @throws {RangeError} If `value` is not a valid decimal string or `precision` is not a non-negative safe integer.
 */
export function cbrtDecimalIterative(value, precision = 20) {
	if (typeof value !== 'string') {
		throw new TypeError('value must be a decimal string')
	}
	if (typeof precision !== 'number' || Number.isNaN(precision)) {
		throw new TypeError('precision must be a non-negative safe integer')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	const parsed = parseDecimalString(value)
	if (parsed.digits === '') {
		return '0'
	}

	const { negative, digits, scale } = parsed
	const shift = 3 * precision - scale
	if (!Number.isSafeInteger(shift)) {
		throw new RangeError('value magnitude and precision exceed supported scale range')
	}

	const intVal = BigInt(digits)
	let q
	let shouldRoundUp

	if (shift >= 0) {
		const scaled = intVal * (10n ** BigInt(shift))
		q = integerCbrtNewton(scaled)
		const twoQPlusOne = 2n * q + 1n
		// Check whether cbrt(scaled) >= q + 0.5, i.e., 8 * scaled >= (2q + 1)^3.
		shouldRoundUp = 8n * scaled >= twoQPlusOne * twoQPlusOne * twoQPlusOne
	} else {
		const divisorExp = -shift
		// If 8 * intVal < 10^divisorExp, then intVal / 10^divisorExp < 0.125 = (0.5)^3,
		// so the rounded result is guaranteed to be 0.
		if (divisorExp > digits.length) {
			return '0'
		}
		const divisor = 10n ** BigInt(divisorExp)
		const scaledFloor = intVal / divisor
		q = integerCbrtNewton(scaledFloor)
		const twoQPlusOne = 2n * q + 1n
		// Check whether cbrt(intVal / 10^divisorExp) >= q + 0.5,
		// i.e., 8 * intVal >= (2q + 1)^3 * 10^divisorExp.
		shouldRoundUp = 8n * intVal >= twoQPlusOne * twoQPlusOne * twoQPlusOne * divisor
	}

	const rounded = shouldRoundUp ? q + 1n : q
	return formatScaledDecimal(rounded, precision, negative)
}

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Parses a decimal string into normalized `{ negative, digits, scale }` where
 * `|value| = BigInt(digits) * 10^(-scale)` and `digits` has no leading or
 * trailing zeros (or `""` if the value is zero).
 *
 * @param {string} raw
 * @returns {{ negative: boolean, digits: string, scale: number }}
 */
function parseDecimalString(raw) {
	const trimmed = raw.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${raw}"`)
	}

	const signStr = match[1]
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	const exp = expStr !== undefined ? Number(expStr) : 0
	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`Exponent out of supported range in "${raw}"`)
	}

	const rawDigits = intPart + fracPart
	const noLeading = rawDigits.replace(/^0+/, '')
	if (noLeading.length === 0) {
		return { negative: false, digits: '', scale: 0 }
	}

	const normalizedDigits = noLeading.replace(/0+$/, '')
	const trailingZeros = noLeading.length - normalizedDigits.length
	const scale = fracPart.length - exp - trailingZeros
	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`Scale out of supported range in "${raw}"`)
	}

	return {
		negative: signStr === '-',
		digits: normalizedDigits,
		scale,
	}
}

/**
 * Computes `floor(cbrt(n))` for a non-negative BigInt `n` via iterative
 * Newton-Raphson: `x_{k+1} = floor((2 * x_k + floor(n / x_k^2)) / 3)`.
 *
 * Starting from an upper bound `x0 = 2^ceil(bitLength(n) / 3) > cbrt(n)`,
 * the integer iterates decrease strictly until reaching `floor(cbrt(n))`.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} `floor(cbrt(n))`.
 */
function integerCbrtNewton(n) {
	if (n === 0n) {
		return 0n
	}

	const bitLen = n.toString(2).length
	let x = 1n << BigInt(Math.ceil(bitLen / 3))

	while (true) {
		const next = (2n * x + n / (x * x)) / 3n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Formats a non-negative scaled integer `scaled * 10^(-precision)` as a
 * canonical decimal string, trimming trailing fractional zeros and avoiding `"-0"`.
 *
 * @param {bigint} scaled
 * @param {number} precision
 * @param {boolean} negative
 * @returns {string}
 */
function formatScaledDecimal(scaled, precision, negative) {
	if (scaled === 0n) {
		return '0'
	}

	const sign = negative ? '-' : ''
	const digits = scaled.toString()

	if (precision === 0) {
		return `${sign}${digits}`
	}

	let intPart
	let fracPart
	if (digits.length <= precision) {
		intPart = '0'
		fracPart = digits.padStart(precision, '0')
	} else {
		const splitIndex = digits.length - precision
		intPart = digits.slice(0, splitIndex)
		fracPart = digits.slice(splitIndex)
	}

	fracPart = fracPart.replace(/0+$/, '')
	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}
