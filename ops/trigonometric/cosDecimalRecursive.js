/**
 * @fileoverview Arbitrary-precision trigonometric cosine over decimal strings
 * using BigInt and recursive divide-and-conquer algorithms:
 * - Recursive binary-splitting Chudnovsky algorithm for high-precision pi.
 * - High-precision range reduction modulo 2*pi and quadrant symmetry reduction.
 * - Recursive double-angle divide-and-conquer (`cos(2x) = 2*cos^2(x) - 1`).
 * - Recursive binary-splitting Taylor series at the base case.
 *
 * Zero external dependencies. ESM, Node 20+.
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const LOG10_2 = Math.log10(2)

// Chudnovsky constants
const CHUDNOVSKY_A = 13591409n
const CHUDNOVSKY_B = 545140134n
const CHUDNOVSKY_C3_OVER_24 = 10939058860032000n

// Cache for highest-precision pi computed so far: piCacheValue ≈ pi * 10^piCacheDigits
let piCacheDigits = 0
let piCacheValue = 0n

/**
 * Rounded BigInt division (round half away from zero).
 * Assumes den > 0n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRound(num, den) {
	if (num >= 0n) {
		return (num + (den >> 1n)) / den
	}
	return -((-num + (den >> 1n)) / den)
}

/**
 * Integer square root floor(sqrt(n)) for non-negative BigInt via Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
	if (n < 0n) {
		throw new RangeError('Square root of negative BigInt')
	}
	if (n < 2n) {
		return n
	}
	const bitLen = n.toString(2).length
	let x = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const y = (x + n / x) >> 1n
		if (y >= x) {
			return x
		}
		x = y
	}
}

/**
 * Recursive binary splitting for the Chudnovsky pi series over term indices [a, b).
 *
 * @param {number} a - Inclusive start index (a >= 1)
 * @param {number} b - Exclusive end index (b > a)
 * @returns {[bigint, bigint, bigint]} Tuple [P, Q, T]
 */
function chudnovskySplit(a, b) {
	if (b - a === 1) {
		const k = BigInt(a)
		const p = -(6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n)
		const q = k * k * k * CHUDNOVSKY_C3_OVER_24
		const t = p * (CHUDNOVSKY_A + CHUDNOVSKY_B * k)
		return [p, q, t]
	}
	const m = (a + b) >> 1
	const [p1, q1, t1] = chudnovskySplit(a, m)
	const [p2, q2, t2] = chudnovskySplit(m, b)
	return [p1 * p2, q1 * q2, t1 * q2 + p1 * t2]
}

/**
 * Compute round(pi * 10^digits) using recursive binary-splitting Chudnovsky.
 * Results are cached so subsequent calls requiring <= cached precision are O(1).
 *
 * @param {number} digits - Fractional decimal digits required (>= 1)
 * @returns {bigint}
 */
function getPiScaled(digits) {
	if (digits <= piCacheDigits) {
		if (digits === piCacheDigits) {
			return piCacheValue
		}
		return divRound(piCacheValue, 10n ** BigInt(piCacheDigits - digits))
	}

	const guard = 12
	const totalDigits = digits + guard
	const terms = Math.floor(totalDigits / 14) + 2

	let q = 1n
	let t = 0n
	if (terms > 1) {
		;[, q, t] = chudnovskySplit(1, terms)
	}

	const sqrt10005 = isqrt(10005n * 10n ** BigInt(2 * totalDigits))
	const piFull = (426880n * sqrt10005 * q) / (CHUDNOVSKY_A * q + t)

	piCacheDigits = totalDigits
	piCacheValue = piFull

	return divRound(piFull, 10n ** BigInt(guard))
}

/**
 * Validate and parse the radians input into its normalized unsigned decimal form:
 * |radians| = BigInt(digits) * 10^exponent.
 *
 * @param {string | number | bigint} radians
 * @returns {{ digits: string, exponent: number }}
 */
