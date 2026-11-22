/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Computes the greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Normalizes a rational number { num, den } to lowest terms with den > 0n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Iteratively computes fixed-point arctan(1 / invX) * scale using its Taylor series.
 *
 * @param {bigint} invX
 * @param {bigint} scale
 * @returns {bigint}
 */
function arctanReciprocalFixed(invX, scale) {
	const invXSq = invX * invX
	let power = scale / invX
	let sum = power
	let sign = -1n
	for (let k = 3n; ; k += 2n) {
		power /= invXSq
		if (power === 0n) break
		const term = power / k
		if (term === 0n) break
		sum += sign * term
		sign = -sign
	}
	return sum
}

/**
 * Computes a rational approximation of pi accurate to the requested number of
 * decimal digits using Machin's formula: pi = 16*arctan(1/5) - 4*arctan(1/239).
 *
 * @param {number} digits
 * @returns {{ num: bigint, den: bigint }}
 */
function computePiRational(digits) {
	const guard = 10
	const workScale = 10n ** BigInt(digits + guard)
	const guardScale = 10n ** BigInt(guard)

	const atan1_5 = arctanReciprocalFixed(5n, workScale)
	const atan1_239 = arctanReciprocalFixed(239n, workScale)
	const piScaled = 16n * atan1_5 - 4n * atan1_239
	const num = (piScaled + guardScale / 2n) / guardScale
	const den = 10n ** BigInt(digits)
	return normalizeRational(num, den)
}

/**
 * Iteratively reduces a non-negative rational angle (num / den) modulo pi
 * into the principal interval (-pi/2, pi/2].
 *
 * @param {bigint} num - Positive numerator in lowest terms
 * @param {bigint} den - Positive denominator in lowest terms
 * @param {number} terms - Number of Taylor series terms (used to size pi precision)
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceAngleModPi(num, den, terms) {
	// Fast path: 1.57 < pi/2, so no range reduction is needed.
	if (num * 100n < den * 157n) {
		return { num, den }
	}

	const intPart = num / den
	const intDigits = intPart === 0n ? 0 : intPart.toString().length
	const piDigits = Math.max(40, terms * 3) + intDigits + 5
	const pi = computePiRational(piDigits)

	// Scale both angle and pi to the common denominator (2 * den * pi.den)
	// so halfPi is represented exactly as pi.num * den.
	const commonDen = 2n * den * pi.den
	let rScaled = num * 2n * pi.den
	const piScaled = pi.num * 2n * den
	const halfPiScaled = pi.num * den

	// Still inside (-pi/2, pi/2]: return the exact unreduced input.
	if (rScaled <= halfPiScaled) {
		return { num, den }
	}

	// Iterative binary-doubling reduction mod pi into (-pi/2, pi/2].
	while (rScaled > halfPiScaled) {
		let step = piScaled
		while (rScaled - (step << 1n) > halfPiScaled) {
			step <<= 1n
		}
		rScaled -= step
	}

	return normalizeRational(rScaled, commonDen)
}

/**
 * Computes the trigonometric tangent tan(x) for an exact rational angle x (in radians),
 * represented as `{ num: BigInt, den: BigInt }`, returning a reduced rational in lowest
 * terms with `den > 0n`.
 *
 * Uses exact 0 for 0, odd symmetry tan(-x) = -tan(x), iterative range reduction modulo pi
 * into (-pi/2, pi/2], and iterative Horner evaluation of the sin(r) and cos(r) Taylor
 * series over exact BigInt rationals.
 *
 * @param {{ num: bigint, den: bigint }} x - Angle in radians as an exact rational.
 * @param {number} [terms=15] - Number of Taylor series terms for sin and cos (positive integer).
 * @returns {{ num: bigint, den: bigint }} Reduced rational approximation of tan(x) with `den > 0n`.
 * @throws {TypeError} If `x` is not an object with BigInt `num` and `den`, or `terms` is not an integer.
 * @throws {RangeError} If `x.den === 0n`, `terms < 1`, or cosine evaluates to 0.
 */
export function tanRationalIterative(x, terms = 15) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('Angle x must be an object with BigInt properties { num, den }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Angle x must have BigInt properties num and den')
	}
	if (x.den === 0n) {
		throw new RangeError('Angle denominator cannot be zero')
	}
	if (typeof terms !== 'number' || !Number.isInteger(terms)) {
		throw new TypeError('terms must be an integer')
	}
	if (terms < 1) {
		throw new RangeError('terms must be at least 1')
	}

	const normalized = normalizeRational(x.num, x.den)
	if (normalized.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const sign = normalized.num < 0n ? -1n : 1n
	const absNum = sign < 0n ? -normalized.num : normalized.num

	const reduced = reduceAngleModPi(absNum, normalized.den, terms)
	if (reduced.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const p = reduced.num
	const q = reduced.den
	const p2 = p * p
	const q2 = q * q

	// Iterative Horner evaluation of sin(p/q) = sum_{k=0}^{terms-1} (-1)^k (p/q)^(2k+1) / (2k+1)!
	// Denominator after loop is (2*terms - 1)! * q^(2*terms - 1).
	let sinNum = 1n
	let sinDen = 1n
	for (let k = terms - 1; k >= 1; k--) {
		const factor = q2 * BigInt(2 * k) * BigInt(2 * k + 1)
		sinNum = factor * sinDen - p2 * sinNum
		sinDen = factor * sinDen
	}
	sinNum = p * sinNum

	// Iterative Horner evaluation of cos(p/q) = sum_{k=0}^{terms-1} (-1)^k (p/q)^(2k) / (2k)!
	// Denominator after loop is (2*terms - 2)! * q^(2*terms - 2).
	let cosNum = 1n
	let cosDen = 1n
	for (let k = terms - 1; k >= 1; k--) {
		const factor = q2 * BigInt(2 * k - 1) * BigInt(2 * k)
		cosNum = factor * cosDen - p2 * cosNum
		cosDen = factor * cosDen
	}

	if (cosNum === 0n) {
		throw new RangeError('Tangent is undefined: cosine evaluated to zero')
	}

	// Since sinDen / cosDen === (2 * terms - 1) * q exactly, the shared
	// (2*terms - 2)! * q^(2*terms - 2) factor cancels analytically.
	const tanNum = sign * sinNum
	const tanDen = BigInt(2 * terms - 1) * q * cosNum

	return normalizeRational(tanNum, tanDen)
}
