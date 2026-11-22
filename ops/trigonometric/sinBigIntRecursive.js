/**
 * Fixed-point scale factor (10^18) used for the returned sine value.
 * A return value of `y` represents the real number `y / SCALE`.
 */
export const SCALE = 10n ** 18n

const INTERNAL_GUARD_DIGITS = 32
const INTERNAL_SCALE = 10n ** BigInt(INTERNAL_GUARD_DIGITS)
const TAYLOR_TERMS = 20
const CHUDNOVSKY_DIGITS_PER_TERM = 14.181647462725477
const CHUDNOVSKY_A = 13591409n
const CHUDNOVSKY_B = 545140134n
const CHUDNOVSKY_C3_OVER_24 = 10939058860032000n
const MAX_CACHED_PI_DIGITS = 2048

let cachedPiDigits = 0
let cachedPiValue = 0n

/**
 * Symmetric round-half-away-from-zero division of `num / den` for `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function roundDiv(num, den) {
	if (num === 0n) return 0n
	const negative = num < 0n
	const absNum = negative ? -num : num
	const quotient = absNum / den
	const remainder = absNum % den
	const rounded = (remainder << 1n) >= den ? quotient + 1n : quotient
	return negative ? -rounded : rounded
}

/**
 * Recursive Newton-Raphson integer square root returning `floor(sqrt(n))` for `n >= 0n`.
 * Recursion depth is O(log log n) because Newton's method quadratically converges.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrtRecursive(n) {
	if (n < 2n) return n
	const bitLen = n.toString(2).length
	const initialGuess = 1n << BigInt((bitLen + 1) >> 1)

	function refine(guess) {
		const next = (guess + n / guess) >> 1n
		if (next >= guess) return guess
		return refine(next)
	}

	return refine(initialGuess)
}

/**
 * Divide-and-conquer binary splitting for the Chudnovsky series over `[a, b)`.
 * Computes exact integers `(P, Q, T)` such that `T / Q` is the partial sum for terms `a..b-1`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {{ P: bigint, Q: bigint, T: bigint }}
 */
function chudnovskyBinarySplit(a, b) {
	if (b - a === 1) {
		if (a === 0) {
			return { P: 1n, Q: 1n, T: CHUDNOVSKY_A }
		}
		const k = BigInt(a)
		const P = -(6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n)
		const Q = k * k * k * CHUDNOVSKY_C3_OVER_24
		const T = P * (CHUDNOVSKY_A + CHUDNOVSKY_B * k)
		return { P, Q, T }
	}

	const mid = (a + b) >> 1
	const left = chudnovskyBinarySplit(a, mid)
	const right = chudnovskyBinarySplit(mid, b)

	return {
		P: left.P * right.P,
		Q: left.Q * right.Q,
		T: left.T * right.Q + left.P * right.T,
	}
}

/**
 * Computes `round(pi * 10^digits)` using recursive Chudnovsky binary splitting
 * and recursive Newton integer square root.
 *
 * @param {number} digits
 * @returns {bigint}
 */
function computePiScaled(digits) {
	if (cachedPiDigits >= digits) {
		if (cachedPiDigits === digits) return cachedPiValue
		return roundDiv(cachedPiValue, 10n ** BigInt(cachedPiDigits - digits))
	}

	const targetDigits = digits < 64 ? 64 : digits
	const extraGuard = 10
	const workDigits = targetDigits + extraGuard
	const terms = Math.ceil(workDigits / CHUDNOVSKY_DIGITS_PER_TERM) + 2

	const { Q, T } = chudnovskyBinarySplit(0, terms)
	const scaleWork = 10n ** BigInt(workDigits)
	const sqrt10005 = isqrtRecursive(10005n * scaleWork * scaleWork)
	const piWork = (426880n * sqrt10005 * Q) / T
	const piTarget = roundDiv(piWork, 10n ** BigInt(extraGuard))

	if (targetDigits <= MAX_CACHED_PI_DIGITS) {
		cachedPiDigits = targetDigits
		cachedPiValue = piTarget
	}

	if (targetDigits === digits) return piTarget
	return roundDiv(piTarget, 10n ** BigInt(targetDigits - digits))
}

/**
 * Divide-and-conquer binary splitting for the Maclaurin series of `sin(p / q)`:
 *   sin(p / q) = sum_{k=0}^{N-1} (-1)^k * (p / q)^(2k + 1) / (2k + 1)!
 *
 * Returns exact BigInts `(P, Q, T)` over `[a, b)` where `T / Q` equals the exact
 * rational sum of terms `a..b-1` (when called from `a = 0`).
 *
 * @param {number} a
 * @param {number} b
 * @param {bigint} p
 * @param {bigint} q
 * @param {bigint} p2
 * @param {bigint} q2
 * @returns {{ P: bigint, Q: bigint, T: bigint }}
 */