function parseRadians(radians) {
	let str
	if (typeof radians === 'string') {
		str = radians.trim()
	} else if (typeof radians === 'number') {
		if (!Number.isFinite(radians)) {
			throw new RangeError('radians must be a finite number or valid decimal string')
		}
		str = String(radians)
	} else if (typeof radians === 'bigint') {
		str = radians.toString()
	} else {
		throw new TypeError('radians must be a decimal string, finite number, or bigint')
	}

	if (str.length === 0 || !DECIMAL_PATTERN.test(str)) {
		throw new RangeError(`Invalid decimal string for radians: "${radians}"`)
	}

	// Strip optional sign (cosine is an even function: cos(-x) == cos(x))
	if (str[0] === '+' || str[0] === '-') {
		str = str.slice(1)
	}

	let mantissa = str
	let exp = 0
	const eIdx = str.search(/[eE]/)
	if (eIdx !== -1) {
		mantissa = str.slice(0, eIdx)
		exp = Number(str.slice(eIdx + 1))
		if (!Number.isSafeInteger(exp)) {
			throw new RangeError('Exponent in radians is out of safe integer range')
		}
	}

	const dotIdx = mantissa.indexOf('.')
	let rawDigits
	if (dotIdx !== -1) {
		const fracLen = mantissa.length - dotIdx - 1
		rawDigits = mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1)
		exp -= fracLen
	} else {
		rawDigits = mantissa
	}

	// Strip leading zeros
	const stripped = rawDigits.replace(/^0+/, '')
	if (stripped.length === 0) {
		return { digits: '0', exponent: 0 }
	}

	// Strip trailing zeros to keep BigInt compact
	let end = stripped.length
	while (end > 1 && stripped[end - 1] === '0') {
		end--
		exp++
	}

	if (!Number.isSafeInteger(exp)) {
		throw new RangeError('Normalized exponent in radians is out of safe integer range')
	}

	return { digits: stripped.slice(0, end), exponent: exp }
}

/**
 * Validate precision argument.
 *
 * @param {number} precision
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
}

/**
 * Recursive binary splitting for the cosine Taylor series terms k in [a, b):
 * sum_{k=a}^{b-1} (-1)^k * (p2 / q2)^k / (2k)!
 *
 * @param {number} a - Inclusive start term index (a >= 1)
 * @param {number} b - Exclusive end term index (b > a)
 * @param {bigint} p2 - Numerator squared (rNum^2)
 * @param {bigint} q2 - Denominator squared (rDen^2)
 * @returns {[bigint, bigint, bigint]} Tuple [P, Q, T]
 */
function taylorCosSplit(a, b, p2, q2) {
	if (b - a === 1) {
		const twoK = BigInt(2 * a)
		const p = -p2
		const q = q2 * (twoK - 1n) * twoK
		return [p, q, p]
	}
	const m = (a + b) >> 1
	const [p1, q1, t1] = taylorCosSplit(a, m, p2, q2)
	const [p2_, q2_, t2] = taylorCosSplit(m, b, p2, q2)
	return [p1 * p2_, q1 * q2_, t1 * q2_ + p1 * t2]
}

/**
 * Determine the number of Taylor terms N so that (u^(2N)) / (2N)! < 10^(-targetDigits)
 * for u = rNum / rDen < 1.
 *
 * @param {bigint} rNum
 * @param {bigint} rDen
 * @param {number} targetDigits
 * @returns {number}
 */
function chooseTaylorTerms(rNum, rDen, targetDigits) {
	const numBits = rNum.toString(2).length
	const denBits = rDen.toString(2).length
	// Strict upper bound: u < 2^(numBits - denBits + 1)
	const log10U = (numBits - denBits + 1) * LOG10_2

	let n = 1
	let log10Fact = 0
	while (true) {
		log10Fact += Math.log10(2 * n - 1) + Math.log10(2 * n)
		if (log10Fact - 2 * n * log10U > targetDigits) {
			return n
		}
		n++
	}
}

