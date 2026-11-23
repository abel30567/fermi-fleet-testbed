/**
 * @fileoverview Numerically robust interval cube root with guaranteed outward rounding.
 *
 * Implements {@link cbrtIntervalStable} over closed real intervals `[lo, hi]` using:
 * - Exact power-of-8 exponent reduction (`x = m * 2^(3k)`, `m in [1, 8)`) so subnormals
 *   and extreme exponents never overflow or underflow intermediate computations.
 * - Error-free transformations (Veltkamp-Dekker `twoProd`, Knuth `twoSum`, and Shewchuk
 *   non-overlapping floating-point expansion) to evaluate the exact mathematical sign of
 *   `y^3 - m` without any rounding error.
 * - Compensated Newton refinement followed by exact ULP certification, guaranteeing the
 *   tightest representable IEEE-754 binary64 outward enclosure `[outLo, outHi]` such that
 *   `outLo <= lo^(1/3)` and `hi^(1/3) <= outHi`.
 */

const SPLIT_FACTOR = 134217729 // 2^27 + 1 (Veltkamp split constant for binary64)
const MIN_NORMAL = 2.2250738585072014e-308 // 2^-1022
const SUBNORMAL_SCALE = 18014398509481984 // 2^54 = (2^18)^3
const SUBNORMAL_K_OFFSET = -18
const MANTISSA_MASK = 0x000fffffffffffffn
const EXP_MASK = 0x7ffn
const EXP_BIAS = 1023

const scratchBuf = new ArrayBuffer(8)
const scratchView = new DataView(scratchBuf)

/**
 * Reinterprets an IEEE-754 binary64 number as its unsigned 64-bit bit pattern.
 * @param {number} x
 * @returns {bigint}
 */
function floatToBits(x) {
	scratchView.setFloat64(0, x, false)
	return scratchView.getBigUint64(0, false)
}

/**
 * Reinterprets an unsigned 64-bit bit pattern as an IEEE-754 binary64 number.
 * @param {bigint} bits
 * @returns {number}
 */
function bitsToFloat(bits) {
	scratchView.setBigUint64(0, bits, false)
	return scratchView.getFloat64(0, false)
}

/**
 * Returns the next representable binary64 value strictly greater than a positive finite `x`.
 * @param {number} x - Positive finite number.
 * @returns {number}
 */
function nextUpPositive(x) {
	return bitsToFloat(floatToBits(x) + 1n)
}

/**
 * Returns the next representable binary64 value strictly less than a positive finite `x`.
 * @param {number} x - Positive finite number.
 * @returns {number}
 */
function nextDownPositive(x) {
	return bitsToFloat(floatToBits(x) - 1n)
}

/**
 * Knuth's error-free transformation for floating-point addition: `s + err === a + b` exactly.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b
	const bv = s - a
	const av = s - bv
	const br = b - bv
	const ar = a - av
	return [s, ar + br]
}

/**
 * Dekker's error-free transformation for floating-point multiplication: `p + err === a * b`
 * exactly for normal operands well away from overflow/underflow.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
	const p = a * b
	const ca = SPLIT_FACTOR * a
	const ahi = ca - (ca - a)
	const alo = a - ahi
	const cb = SPLIT_FACTOR * b
	const bhi = cb - (cb - b)
	const blo = b - bhi
	const err = ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo
	return [p, err]
}

/**
 * Shewchuk's Grow-Expansion: adds scalar `b` to a non-overlapping expansion `e`,
 * returning a non-overlapping expansion whose exact sum equals `sum(e) + b` and
 * whose final element carries the exact mathematical sign of the sum.
 * @param {number[]} e - Non-overlapping expansion (least to most significant).
 * @param {number} b
 * @returns {number[]}
 */
function growExpansion(e, b) {
	let q = b
	/** @type {number[]} */
	const h = []
	for (let i = 0; i < e.length; i++) {
		const [s, err] = twoSum(q, e[i])
		q = s
		if (err !== 0) {
			h.push(err)
		}
	}
	if (q !== 0 || h.length === 0) {
		h.push(q)
	}
	return h
}

/**
 * Evaluates the exact floating-point expansion of `y^3 - m` for `y in [1, 2]` and `m in [1, 8)`.
 * All intermediate products lie in `{0} U [2^-156, 8]`, completely free of overflow and underflow.
 * @param {number} y
 * @param {number} m
 * @returns {number[]} Exact non-overlapping expansion of `y^3 - m`.
 */
function cubeResidualExpansion(y, m) {
	const [p, e1] = twoProd(y, y) // y^2 = p + e1 exactly
	const [q, e2] = twoProd(p, y) // p * y = q + e2 exactly
	const [r, e3] = twoProd(e1, y) // e1 * y = r + e3 exactly

	// y^3 - m = q - m + e2 + r + e3 (exact)
	let exp = [q]
	exp = growExpansion(exp, -m)
	exp = growExpansion(exp, e2)
	exp = growExpansion(exp, r)
	exp = growExpansion(exp, e3)
	return exp
}

/**
 * Returns the exact mathematical sign (-1, 0, or 1) of `y^3 - m` for `y in [1, 2]`, `m in [1, 8)`.
 * @param {number} y
 * @param {number} m
 * @returns {-1 | 0 | 1}
 */
