/**
 * @fileoverview Recursive divide-and-conquer IEEE-754 float64 square root.
 *
 * Computes the principal square root of a non-negative IEEE-754 double-precision
 * floating-point number using:
 * 1. Recursive exponent range reduction by exact powers of 4 into `[1, 4)`.
 * 2. Recursive divide-and-conquer binary search over the 52-bit significand in `[1, 2]`,
 *    evaluated with error-free Veltkamp/Dekker squaring (`twoProd`).
 * 3. Exact nearest-float64 rounding selection via Knuth's error-free sum (`twoSum`).
 *
 * Zero dependencies, pure ESM, no `Math.sqrt` / `Math.pow` / exponentiation operator.
 */

/** Veltkamp splitting constant for IEEE-754 float64: `2^27 + 1`. */
const SPLIT = 134217729

/** `2^-52`, the ULP spacing of IEEE-754 float64 numbers in `[1, 2)`. */
const ULP_ONE = 2.220446049250313e-16

/** Exact power-of-two constants for recursive range reduction. */
const POW2_512 = 1.3407807929942597e154
const POW2_NEG_512 = 7.458340731200207e-155
const POW2_256 = 1.157920892373162e77
const POW2_NEG_256 = 8.636168555094445e-78

/**
 * Table of exact power-of-4 scaling steps `(4^k, 2^k, 4^-k, 2^-k)` for
 * `k = 128, 64, 32, 16, 8, 4, 2, 1` (computed via exact repeated squaring).
 */
const SCALE_STEPS = (() => {
	const steps = []
	let half = 2
	let full = 4
	let invHalf = 0.5
	let invFull = 0.25
	for (let i = 0; i < 8; i += 1) {
		steps.push({ full, half, invFull, invHalf })
		half *= half
		full *= full
		invHalf *= invHalf
		invFull *= invFull
	}
	steps.reverse()
	return steps
})()

/**
 * Error-free squaring of a float64 in `[1, 2]` using Veltkamp splitting and Dekker's algorithm.
 * Returns `[hi, lo]` such that `hi + lo === a * a` exactly in real arithmetic.
 *
 * @param {number} a - Value in `[1, 2]`.
 * @returns {[number, number]} Exact sum representation `[hi, lo]` of `a * a`.
 */
function twoSquare(a) {
	const hi = a * a
	const c = SPLIT * a
	const aHi = c - (c - a)
	const aLo = a - aHi
	const lo = ((aHi * aHi - hi) + 2 * aHi * aLo) + aLo * aLo
	return [hi, lo]
}

/**
 * Knuth's error-free sum of two float64 values.
 * Returns `[s, e]` such that `s + e === a + b` exactly in real arithmetic.
 *
 * @param {number} a - First addend.
 * @param {number} b - Second addend.
 * @returns {[number, number]} Exact sum representation `[s, e]`.
 */
function twoSum(a, b) {
	const s = a + b
	const v = s - a
	const e = (a - (s - v)) + (b - v)
	return [s, e]
}

/**
 * Recursively bisects `[lo, hi]` inside `[1, 2]` to locate the adjacent IEEE-754 float64
 * bracket `[lo, hi]` satisfying `lo^2 <= m < hi^2`.
 *
 * Recursion depth is bounded by 53 (the IEEE-754 float64 significand width).
 *
 * @param {number} m - Normalized radicand in `[1, 4)`.
 * @param {number} lo - Lower bound in `[1, 2]`.
 * @param {number} hi - Upper bound in `[1, 2]`.
 * @returns {number} Correctly rounded IEEE-754 float64 square root of `m`.
 */
function bisectSqrt(m, lo, hi) {
	const mid = (lo + hi) * 0.5
	if (mid === lo || mid === hi) {
		// lo and hi are adjacent float64 values with lo^2 <= m < hi^2.
		// Choose the closer one by comparing m against (lo + ULP_ONE / 2)^2
		// = lo^2 + lo * ULP_ONE + (ULP_ONE / 2)^2.
		const [sHi, sLo] = twoSquare(lo)
		if (sHi === m && sLo === 0) {
			return lo
		}
		const d = m - sHi
		const [tHi, tLo] = twoSum(lo * ULP_ONE, sLo)
		if (d > tHi || (d === tHi && tLo < 0)) {
			return hi
		}
		return lo
	}

	const [sqHi, sqLo] = twoSquare(mid)
	if (sqHi === m && sqLo === 0) {
		return mid
	}
	if (sqHi < m || (sqHi === m && sqLo < 0)) {
		return bisectSqrt(m, mid, hi)
	}
	return bisectSqrt(m, lo, mid)
}