/**
 * Evaluate round(cos(rNum / rDen) * scale) using recursive binary splitting
 * of the Taylor series.
 *
 * @param {bigint} rNum - Non-negative numerator
 * @param {bigint} rDen - Positive denominator with rNum / rDen < 1
 * @param {bigint} scale - 10n ** BigInt(workDigits)
 * @param {number} targetDigits - Required decimal accuracy
 * @returns {bigint}
 */
function cosTaylorBinarySplit(rNum, rDen, scale, targetDigits) {
	if (rNum === 0n) {
		return scale
	}

	const numTerms = chooseTaylorTerms(rNum, rDen, targetDigits)
	if (numTerms <= 1) {
		return scale
	}

	const p2 = rNum * rNum
	const q2 = rDen * rDen
	const [, q, t] = taylorCosSplit(1, numTerms, p2, q2)

	// cos(u) ≈ 1 + T / Q = (Q + T) / Q
	return divRound((q + t) * scale, q)
}

/**
 * Recursively compute round(cos(rNum / rDen) * scale) by halving the angle
 * `depth` times (exact division via denominator doubling), evaluating the base
 * case via recursive binary-splitting Taylor series, and reconstructing with
 * the double-angle identity cos(2u) = 2*cos^2(u) - 1.
 *
 * @param {bigint} rNum
 * @param {bigint} rDen
 * @param {number} depth
 * @param {bigint} scale
 * @param {number} targetDigits
 * @returns {bigint}
 */
function cosDoubleAngleRecursive(rNum, rDen, depth, scale, targetDigits) {
	if (rNum === 0n) {
		return scale
	}
	if (depth === 0) {
		return cosTaylorBinarySplit(rNum, rDen, scale, targetDigits)
	}
	const halfCos = cosDoubleAngleRecursive(rNum, rDen << 1n, depth - 1, scale, targetDigits)
	return divRound(2n * halfCos * halfCos, scale) - scale
}

/**
 * Format a signed BigInt representing `value * 10^precision` as a decimal string
 * with exactly `precision` fractional digits (avoiding "-0").
 *
 * @param {bigint} scaledVal
 * @param {number} precision
 * @returns {string}
 */
function formatFixed(scaledVal, precision) {
	if (scaledVal === 0n) {
		return precision === 0 ? '0' : '0.' + '0'.repeat(precision)
	}
	const negative = scaledVal < 0n
	const absStr = (negative ? -scaledVal : scaledVal).toString()
	const signPrefix = negative ? '-' : ''

	if (precision === 0) {
		return signPrefix + absStr
	}

	const padded = absStr.padStart(precision + 1, '0')
	const intPart = padded.slice(0, padded.length - precision)
	const fracPart = padded.slice(padded.length - precision)
	return `${signPrefix}${intPart}.${fracPart}`
}

/**
 * Compute cos(radians) to `precision` decimal places using arbitrary-precision
 * BigInt arithmetic and recursive divide-and-conquer algorithms.
 *
 * Algorithm:
 * 1. Validate and normalize the input decimal string (exploiting evenness cos(-x) = cos(x)).
 * 2. Reduce |radians| modulo 2*pi into [0, pi/2] using pi computed via recursive
 *    binary-splitting Chudnovsky, tracking quadrant sign.
 * 3. Compute cos(r) via recursive double-angle halving (`cos(2u) = 2*cos^2(u) - 1`)
 *    down to a small base angle evaluated via recursive binary-splitting Taylor series.
 * 4. Adaptively increase guard digits if the result falls within an error margin
 *    of a decimal rounding midpoint.
 *
 * @param {string | number | bigint} radians - Angle in radians as a decimal string (or finite number/bigint).
 * @param {number} [precision=20] - Number of decimal digits after the decimal point (non-negative integer).
 * @returns {string} Decimal string representation of cos(radians) rounded to `precision` decimal places.
 * @throws {TypeError} If `radians` or `precision` has an invalid type.
 * @throws {RangeError} If `radians` is not a valid finite decimal value or `precision` is negative/non-integer.
 */