function compareCube(y, m) {
	const exp = cubeResidualExpansion(y, m)
	const msb = exp[exp.length - 1]
	if (msb < 0) return -1
	if (msb > 0) return 1
	return 0
}

/**
 * Computes the tightest outward-rounded cube root enclosure `[lo, hi]` for a positive finite `x`.
 * Guarantees `lo^3 <= x <= hi^3` in exact real arithmetic, with either `lo === hi` (exact cube)
 * or `hi === nextUp(lo)` (adjacent binary64 floats).
 * @param {number} x - Positive finite number (`0 < x < Infinity`).
 * @returns {[number, number]}
 */
function cbrtPositiveEnclosure(x) {
	// Exact power-of-8 scaling: x = m * 2^(3 * totalK) with m in [1, 8).
	let xScaled = x
	let kOffset = 0
	if (xScaled < MIN_NORMAL) {
		xScaled *= SUBNORMAL_SCALE
		kOffset = SUBNORMAL_K_OFFSET
	}

	const bits = floatToBits(xScaled)
	const biasedExp = Number((bits >> 52n) & EXP_MASK)
	const e = biasedExp - EXP_BIAS
	const k = Math.floor(e / 3)
	const r = e - 3 * k // r in {0, 1, 2}
	const totalK = k + kOffset

	const mBits = (bits & MANTISSA_MASK) | (BigInt(EXP_BIAS + r) << 52n)
	const m = bitsToFloat(mBits)

	// Initial approximation in [1, 2] plus one compensated Newton step using the exact residual.
	let y = Math.cbrt(m)
	if (y < 1) y = 1
	if (y > 2) y = 2

	const residualExp = cubeResidualExpansion(y, m)
	const residual = residualExp[residualExp.length - 1]
	if (residual !== 0) {
		const refined = y - residual / (3 * y * y)
		if (refined >= 1 && refined <= 2) {
			y = refined
		}
	}

	// Certify and step to the exact bracketing binary64 pair in [1, 2].
	let yLo = y
	let yHi = y
	const cmp = compareCube(y, m)

	if (cmp < 0) {
		let next = nextUpPositive(yLo)
		let nextCmp = compareCube(next, m)
		while (nextCmp < 0) {
			yLo = next
			next = nextUpPositive(yLo)
			nextCmp = compareCube(next, m)
		}
		if (nextCmp === 0) {
			yLo = next
			yHi = next
		} else {
			yHi = next
		}
	} else if (cmp > 0) {
		let prev = nextDownPositive(yHi)
		let prevCmp = compareCube(prev, m)
		while (prevCmp > 0) {
			yHi = prev
			prev = nextDownPositive(yHi)
			prevCmp = compareCube(prev, m)
		}
		if (prevCmp === 0) {
			yLo = prev
			yHi = prev
		} else {
			yLo = prev
		}
	}

	// Exact scaling by 2^totalK (totalK in [-358, 341], always normal binary64).
	const scale = bitsToFloat(BigInt(EXP_BIAS + totalK) << 52n)
	return [yLo * scale, yHi * scale]
}

/**
 * Computes the tightest binary64 lower bound `<= x^(1/3)`.
 * @param {number} x
 * @returns {number}
 */
function cbrtDown(x) {
	if (x === 0) return 0
	if (!Number.isFinite(x)) return x
	if (x > 0) return cbrtPositiveEnclosure(x)[0]
	return -cbrtPositiveEnclosure(-x)[1]
}

/**
 * Computes the tightest binary64 upper bound `>= x^(1/3)`.
 * @param {number} x
 * @returns {number}
 */
function cbrtUp(x) {
	if (x === 0) return 0
	if (!Number.isFinite(x)) return x
	if (x > 0) return cbrtPositiveEnclosure(x)[1]
	return -cbrtPositiveEnclosure(-x)[0]
}

/**
 * Computes the cube root of a closed real interval `[lo, hi]` with outward rounding,
 * guaranteeing exact mathematical enclosure:
 *
 *   For every real `x` with `lo <= x <= hi`, `outLo <= x^(1/3) <= outHi`.
 *
 * Uses exact power-of-8 exponent scaling, compensated Newton refinement, and Shewchuk
 * non-overlapping floating-point expansion arithmetic to certify the tightest
 * representable IEEE-754 binary64 bounds across the full floating-point range
 * (including subnormals, negative intervals, and infinite bounds).
 *
 * @param {[number, number]} interval - Closed interval `[lo, hi]` with `lo <= hi`.
 * @returns {[number, number]} Outward-rounded enclosure `[outLo, outHi]` of `cbrt([lo, hi])`.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either bound is `NaN` or if `lo > hi`.
 */
export function cbrtIntervalStable(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('interval must be a 2-element array [lo, hi]')
	}

	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError('interval bounds must be numbers')
	}
	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError('interval bounds must not be NaN')
	}
	if (lo > hi) {
		throw new RangeError(`invalid interval: lower bound (${lo}) exceeds upper bound (${hi})`)
	}

	// Point interval fast path avoids computing the enclosure twice.
	if (lo === hi) {
		if (lo === 0) return [0, 0]
		if (!Number.isFinite(lo)) return [lo, hi]
		if (lo > 0) return cbrtPositiveEnclosure(lo)
		const [posLo, posHi] = cbrtPositiveEnclosure(-lo)
		return [-posHi, -posLo]
	}

	return [cbrtDown(lo), cbrtUp(hi)]
}
