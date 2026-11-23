const SCALE = 10n ** 18n
const BASE_GUARD_DIGITS = 24

/**
 * Computes exact rounded division `round(num / den)` for a positive BigInt divisor,
 * breaking half-way ties away from zero.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Strictly positive denominator.
 * @returns {bigint} Rounded quotient.
 */
function divRound(num, den) {
	const half = den >> 1n
	if (num >= 0n) {
		return (num + half) / den
	}
	return -((-num + half) / den)
}

/**
 * Recursive divide-and-conquer binary splitting for the Taylor series of sin(1):
 * sum_{k=a}^{b-1} (-1)^k / (2k + 1)! = P / (Q * (2a - 1)!), with (-1)! = 1.
 *
 * @param {number} a - Inclusive start term index.
 * @param {number} b - Exclusive end term index (b > a).
 * @returns {[bigint, bigint]} Pair `[P, Q]`.
 */
function binarySplitSin(a, b) {
	if (b - a === 1) {
		if (a === 0) {
			return [1n, 1n]
		}
		const p = (a & 1) === 0 ? 1n : -1n
		const twoA = BigInt(2 * a)
		const q = twoA * (twoA + 1n)
		return [p, q]
	}

	const mid = a + ((b - a) >> 1)
	const [pLeft, qLeft] = binarySplitSin(a, mid)
	const [pRight, qRight] = binarySplitSin(mid, b)
	return [pLeft * qRight + pRight, qLeft * qRight]
}

/**
 * Recursive divide-and-conquer binary splitting for the Taylor series of cos(1):
 * sum_{k=a}^{b-1} (-1)^k / (2k)! = P / (Q * (2a - 2)!), with (-2)! = 1.
 *
 * @param {number} a - Inclusive start term index.
 * @param {number} b - Exclusive end term index (b > a).
 * @returns {[bigint, bigint]} Pair `[P, Q]`.
 */
function binarySplitCos(a, b) {
	if (b - a === 1) {
		if (a === 0) {
			return [1n, 1n]
		}
		const p = (a & 1) === 0 ? 1n : -1n
		const twoA = BigInt(2 * a)
		const q = (twoA - 1n) * twoA
		return [p, q]
	}

	const mid = a + ((b - a) >> 1)
	const [pLeft, qLeft] = binarySplitCos(a, mid)
	const [pRight, qRight] = binarySplitCos(mid, b)
	return [pLeft * qRight + pRight, qLeft * qRight]
}

/**
 * Computes fixed-point `[sin(1), cos(1)]` scaled by `workScale` using binary splitting.
 *
 * @param {bigint} workScale - Fixed-point working scale (power of 10).
 * @returns {[bigint, bigint]} Pair `[sin1, cos1]` scaled by `workScale`.
 */
function computeUnitSinCos(workScale) {
	const threshold = 10n * workScale
	let terms = 1
	let fact = 1n
	while (fact <= threshold) {
		const twoK = BigInt(2 * terms)
		fact *= (twoK - 1n) * twoK
		terms += 1
	}

	const [pSin, qSin] = binarySplitSin(0, terms)
	const [pCos, qCos] = binarySplitCos(0, terms)

	return [divRound(pSin * workScale, qSin), divRound(pCos * workScale, qCos)]
}

/**
 * Recursive divide-and-conquer angle doubling (rotation exponentiation in SO(2))
 * computing `[sin(n), cos(n)]` scaled by `workScale` in O(log n) recursive calls.
 *
 * Uses:
 *   sin(2k)     = 2 * sin(k) * cos(k)
 *   cos(2k)     = cos(k)^2 - sin(k)^2
 *   sin(2k + 1) = sin(2k) * cos(1) + cos(2k) * sin(1)
 *   cos(2k + 1) = cos(2k) * cos(1) - sin(2k) * sin(1)
 *
 * @param {bigint} n - Non-negative integer angle in radians.
 * @param {bigint} sin1 - Fixed-point sin(1) scaled by `workScale`.
 * @param {bigint} cos1 - Fixed-point cos(1) scaled by `workScale`.
 * @param {bigint} workScale - Fixed-point working scale.
 * @returns {[bigint, bigint]} Pair `[sin(n), cos(n)]` scaled by `workScale`.
 */
function sinCosPow(n, sin1, cos1, workScale) {
	if (n === 0n) {
		return [0n, workScale]
	}
	if (n === 1n) {
		return [sin1, cos1]
	}

	const [s, c] = sinCosPow(n >> 1n, sin1, cos1, workScale)
	const s2 = divRound(2n * s * c, workScale)
	const c2 = divRound(c * c - s * s, workScale)

	if ((n & 1n) === 0n) {
		return [s2, c2]
	}

	const sOdd = divRound(s2 * cos1 + c2 * sin1, workScale)
	const cOdd = divRound(c2 * cos1 - s2 * sin1, workScale)
	return [sOdd, cOdd]
}

/**
 * Computes `round(sin(absX) * 10^18)` with guaranteed exact rounding by
 * recursively increasing guard precision if the value lies within the
 * error band of a half-way rounding boundary.
 *
 * @param {bigint} absX - Positive BigInt integer angle in radians.
 * @param {number} guardDigits - Extra decimal guard digits beyond `18 + digits(absX)`.
 * @returns {bigint} Fixed-point `round(sin(absX) * 10^18)`.
 */
function computeSinPositive(absX, guardDigits) {
	const xDigits = absX.toString().length
	const extraDigits = xDigits + guardDigits
	const guardScale = 10n ** BigInt(extraDigits)
	const workScale = SCALE * guardScale

	const [sin1, cos1] = computeUnitSinCos(workScale)
	const [sinWork] = sinCosPow(absX, sin1, cos1, workScale)

	const absSinWork = sinWork < 0n ? -sinWork : sinWork
	const rem = absSinWork % guardScale
	const half = guardScale >> 1n
	const distToHalf = rem >= half ? rem - half : half - rem

	// Error of sinCosPow(absX) is strictly bounded by 9 * absX + 10 ULPs at workScale.
	const errorBound = 10n * absX + 10n
	if (distToHalf <= errorBound) {
		return computeSinPositive(absX, guardDigits + BASE_GUARD_DIGITS)
	}

	return divRound(sinWork, guardScale)
}

/**
 * Computes the trigonometric sine `sin(x)` for an exact BigInt integer `x` (in radians),
 * returning a fixed-point BigInt scaled by `10^18` (rounded to the nearest integer).
 *
 * Uses a recursive divide-and-conquer algorithm:
 * 1. Binary splitting evaluates `sin(1)` and `cos(1)` to dynamically sized working precision.
 * 2. Recursive angle doubling (`sinCosPow`) computes `sin(|x|)` in `O(log |x|)` steps via
 *    exact rotation exponentiation on `e^(i * |x|) = (cos(1) + i * sin(1))^|x|`.
 * 3. Odd symmetry (`sin(-x) = -sin(x)`) handles negative inputs.
 *
 * @param {bigint} x - Exact BigInt integer angle in radians.
 * @returns {bigint} Fixed-point BigInt equal to `round(sin(x) * 10^18)`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function sinBigIntRecursive(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${x === null ? 'null' : typeof x}`)
	}

	if (x === 0n) {
		return 0n
	}

	if (x < 0n) {
		return -computeSinPositive(-x, BASE_GUARD_DIGITS)
	}

	return computeSinPositive(x, BASE_GUARD_DIGITS)
}
