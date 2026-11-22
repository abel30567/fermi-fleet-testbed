/**
 * Fixed-point scale factor (10^18) representing 1.0 in exact BigInt arithmetic.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const REDUCTION_SHIFT_BITS = 16
const GUARD_BITS = 96

/**
 * Computes the bit length of a non-negative BigInt without Number overflow.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {number} Number of bits required to represent `n` (0 for 0n).
 */
function bitLength(n) {
	if (n === 0n) return 0
	const hex = n.toString(16)
	const topNibble = Number.parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + (32 - Math.clz32(topNibble))
}

/**
 * Computes the exact integer square root floor(sqrt(n)) via recursive
 * divide-and-conquer bit-halving Newton iteration.
 *
 * Because the half-width recursive estimate satisfies `0 <= sqrt(n) - s < 2^m`
 * with `s >= 2^h` and `2m <= h`, a single Newton refinement step yields either
 * `r` or `r + 1` where `r = floor(sqrt(n))`, requiring at most one adjustment.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact floor(sqrt(n)).
 */
function isqrtRecursive(n) {
	if (n < 16n) {
		if (n === 0n) return 0n
		if (n < 4n) return 1n
		if (n < 9n) return 2n
		return 3n
	}
	const bits = bitLength(n)
	const halfBits = (bits - 1) >> 1
	const shift = halfBits >> 1
	const estimate = isqrtRecursive(n >> BigInt(2 * shift)) << BigInt(shift)
	const refined = (estimate + n / estimate) >> 1n
	return refined * refined > n ? refined - 1n : refined
}

/**
 * Divide-and-conquer binary splitting evaluation of the rational series:
 *   sum_{k=a}^{b-1} (-1)^(k - a) / ((2k + 1) * q^(2*(k - a)))
 *
 * @param {number} a - Inclusive start term index.
 * @param {number} b - Exclusive end term index (b > a).
 * @param {bigint} q2 - Squared reciprocal denominator q^2.
 * @returns {{ num: bigint, den: bigint, vPow: bigint }}
 */
function atanReciprocalSplit(a, b, q2) {
	if (b - a === 1) {
		return {
			num: 1n,
			den: BigInt(2 * a + 1),
			vPow: q2,
		}
	}
	const mid = (a + b) >> 1
	const left = atanReciprocalSplit(a, mid, q2)
	const right = atanReciprocalSplit(mid, b, q2)
	const leftSign = ((mid - a) & 1) === 1 ? -1n : 1n
	return {
		num: left.num * left.vPow * right.den + leftSign * left.den * right.num,
		den: left.den * left.vPow * right.den,
		vPow: left.vPow * right.vPow,
	}
}

/**
 * Computes arctan(1 / q) * 2^bitPrecision using binary splitting.
 *
 * @param {number} q - Integer denominator (q > 1).
 * @param {number} bitPrecision - Fractional binary precision bits.
 * @returns {bigint} Fixed-point arctan(1 / q) scaled by 2^bitPrecision.
 */
function atanReciprocalFixed(q, bitPrecision) {
	const qBig = BigInt(q)
	const q2 = qBig * qBig
	const bitsPerTerm = 2 * Math.log2(q)
	const terms = Math.ceil((bitPrecision + 8) / bitsPerTerm) + 2
	const { num, den } = atanReciprocalSplit(0, terms, q2)
	const scaledNum = num << BigInt(bitPrecision)
	const totalDen = qBig * den
	return (scaledNum + (totalDen >> 1n)) / totalDen
}

/**
 * Computes pi * 2^bitPrecision using Machin's formula:
 *   pi = 16 * arctan(1/5) - 4 * arctan(1/239)
 * with divide-and-conquer binary splitting for each arctan series.
 *
 * @param {number} bitPrecision - Fractional binary precision bits.
 * @returns {bigint} Fixed-point pi scaled by 2^bitPrecision.
 */
function computePiFixed(bitPrecision) {
	return 16n * atanReciprocalFixed(5, bitPrecision) - 4n * atanReciprocalFixed(239, bitPrecision)
}

/**
 * Divide-and-conquer binary splitting evaluation of the Taylor series:
 *   sum_{k=a}^{b-1} (u / 2^shift)^(k - a) / (2k + 1)
 * where u = -t^2 and shift = 2 * bitPrecision.
 *
 * @param {number} a - Inclusive start term index.
 * @param {number} b - Exclusive end term index (b > a).
 * @param {bigint} u - Negative squared fixed-point argument (-t^2).
 * @param {number} shift - Bit shift per term (2 * bitPrecision).
 * @returns {{ num: bigint, den: bigint, uPow: bigint, vShift: bigint }}
 */
function atanSeriesSplit(a, b, u, shift) {
	if (b - a === 1) {
		return {
			num: 1n,
			den: BigInt(2 * a + 1),
			uPow: u,
			vShift: BigInt(shift),
		}
	}
	const mid = (a + b) >> 1
	const left = atanSeriesSplit(a, mid, u, shift)
	const right = atanSeriesSplit(mid, b, u, shift)
	return {
		num: ((left.num * right.den) << left.vShift) + left.den * left.uPow * right.num,
		den: (left.den * right.den) << left.vShift,
		uPow: left.uPow * right.uPow,
		vShift: left.vShift + right.vShift,
	}
}

