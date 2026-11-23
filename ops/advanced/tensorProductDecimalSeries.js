const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_PRECISION = 100_000
const MAX_EXPONENT = 100_000
const MAX_SCALE = 250_000

/**
 * Parses and validates an arbitrary-precision decimal string into an exact
 * scaled-BigInt representation `coeff * 10^(-scale)`.
 *
 * @param {string} value
 * @param {string} label
 * @returns {{ coeff: bigint, scale: number }}
 */
function parseDecimalString(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string or nested array of decimal strings`)
	}

	const match = DECIMAL_PATTERN.exec(value)
	if (!match) {
		throw new RangeError(`${label} contains an invalid decimal string: ${JSON.stringify(value)}`)
	}

	const sign = match[1] === '-' ? -1n : 1n
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	let exp = 0
	if (expStr !== undefined) {
		exp = Number(expStr)
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
			throw new RangeError(`${label} has an exponent out of supported range: ${JSON.stringify(value)}`)
		}
	}

	const rawDigits = (intPart + fracPart).replace(/^0+/, '')
	if (rawDigits.length === 0) {
		return { coeff: 0n, scale: 0 }
	}

	const trimmedDigits = rawDigits.replace(/0+$/, '')
	const trailingZeros = rawDigits.length - trimmedDigits.length
	const scale = fracPart.length - exp - trailingZeros

	if (!Number.isSafeInteger(scale) || Math.abs(scale) > MAX_SCALE) {
		throw new RangeError(`${label} has a scale out of supported range: ${JSON.stringify(value)}`)
	}

	return {
		coeff: sign * BigInt(trimmedDigits),
		scale,
	}
}

/**
 * Validates and parses a scalar or rectangular nested-array tensor of decimal strings.
 *
 * @param {unknown} input
 * @param {string} label
 * @param {Set<object>} seen
 * @returns {{ kind: 'scalar', value: { coeff: bigint, scale: number }, shape: number[] } | { kind: 'array', items: Array<object>, shape: number[] }}
 */
function parseTensor(input, label, seen) {
	if (typeof input === 'string') {
		return {
			kind: 'scalar',
			value: parseDecimalString(input, label),
			shape: [],
		}
	}

	if (!Array.isArray(input)) {
		throw new TypeError(`${label} must be a decimal string or nested array of decimal strings`)
	}

	if (seen.has(input)) {
		throw new TypeError(`${label} contains a circular array reference`)
	}

	seen.add(input)
	try {
		const items = new Array(input.length)
		let expectedSubShape = null

		for (let i = 0; i < input.length; i++) {
			if (!(i in input)) {
				throw new TypeError(`${label} must not contain sparse array holes`)
			}

			const child = parseTensor(input[i], `${label}[${i}]`, seen)
			if (expectedSubShape === null) {
				expectedSubShape = child.shape
			} else if (
				child.shape.length !== expectedSubShape.length ||
				child.shape.some((dim, idx) => dim !== expectedSubShape[idx])
			) {
				throw new RangeError(`${label} must be a rectangular tensor (ragged dimensions detected)`)
			}
			items[i] = child
		}

		return {
			kind: 'array',
			items,
			shape: [input.length, ...(expectedSubShape ?? [])],
		}
	} finally {
		seen.delete(input)
	}
}

/**
 * Formats an exact scaled-BigInt product rounded to `precision` fractional
 * decimal places using round-half-to-even (banker's rounding), stripping
 * redundant trailing fractional zeros and normalizing `-0` to `"0"`.
 *
 * @param {bigint} coeff
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function roundAndFormatDecimal(coeff, scale, precision) {
	if (coeff === 0n) {
		return '0'
	}

	const negative = coeff < 0n
	let absCoeff = negative ? -coeff : coeff
	let effectiveScale = scale

	if (effectiveScale > precision) {
		const shift = effectiveScale - precision
		const digitCount = absCoeff.toString().length
		if (shift > digitCount) {
			return '0'
		}

		const divisor = 10n ** BigInt(shift)
		let quotient = absCoeff / divisor
		const remainder = absCoeff % divisor
		const twiceRemainder = remainder * 2n

		if (twiceRemainder > divisor || (twiceRemainder === divisor && (quotient & 1n) === 1n)) {
			quotient += 1n
		}

		if (quotient === 0n) {
			return '0'
		}

		absCoeff = quotient
		effectiveScale = precision
	}

	const signPrefix = negative ? '-' : ''
	if (effectiveScale <= 0) {
		return signPrefix + absCoeff.toString() + '0'.repeat(-effectiveScale)
	}

	const digits = absCoeff.toString()
	let intPart
	let fracPart

	if (digits.length <= effectiveScale) {
		intPart = '0'
		fracPart = '0'.repeat(effectiveScale - digits.length) + digits
	} else {
		const splitIndex = digits.length - effectiveScale
		intPart = digits.slice(0, splitIndex)
		fracPart = digits.slice(splitIndex)
	}

	fracPart = fracPart.replace(/0+$/, '')
	if (fracPart.length === 0) {
		return signPrefix + intPart
	}

	return `${signPrefix}${intPart}.${fracPart}`
}

/**
 * Multiplies two parsed arbitrary-precision decimals and rounds to `precision`
 * fractional digits.
 *
 * @param {{ coeff: bigint, scale: number }} x
 * @param {{ coeff: bigint, scale: number }} y
 * @param {number} precision
 * @returns {string}
 */
function multiplyDecimals(x, y, precision) {
	if (x.coeff === 0n || y.coeff === 0n) {
		return '0'
	}
	return roundAndFormatDecimal(x.coeff * y.coeff, x.scale + y.scale, precision)
}

/**
 * Evaluates the closed-form recursive multilinear tensor product identity:
 * - Scalar x Scalar: `a * b`
 * - Array x Tensor:  `(A ⊗ B)[i] = A[i] ⊗ B`
 * - Scalar x Array:  `(a ⊗ B)[j] = a ⊗ B[j]`
 *
 * @param {{ kind: 'scalar', value: { coeff: bigint, scale: number } } | { kind: 'array', items: Array<object> }} left
 * @param {{ kind: 'scalar', value: { coeff: bigint, scale: number } } | { kind: 'array', items: Array<object> }} right
 * @param {number} precision
 * @returns {string | Array<any>}
 */
function computeTensorProduct(left, right, precision) {
	if (left.kind === 'array') {
		return left.items.map((item) => computeTensorProduct(item, right, precision))
	}
	if (right.kind === 'array') {
		return right.items.map((item) => computeTensorProduct(left, item, precision))
	}
	return multiplyDecimals(left.value, right.value, precision)
}

/**
 * Computes the arbitrary-precision tensor product (outer product) `A ⊗ B` of two
 * tensors represented as arbitrary-precision decimal strings (rank-0 scalars or
 * rectangular nested arrays of any rank) using the exact closed-form multilinear
 * identity `(A ⊗ B)[i_1,...,i_m,j_1,...,j_n] = A[i_1,...,i_m] * B[j_1,...,j_n]`.
 *
 * Each product entry is computed exactly in scaled `BigInt` decimal arithmetic and
 * then rounded to at most `precision` fractional decimal places using
 * round-half-to-even (banker's rounding), with canonical formatting (no trailing
 * fractional zeros and `-0` normalized to `"0"`).
 *
 * @param {string | Array<any>} a Left tensor operand (decimal string or rectangular nested array of decimal strings).
 * @param {string | Array<any>} b Right tensor operand (decimal string or rectangular nested array of decimal strings).
 * @param {number} [precision=20] Maximum number of fractional decimal places (`0 <= precision <= 100000`, integer).
 * @returns {string | Array<any>} Resulting tensor of shape `[...shape(a), ...shape(b)]` containing canonical decimal strings.
 * @throws {TypeError} If `a` or `b` contains non-string/non-array values, sparse holes, circular references, or if `precision` is not a number.
 * @throws {RangeError} If any decimal string is malformed, has an out-of-range exponent/scale, if `a` or `b` is ragged, or if `precision` is not a valid non-negative integer within range.
 * @example
 * tensorProductDecimalSeries(['0.1', '0.2'], ['0.3', '0.4'], 10)
 * // => [['0.03', '0.04'], ['0.06', '0.08']]
 */
export function tensorProductDecimalSeries(a, b, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_PRECISION}`)
	}

	const parsedA = parseTensor(a, 'a', new Set())
	const parsedB = parseTensor(b, 'b', new Set())

	return computeTensorProduct(parsedA, parsedB, precision)
}