/**
 * Recursively reduces a radicand `x >= 4` (with `x < 2^512`) into `[1, 4)` by binary
 * halving of the power-of-4 exponent step, then multiplies the root by the exact power of 2.
 *
 * @param {number} x - Value in `[1, 2^512)`.
 * @param {number} idx - Index into `SCALE_STEPS`.
 * @returns {number} Square root of `x`.
 */
function scaleDownAndSqrt(x, idx) {
	if (idx === SCALE_STEPS.length) {
		return bisectSqrt(x, 1, 2)
	}
	const step = SCALE_STEPS[idx]
	if (x >= step.full) {
		return step.half * scaleDownAndSqrt(x * step.invFull, idx + 1)
	}
	return scaleDownAndSqrt(x, idx + 1)
}

/**
 * Recursively scales a radicand `x` in `[2^-512, 1)` up into `[1, 4)` by binary
 * halving of the power-of-4 exponent step, then scales the root back down by the exact power of 2.
 *
 * @param {number} x - Value in `[2^-512, 4)`.
 * @param {number} idx - Index into `SCALE_STEPS`.
 * @returns {number} Square root of `x`.
 */
function scaleUpAndSqrt(x, idx) {
	if (idx === SCALE_STEPS.length) {
		if (x < 1) {
			return 0.5 * bisectSqrt(x * 4, 1, 2)
		}
		return bisectSqrt(x, 1, 2)
	}
	const step = SCALE_STEPS[idx]
	if (x < step.invFull) {
		return step.invHalf * scaleUpAndSqrt(x * step.full, idx + 1)
	}
	return scaleUpAndSqrt(x, idx + 1)
}

/**
 * Recursively reduces any positive finite float64 into `[1, 4)` and computes its square root.
 *
 * @param {number} x - Positive finite float64 (`0 < x < Infinity`).
 * @returns {number} Square root of `x`.
 */
function sqrtPositiveRecursive(x) {
	if (x >= POW2_512) {
		return POW2_256 * sqrtPositiveRecursive(x * POW2_NEG_512)
	}
	if (x < POW2_NEG_512) {
		return POW2_NEG_256 * sqrtPositiveRecursive(x * POW2_512)
	}
	if (x >= 4) {
		return scaleDownAndSqrt(x, 0)
	}
	if (x < 1) {
		return scaleUpAndSqrt(x, 0)
	}
	return bisectSqrt(x, 1, 2)
}

/**
 * Computes the square root of a non-negative IEEE-754 float64 `Number` using a
 * recursive divide-and-conquer algorithm (recursive power-of-4 range reduction
 * followed by recursive significand bisection with exact Dekker rounding).
 *
 * Handles the full IEEE-754 float64 non-negative range including `+0`, `-0`
 * (sign-preserving), subnormals down to `Number.MIN_VALUE`, `Number.MAX_VALUE`,
 * and `+Infinity`.
 *
 * @param {number} x - A non-negative IEEE-754 float64 number (`x >= 0`).
 * @returns {number} The principal square root of `x` (preserving `-0` and `+Infinity`).
 * @throws {TypeError} If `x` is not of type `'number'`.
 * @throws {RangeError} If `x` is `NaN` or negative (including `-Infinity`).
 *
 * @example
 * sqrtFloatRecursive(9) // => 3
 * sqrtFloatRecursive(2) // => 1.4142135623730951
 * sqrtFloatRecursive(-0) // => -0
 */
export function sqrtFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${x === null ? 'null' : typeof x}`)
	}
	if (Number.isNaN(x)) {
		throw new RangeError('Input must not be NaN')
	}
	if (x < 0) {
		throw new RangeError(`Input must be non-negative, got ${x}`)
	}
	if (x === 0 || x === Infinity) {
		return x
	}
	return sqrtPositiveRecursive(x)
}
