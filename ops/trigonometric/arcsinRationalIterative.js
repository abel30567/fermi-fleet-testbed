/**
 * Computes arcsin(x) over exact rationals using a straightforward iterative
 * fixed-point BigInt algorithm.
 *
 * Input `x` is represented as `{ num: BigInt, den: BigInt }` with `den !== 0n`
 * and `-1 <= x <= 1`. Returns a reduced rational `{ num: BigInt, den: BigInt }`
 * in lowest terms with `den > 0n`, accurate to at least `precision` decimal
 * digits (default: 30).
 *
 * Strategy:
 * - Exact fast path: `arcsin(0) = 0/1`.
 * - Odd symmetry: `arcsin(-x) = -arcsin(x)` so computation reduces to `x in (0, 1]`.
 * - Endpoint `x = 1`: `arcsin(1) = pi / 2`, computed via Machin's formula
 *   `pi / 2 = 8 * atan(1/5) - 2 * atan(1/239)` using iterative Taylor sums.
 * - Inner range `0 < x <= 1/2`: direct iterative Maclaurin series
 *   `sum_{k>=0} ((2k)! / (4^k (k!)^2 (2k+1))) * x^(2k+1)`.
 * - Outer range `1/2 < x < 1`: exact argument reduction
 *   `arcsin(x) = pi / 2 - 2 * arcsin(sqrt((1 - x) / 2))`,
 *   where `y = sqrt((1 - x) / 2)` satisfies `0 < y < 1/2` and `y^2 = (1 - x) / 2`
 *   is computed directly from the exact rational to avoid cancellation near `|x| = 1`.
 */

const DEFAULT_PRECISION = 30

function absBigInt(n) {
	return n < 0n ? -n : n
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function isqrtBigInt(n) {
	if (n < 2n) return n
	const bitLen = BigInt(n.toString(2).length)
	let x = 1n << ((bitLen + 1n) >> 1n)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

function atanReciprocalScaled(m, scale) {
	const m2 = m * m
	let power = scale / m
	let sum = power
	let k = 1n
	let sign = -1n
	while (power > 0n) {
		power /= m2
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		sum += sign * term
		sign = -sign
		k += 1n
	}
	return sum
}

function piHalfScaled(scale) {
	// Machin's formula: pi / 4 = 4 * atan(1/5) - atan(1/239)
	return 8n * atanReciprocalScaled(5n, scale) - 2n * atanReciprocalScaled(239n, scale)
}

function arcsinSeriesScaled(uScaled, u2Num, u2Den) {
	let c = uScaled
	let sum = c
	let k = 1n
	while (c > 0n) {
		c = (c * (2n * k - 1n) * u2Num) / (2n * k * u2Den)
		if (c === 0n) break
		const term = c / (2n * k + 1n)
		if (term === 0n) break
		sum += term
		k += 1n
	}
	return sum
}

function parsePrecision(options) {
	if (options === undefined) {
		return DEFAULT_PRECISION
	}
	let precision
	if (typeof options === 'number') {
		precision = options
	} else if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
		precision = options.precision === undefined ? DEFAULT_PRECISION : options.precision
	} else {
		throw new TypeError('Options must be an object { precision?: number } or a positive integer')
	}
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a positive integer')
	}
	if (!Number.isInteger(precision) || precision < 1) {
		throw new RangeError('Precision must be a positive integer >= 1')
	}
	return precision
}

/**
 * Compute arcsin(x) for an exact rational `x` in `[-1, 1]`.
 *
 * @param {{ num: bigint, den: bigint }} x - Exact rational input in `[-1, 1]` with `den !== 0n`.
 * @param {number | { precision?: number }} [options] - Decimal digits of precision (default `30`).
 * @returns {{ num: bigint, den: bigint }} Reduced rational approximation in lowest terms with `den > 0n`.
 * @throws {TypeError} If `x` is not a `{ num: BigInt, den: BigInt }` object or `options` is invalid.
 * @throws {RangeError} If `x.den === 0n`, `|x| > 1`, or `precision < 1`.
 */
export function arcsinRationalIterative(x, options) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError('Input x must be a rational object { num: BigInt, den: BigInt }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Input x.num and x.den must be BigInts')
	}
	if (x.den === 0n) {
		throw new RangeError('Input denominator x.den must be non-zero')
	}

	const precision = parsePrecision(options)

	let num = x.num
	let den = x.den
	if (den < 0n) {
		num = -num
		den = -den
	}

	const absNum = absBigInt(num)
	if (absNum > den) {
		throw new RangeError('Input x is out of domain: expected -1 <= x <= 1')
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const gIn = gcdBigInt(absNum, den)
	const p = absNum / gIn
	const q = den / gIn

	const guardDigits = 16 + Math.ceil(Math.log10(precision + 10))
	const workDigits = precision + guardDigits
	const workScale = 10n ** BigInt(workDigits)
	const guardScale = 10n ** BigInt(guardDigits)
	const outScale = 10n ** BigInt(precision)

	let scaledAbs
	if (p === q) {
		scaledAbs = piHalfScaled(workScale)
	} else if (2n * p <= q) {
		const uScaled = (p * workScale) / q
		scaledAbs = arcsinSeriesScaled(uScaled, p * p, q * q)
	} else {
		let u2Num = q - p
		let u2Den = 2n * q
		if ((u2Num & 1n) === 0n) {
			u2Num >>= 1n
			u2Den >>= 1n
		}
		const yScaled = isqrtBigInt((u2Num * workScale * workScale) / u2Den)
		scaledAbs = piHalfScaled(workScale) - 2n * arcsinSeriesScaled(yScaled, u2Num, u2Den)
	}

	const roundedAbs = (scaledAbs + (guardScale >> 1n)) / guardScale
	if (roundedAbs === 0n) {
		return { num: 0n, den: 1n }
	}

	const gOut = gcdBigInt(roundedAbs, outScale)
	const outNum = roundedAbs / gOut
	const outDen = outScale / gOut

	return {
		num: num < 0n ? -outNum : outNum,
		den: outDen,
	}
}
