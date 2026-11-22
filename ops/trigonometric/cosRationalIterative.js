/**
 * Computes the greatest common divisor of two non-negative BigInts iteratively.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
	while (b !== 0n) {
		const remainder = a % b
		a = b
		b = remainder
	}
	return a
}

/**
 * Returns the bit length of a non-negative BigInt (`0` for `0n`).
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	if (n === 0n) return 0
	return n.toString(2).length
}

/**
 * Reduces a rational `num / den` to lowest terms with `den > 0n`.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {{ num: bigint, den: bigint }} Reduced rational in lowest terms.
 */
function reduceRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const absNum = num < 0n ? -num : num
	const g = gcdBigInt(absNum, den)
	return { num: num / g, den: den / g }
}

/**
 * Iteratively computes `round(arctan(1 / invX) * scale)` via its Taylor series.
 *
 * @param {bigint} invX - Positive integer reciprocal argument (e.g. `5n` or `239n`).
 * @param {bigint} scale - Fixed-point scaling factor (`1n << bits`).
 * @returns {bigint} Scaled fixed-point approximation of `arctan(1 / invX)`.
 */
function arctanReciprocalScaled(invX, scale) {
	const invX2 = invX * invX
	let power = scale / invX
	let sum = power
	let k = 1n
	while (power !== 0n) {
		power /= invX2
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		if ((k & 1n) === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}
	return sum
}

/**
 * Iteratively computes `round(pi * 2^bits)` using Machin's formula:
 * `pi / 4 = 4 * arctan(1 / 5) - arctan(1 / 239)`.
 *
 * @param {number} bits - Target binary fractional precision bits.
 * @returns {bigint} Scaled fixed-point approximation of `pi`.
 */
function computePiScaled(bits) {
	const guardBits = 32
	const internalBits = bits + guardBits
	const scale = 1n << BigInt(internalBits)
	const piInternal =
		4n *
		(4n * arctanReciprocalScaled(5n, scale) -
			arctanReciprocalScaled(239n, scale))
	const halfGuard = 1n << BigInt(guardBits - 1)
	return (piInternal + halfGuard) >> BigInt(guardBits)
}

/**
 * Iteratively computes `remainder = dividend mod divisor` for non-negative BigInts
 * using binary shift-and-subtract range reduction.
 *
 * @param {bigint} dividend - Non-negative integer.
 * @param {bigint} divisor - Positive integer.
 * @returns {bigint} Non-negative remainder in `[0n, divisor - 1n]`.
 */
function iterativeMod(dividend, divisor) {
	let remainder = dividend
	if (remainder < divisor) {
		return remainder
	}
	let shift = 0n
	while ((divisor << (shift + 1n)) <= remainder) {
		shift += 1n
	}
	while (shift >= 0n) {
		const scaled = divisor << shift
		if (remainder >= scaled) {
			remainder -= scaled
		}
		shift -= 1n
	}
	return remainder
}

/**
 * Computes the cosine of an angle given as an exact rational number in radians,
 * returning a reduced rational `{ num: BigInt, den: BigInt }` in lowest terms
 * with `den > 0n`.
 *
 * Implementation overview:
 * 1. Validates `angle` and optional `options`.
 * 2. Returns exact `{ num: 1n, den: 1n }` when `angle.num === 0n`.
 * 3. Uses even symmetry `cos(-x) = cos(x)` and reduces the input fraction.
 * 4. Performs iterative range reduction modulo `2 * pi` (computed iteratively
 *    via Machin's formula with dynamic precision covering both angle magnitude
 *    and output precision) and folds the reduced angle into `[0, pi / 2]`.
 * 5. Evaluates the Taylor series `sum_{k>=0} (-1)^k * u^(2k) / (2k)!` iteratively
 *    in fixed-point BigInt arithmetic with guard bits, rounds to `precisionBits`,
 *    and reduces to lowest terms with `den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} angle - Rational angle in radians.
 * @param {{ precisionBits?: number }} [options] - Optional configuration.
 * @param {number} [options.precisionBits=128] - Binary precision bits for the
 *   returned rational approximation (positive safe integer `>= 1`).
 * @returns {{ num: bigint, den: bigint }} Reduced rational approximation of
 *   `cos(angle)` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `angle` is not an object with `bigint` `num` and `den`,
 *   or if `options` / `options.precisionBits` has an invalid type.
 * @throws {RangeError} If `angle.den === 0n` or `options.precisionBits` is not a
 *   positive safe integer `>= 1`.
 */
export function cosRationalIterative(angle, options = {}) {
	if (angle === null || typeof angle !== 'object' || Array.isArray(angle)) {
		throw new TypeError(
			'angle must be an object with bigint num and den properties'
		)
	}
	if (typeof angle.num !== 'bigint' || typeof angle.den !== 'bigint') {
		throw new TypeError('angle.num and angle.den must be BigInt values')
	}
	if (angle.den === 0n) {
		throw new RangeError('angle.den must not be zero')
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	let precisionBits = 128
	if (options.precisionBits !== undefined) {
		if (
			typeof options.precisionBits !== 'number' ||
			Number.isNaN(options.precisionBits)
		) {
			throw new TypeError('options.precisionBits must be a positive safe integer')
		}
		if (
			!Number.isSafeInteger(options.precisionBits) ||
			options.precisionBits < 1
		) {
			throw new RangeError(
				'options.precisionBits must be a positive safe integer >= 1'
			)
		}
		precisionBits = options.precisionBits
	}

	// Exact value for 0 radians: cos(0) = 1
	if (angle.num === 0n) {
		return { num: 1n, den: 1n }
	}

	// Even symmetry: cos(-x) = cos(x), and normalize the input fraction
	const rawAbsNum = angle.num < 0n ? -angle.num : angle.num
	const rawAbsDen = angle.den < 0n ? -angle.den : angle.den
	const inputGcd = gcdBigInt(rawAbsNum, rawAbsDen)
	const absNum = rawAbsNum / inputGcd
	const absDen = rawAbsDen / inputGcd

	const guardBits = 32
	const workBits = precisionBits + guardBits
	const workBitsBig = BigInt(workBits)
	const workScale = 1n << workBitsBig

	let uScaled
	let negate = false

	// Fast path when 0 < |angle| <= 3/2 < pi/2: already in first quadrant, no pi needed
	if (2n * absNum <= 3n * absDen) {
		uScaled = ((absNum << workBitsBig) + (absDen >> 1n)) / absDen
	} else {
		// Dynamic precision for pi so large angles retain full working precision after mod 2*pi
		const intPart = absNum / absDen
		const intBits = bitLength(intPart)
		const piBits = workBits + intBits + 32
		const piScaled = computePiScaled(piBits)

		// Common denominator is absDen * 2^(piBits + 1):
		//   quarterT = pi / 2, halfT = pi, fullT = 2 * pi
		const quarterT = piScaled * absDen
		const halfT = quarterT << 1n
		const fullT = quarterT << 2n
		const rInit = absNum << BigInt(piBits + 1)

		// Iterative range reduction modulo 2 * pi into [0, 2 * pi)
		let r = iterativeMod(rInit, fullT)

		// Fold [0, 2 * pi) -> [0, pi] using cos(2 * pi - u) = cos(u)
		if (r > halfT) {
			r = fullT - r
		}

		// Fold [0, pi] -> [0, pi / 2] using cos(pi - u) = -cos(u)
		if (r > quarterT) {
			r = halfT - r
			negate = true
		}

		// Scale reduced angle r from absDen * 2^(piBits + 1) to 2^workBits
		const shift = BigInt(piBits + 1 - workBits)
		const denom = absDen << shift
		uScaled = (r + (denom >> 1n)) / denom
	}

	// Iterative Taylor series for cos(u) on u in [0, pi / 2]
	const u2Scaled = (uScaled * uScaled + (workScale >> 1n)) >> workBitsBig
	let term = workScale
	let sum = workScale
	let k = 1n

	while (term !== 0n) {
		const denom = (2n * k - 1n) * (2n * k)
		term = (term * u2Scaled) / (workScale * denom)
		if (term === 0n) break
		if ((k & 1n) === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}

	// Clamp to mathematical range [0, 1] for u in [0, pi / 2] before applying sign
	if (sum < 0n) sum = 0n
	if (sum > workScale) sum = workScale

	// Round from workBits down to precisionBits
	const guardBig = BigInt(guardBits)
	const halfGuard = 1n << (guardBig - 1n)
	let rounded = (sum + halfGuard) >> guardBig
	if (negate) {
		rounded = -rounded
	}

	const outScale = 1n << BigInt(precisionBits)
	return reduceRational(rounded, outScale)
}
