/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Reduce a rational number `num / den` to lowest terms with a strictly
 * positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
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
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Compute `floor(arctan(1 / m) * scale)` iteratively using the Taylor series
 * `sum_{k>=0} (-1)^k / ((2k + 1) * m^(2k + 1))`.
 *
 * @param {bigint} m - Integer reciprocal argument (`m >= 2n`).
 * @param {bigint} scale - Fixed-point scaling factor.
 * @returns {bigint}
 */
function arctanReciprocalScaled(m, scale) {
	const m2 = m * m
	let term = scale / m
	let sum = term
	let k = 1n
	while (term > 0n) {
		term = term / m2
		k += 2n
		const contrib = term / k
		if (contrib === 0n) {
			break
		}
		if ((k & 2n) === 2n) {
			sum -= contrib
		} else {
			sum += contrib
		}
	}
	return sum
}

/**
 * Compute `floor(pi * 2^bits)` iteratively via Machin's formula:
 * `pi / 4 = 4 * arctan(1/5) - arctan(1/239)`.
 *
 * @param {bigint} bits - Binary fractional precision bits (`bits >= 1n`).
 * @returns {bigint}
 */
function piBinaryScaled(bits) {
	const guard = 32n
	const scale = 1n << (bits + guard)
	const piWithGuard =
		16n * arctanReciprocalScaled(5n, scale) -
		4n * arctanReciprocalScaled(239n, scale)
	return piWithGuard >> guard
}

/**
 * Compute `sin(x)` for an exact rational angle `x` in radians using an
 * iterative range reduction modulo `2 * pi` (with quadrant folding into
 * `[0, pi / 2]`) followed by an iterative Taylor series evaluation.
 *
 * Returns an exact reduced rational `{ num: bigint, den: bigint }` in lowest
 * terms with `den > 0n`. For `x = 0`, returns exact `{ num: 0n, den: 1n }`.
 * Odd symmetry `sin(-x) = -sin(x)` is preserved identically.
 *
 * @param {{ num: bigint, den: bigint }} angle - Angle in radians as a rational object.
 * @param {number} [terms=15] - Positive integer number of Taylor series terms to evaluate.
 * @returns {{ num: bigint, den: bigint }} Reduced rational approximation of `sin(angle)` with `den > 0n`.
 * @throws {TypeError} If `angle` is not an object with `bigint` `num` and `den`, or `terms` is not a number.
 * @throws {RangeError} If `angle.den === 0n` or `terms` is not a positive safe integer.
 */
export function sinRationalIterative(angle, terms = 15) {
	if (angle === null || typeof angle !== 'object' || Array.isArray(angle)) {
		throw new TypeError('angle must be a rational object { num: bigint, den: bigint }')
	}
	if (typeof angle.num !== 'bigint' || typeof angle.den !== 'bigint') {
		throw new TypeError('angle.num and angle.den must be BigInt values')
	}
	if (angle.den === 0n) {
		throw new RangeError('angle.den must be non-zero')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer')
	}

	const normalized = normalizeRational(angle.num, angle.den)
	if (normalized.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Preserve exact odd symmetry: sin(-x) = -sin(x).
	let negate = normalized.num < 0n
	let p = negate ? -normalized.num : normalized.num
	let q = normalized.den

	// If angle exceeds 3/2 (safely below pi/2), check against pi/2 and reduce
	// iteratively modulo 2*pi, then fold into [0, pi/2].
	if (2n * p > 3n * q) {
		const intPart = p / q
		const extraBits = intPart > 0n ? BigInt(intPart.toString(2).length) : 0n
		const baseBits = BigInt(Math.max(128, terms * 10))
		const bits = baseBits + extraBits

		const piNum = piBinaryScaled(bits)
		const piDen = 1n << bits

		// Compare x = p/q against pi/2 = piNum / (2 * piDen) before modifying x,
		// so angles in (3/2, pi/2] avoid introducing pi approximation denominators.
		if (2n * p * piDen > q * piNum) {
			// Work on common denominator 2 * q * piDen so pi/2 is an exact integer.
			const commonDen = 2n * q * piDen
			let xScaled = 2n * p * piDen
			const halfPiScaled = piNum * q
			const piScaled = halfPiScaled << 1n
			const threeHalfPiScaled = halfPiScaled * 3n
			const twoPiScaled = piScaled << 1n

			// Iterative binary range reduction modulo 2*pi into [0, 2*pi).
			if (xScaled >= twoPiScaled) {
				let step = twoPiScaled
				while ((step << 1n) <= xScaled) {
					step <<= 1n
				}
				while (step >= twoPiScaled) {
					if (xScaled >= step) {
						xScaled -= step
					}
					step >>= 1n
				}
			}

			// Quadrant folding into [0, pi/2].
			let uScaled
			if (xScaled <= halfPiScaled) {
				uScaled = xScaled
			} else if (xScaled <= piScaled) {
				uScaled = piScaled - xScaled
			} else if (xScaled <= threeHalfPiScaled) {
				uScaled = xScaled - piScaled
				negate = !negate
			} else {
				uScaled = twoPiScaled - xScaled
				negate = !negate
			}

			if (uScaled === 0n) {
				return { num: 0n, den: 1n }
			}

			const reduced = normalizeRational(uScaled, commonDen)
			p = reduced.num
			q = reduced.den
		}
	}

	// Iterative Horner evaluation of the Taylor polynomial:
	// sin(u) ≈ sum_{k=0}^{terms-1} (-1)^k * u^(2k+1) / (2k+1)!
	const p2 = p * p
	const q2 = q * q
	let accNum = 1n
	let accDen = 1n
	for (let k = BigInt(terms - 1); k >= 1n; k -= 1n) {
		const factor = 2n * k * (2n * k + 1n)
		const nextDen = accDen * q2 * factor
		accNum = nextDen - accNum * p2
		accDen = nextDen
	}

	let resNum = accNum * p
	const resDen = accDen * q
	if (negate) {
		resNum = -resNum
	}

	return normalizeRational(resNum, resDen)
}