export function cosDecimalRecursive(radians, precision = 20) {
	validatePrecision(precision)
	const { digits, exponent } = parseRadians(radians)

	// Exact zero: cos(0) = 1
	if (digits === '0') {
		return formatFixed(10n ** BigInt(precision), precision)
	}

	const intDigits = digits.length + exponent

	// Fast path for tiny angles: |x| < 10^intDigits => 1 - cos(x) <= x^2 / 2 < 0.5 * 10^(2 * intDigits).
	// When 2 * intDigits < -precision, cos(x) unambiguously rounds to 1 at `precision` decimal places.
	if (2 * intDigits < -precision) {
		return formatFixed(10n ** BigInt(precision), precision)
	}

	const val = BigInt(digits)
	let guard = 24

	while (true) {
		// Depth of recursive double-angle halving: >= 3 ensures base angle u < (pi/2)/8 < 0.2
		const depth = Math.max(3, Math.min(64, Math.ceil(Math.sqrt(precision + guard))))
		// Each double-angle step can amplify ULP error by up to 4x (~0.602 decimal digits)
		const doublingGuard = Math.ceil(depth * 0.65) + 8
		const workDigits = precision + guard + doublingGuard
		const workScale = 10n ** BigInt(workDigits)

		let rWork
		let sign = 1n

		if (intDigits <= 0) {
			// |x| < 1 < pi/2: no pi range reduction needed
			const shift = exponent + workDigits
			if (shift >= 0) {
				rWork = val * 10n ** BigInt(shift)
			} else {
				rWork = divRound(val, 10n ** BigInt(-shift))
			}
		} else {
			// High-precision range reduction modulo 2*pi
			const piDigits = intDigits + workDigits + 10
			const piScaled = getPiScaled(piDigits)
			const twoPiScaled = piScaled << 1n

			const shift = exponent + piDigits
			let xScaled
			if (shift >= 0) {
				xScaled = val * 10n ** BigInt(shift)
			} else {
				xScaled = divRound(val, 10n ** BigInt(-shift))
			}

			let rScaled = xScaled % twoPiScaled
			// Reduce [0, 2*pi) -> [0, pi] using cos(2*pi - r) = cos(r)
			if (rScaled > piScaled) {
				rScaled = twoPiScaled - rScaled
			}
			// Reduce [0, pi] -> [0, pi/2] using cos(pi - r) = -cos(r)
			const halfPiScaled = piScaled >> 1n
			if (rScaled > halfPiScaled) {
				rScaled = piScaled - rScaled
				sign = -1n
			}

			rWork = divRound(rScaled, 10n ** BigInt(piDigits - workDigits))
		}

		const cosUnsigned = cosDoubleAngleRecursive(
			rWork,
			workScale,
			depth,
			workScale,
			workDigits + 4
		)
		const cosSigned = sign * cosUnsigned

		// Check if cosSigned is safely away from a rounding midpoint at `precision`
		const dropDigits = workDigits - precision
		const dropScale = 10n ** BigInt(dropDigits)
		const absSigned = cosSigned < 0n ? -cosSigned : cosSigned
		const rem = absSigned % dropScale
		const halfDrop = dropScale >> 1n
		const distToMid = rem >= halfDrop ? rem - halfDrop : halfDrop - rem
		const margin = 10n ** BigInt(Math.max(4, doublingGuard))

		if (rWork === 0n || distToMid > margin) {
			const rounded = divRound(cosSigned, dropScale)
			return formatFixed(rounded, precision)
		}

		// Near a rounding boundary: increase guard digits and recompute
		guard *= 2
	}
}