function binarySplitSin(a, b, p, q, p2, q2) {
	if (b - a === 1) {
		if (a === 0) {
			return { P: p, Q: q, T: p }
		}
		const j = BigInt(a)
		const P = -p2
		const Q = q2 * (2n * j) * (2n * j + 1n)
		return { P, Q, T: P }
	}

	const mid = (a + b) >> 1
	const left = binarySplitSin(a, mid, p, q, p2, q2)
	const right = binarySplitSin(mid, b, p, q, p2, q2)

	return {
		P: left.P * right.P,
		Q: left.Q * right.Q,
		T: left.T * right.Q + left.P * right.T,
	}
}

/**
 * Computes the trigonometric sine of an exact BigInt angle (in radians) using
 * recursive divide-and-conquer algorithms over exact BigInt arithmetic, returning
 * a fixed-point BigInt scaled by `SCALE` (`10n ** 18n`).
 *
 * By default (`inputScale = 1n`), `x` is interpreted as an exact integer number
 * of radians and the result is `round(sin(x) * 10^18)`. When an optional positive
 * BigInt `inputScale` is supplied, `x` represents the exact rational angle
 * `x / inputScale` radians (for example, `inputScale = SCALE` for fixed-point
 * radian inputs).
 *
 * Algorithm:
 * 1. Symmetry reduction (`sin(-theta) = -sin(theta)`).
 * 2. High-precision dynamic `pi` computation via recursive Chudnovsky binary
 *    splitting and recursive Newton-Raphson `isqrt`, sized to the magnitude of
 *    `|x / inputScale|` plus internal guard digits so range reduction modulo `2*pi`
 *    remains accurate even for very large BigInt inputs.
 * 3. Quadrant folding into `[0, pi / 2]`.
 * 4. Divide-and-conquer binary splitting of the Maclaurin series for `sin(r)`
 *    using exact rational BigInt arithmetic with 32 internal guard digits,
 *    followed by a single symmetric round-half-away-from-zero division to `10^18`.
 *
 * @param {bigint} x - Exact BigInt angle numerator (radians when `inputScale === 1n`).
 * @param {bigint} [inputScale=1n] - Optional positive BigInt denominator for rational/fixed-point radians.
 * @returns {bigint} Fixed-point BigInt equal to `round(sin(x / inputScale) * 10^18)`.
 * @throws {TypeError} If `x` or `inputScale` is not a BigInt.
 * @throws {RangeError} If `inputScale` is less than or equal to `0n`.
 */
export function sinBigIntRecursive(x, inputScale = 1n) {
	if (typeof x !== 'bigint') {
		throw new TypeError('Expected x to be a BigInt')
	}
	if (typeof inputScale !== 'bigint') {
		throw new TypeError('Expected inputScale to be a BigInt')
	}
	if (inputScale <= 0n) {
		throw new RangeError('Expected inputScale to be a positive BigInt')
	}

	if (x === 0n) return 0n

	let sign = 1n
	let absX = x
	if (absX < 0n) {
		sign = -1n
		absX = -absX
	}

	// Determine dynamic precision needed for exact range reduction modulo 2*pi
	const intPart = absX / inputScale
	const intDigits = intPart === 0n ? 0 : intPart.toString().length
	const piDigits = intDigits + INTERNAL_GUARD_DIGITS + 6

	const piD = computePiScaled(piDigits)
	const piScaledFull = piD * inputScale
	const twoPiScaledFull = piScaledFull << 1n

	// Exact reduction: r = (absX / inputScale) mod (2 * pi), scaled by inputScale * 10^piDigits
	let reduced = (absX * (10n ** BigInt(piDigits))) % twoPiScaledFull

	// Fold [0, 2*pi) -> [0, pi)
	if (reduced >= piScaledFull) {
		reduced -= piScaledFull
		sign = -sign
	}

	// Fold [0, pi) -> [0, pi/2]
	if ((reduced << 1n) > piScaledFull) {
		reduced = piScaledFull - reduced
	}

	if (reduced === 0n) return 0n

	// Downscale reduced angle to fixed internal guard precision (10^32)
	const downscaleFactor = inputScale * (10n ** BigInt(piDigits - INTERNAL_GUARD_DIGITS))
	const p = roundDiv(reduced, downscaleFactor)
	if (p === 0n) return 0n

	const q = INTERNAL_SCALE
	const p2 = p * p
	const q2 = q * q

	// Exact rational Maclaurin sum via divide-and-conquer binary splitting
	const { Q, T } = binarySplitSin(0, TAYLOR_TERMS, p, q, p2, q2)
	const magnitude = roundDiv(T * SCALE, Q)

	return sign < 0n ? -magnitude : magnitude
}