/**
 * Recursively computes arctan(t / 2^bitPrecision) * 2^bitPrecision for
 * 0 <= t <= 2^bitPrecision using recursive half-angle argument reduction:
 *   arctan(t) = 2 * arctan(t / (1 + sqrt(1 + t^2)))
 * until t <= 2^(bitPrecision - REDUCTION_SHIFT_BITS), then evaluates the
 * rapidly converging Taylor series via divide-and-conquer binary splitting.
 *
 * @param {bigint} t - Non-negative fixed-point input scaled by 2^bitPrecision.
 * @param {number} bitPrecision - Fractional binary precision bits.
 * @returns {bigint} Fixed-point arctan(t / 2^bitPrecision) scaled by 2^bitPrecision.
 */
function atanFixedRecursive(t, bitPrecision) {
	if (t === 0n) return 0n
	const threshold = 1n << BigInt(bitPrecision - REDUCTION_SHIFT_BITS)
	if (t <= threshold) {
		const terms = Math.ceil((bitPrecision + 4) / (2 * REDUCTION_SHIFT_BITS)) + 1
		const { num, den } = atanSeriesSplit(0, terms, -(t * t), 2 * bitPrecision)
		return (t * num + (den >> 1n)) / den
	}
	const one = 1n << BigInt(bitPrecision)
	const oneSq = 1n << BigInt(2 * bitPrecision)
	const root = isqrtRecursive(oneSq + t * t)
	const tHalf = (t << BigInt(bitPrecision)) / (one + root)
	return 2n * atanFixedRecursive(tHalf, bitPrecision)
}

/**
 * Scales a non-negative binary fixed-point value (scaled by 2^bitPrecision)
 * to the target decimal/integer `scale` with round-half-up.
 *
 * @param {bigint} fixedVal - Non-negative value scaled by 2^bitPrecision.
 * @param {bigint} scale - Target fixed-point scale (> 0n).
 * @param {number} bitPrecision - Fractional binary precision bits.
 * @returns {bigint} Rounded fixed-point value scaled by `scale`.
 */
function rescaleRounded(fixedVal, scale, bitPrecision) {
	const half = 1n << BigInt(bitPrecision - 1)
	return (fixedVal * scale + half) >> BigInt(bitPrecision)
}

/**
 * Computes `arccos(x / scale)` in radians as a fixed-point BigInt scaled by `scale`
 * (default `SCALE = 10n ** 18n`), using exact BigInt arithmetic and genuinely
 * recursive / divide-and-conquer algorithms throughout.
 *
 * Algorithm:
 * 1. Validates domain `x in [-scale, scale]` and exact endpoints (`1 -> 0`, `0 -> pi/2`, `-1 -> pi`).
 * 2. Reduces negative inputs via symmetry `arccos(-u) = pi - arccos(u)`, where `pi` is
 *    computed at high internal binary guard precision (`bitLength(scale) + 96` bits) via
 *    Machin's formula and divide-and-conquer binary splitting.
 * 3. For `0 < x < scale`, uses the cancellation-free exact identity:
 *      `arccos(x / scale) = 2 * arctan(sqrt((scale - x) / (scale + x)))`
 *    computing the square root with recursive bit-halving Newton `isqrtRecursive`,
 *    reducing the argument recursively via `arctan(t) = 2 * arctan(t / (1 + sqrt(1 + t^2)))`,
 *    and evaluating the reduced series via divide-and-conquer binary splitting.
 * 4. Rescales once from internal guard precision to `scale` with half-up rounding.
 *
 * @param {bigint} x - Fixed-point input representing `x / scale`, must satisfy `-scale <= x <= scale`.
 * @param {bigint} [scale=SCALE] - Positive BigInt fixed-point scale factor (defaults to `10n ** 18n`).
 * @returns {bigint} Fixed-point `arccos(x / scale)` in `[0, round(pi * scale)]`, scaled by `scale`.
 * @throws {TypeError} If `x` or `scale` is not a `bigint`.
 * @throws {RangeError} If `scale <= 0n` or `x < -scale` or `x > scale`.
 */
export function arccosBigIntRecursive(x, scale = SCALE) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a bigint, got ${typeof x}`)
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`Expected scale to be a bigint, got ${typeof scale}`)
	}
	if (scale <= 0n) {
		throw new RangeError('Expected scale to be a positive bigint')
	}
	if (x < -scale || x > scale) {
		throw new RangeError('Input x out of domain: expected -scale <= x <= scale')
	}

	if (x === scale) {
		return 0n
	}

	const bitPrecision = bitLength(scale) + GUARD_BITS

	if (x === 0n) {
		const piFixed = computePiFixed(bitPrecision)
		return rescaleRounded(piFixed >> 1n, scale, bitPrecision)
	}

	if (x === -scale) {
		const piFixed = computePiFixed(bitPrecision)
		return rescaleRounded(piFixed, scale, bitPrecision)
	}

	const isNegative = x < 0n
	const absX = isNegative ? -x : x

	// arccos(absX / scale) = 2 * arctan(sqrt((scale - absX) / (scale + absX)))
	const num = scale - absX
	const den = scale + absX
	const ratioScaled = (num << BigInt(2 * bitPrecision)) / den
	const t = isqrtRecursive(ratioScaled)
	const arccosPosFixed = 2n * atanFixedRecursive(t, bitPrecision)

	const radFixed = isNegative
		? computePiFixed(bitPrecision) - arccosPosFixed
		: arccosPosFixed

	return rescaleRounded(radFixed, scale, bitPrecision)
}
