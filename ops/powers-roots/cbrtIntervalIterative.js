/**
 * Interval cube root with guaranteed outward rounding.
 *
 * Computes an enclosing IEEE-754 binary64 interval `[outLo, outHi]` such that
 * for every real number `x` in `[lo, hi]`, `outLo <= cbrt(x) <= outHi`.
 *
 * Uses exact binary64 exponent scaling into `[1, 8)`, straightforward iterative
 * Newton-Raphson refinement, and exact BigInt cube comparisons to round the
 * lower bound toward `-Infinity` and the upper bound toward `+Infinity`.
 */

const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

/**
 * Return the raw IEEE-754 binary64 bit pattern of a number as an unsigned 64-bit BigInt.
 *
 * @param {number} x
 * @returns {bigint}
 */
function floatToBits(x) {
	f64View[0] = x
	return u64View[0]
}

/**
 * Reconstruct a binary64 number from its unsigned 64-bit IEEE-754 bit pattern.
 *
 * @param {bigint} bits
 * @returns {number}
 */
function bitsToFloat(bits) {
	u64View[0] = bits
	return f64View[0]
}

/**
 * Return the smallest representable binary64 number strictly greater than `x` (for finite `x > 0`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUpPositive(x) {
	return bitsToFloat(floatToBits(x) + 1n)
}

/**
 * Return the largest representable binary64 number strictly less than `x` (for finite `x > 0`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDownPositive(x) {
	return bitsToFloat(floatToBits(x) - 1n)
}

/**
 * Return the bit length of a positive BigInt.
 *
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	return n.toString(2).length
}

/**
 * Decompose a finite positive binary64 number `x` into exact integers `(m, e)`
 * such that `x === m * 2^e` with `m > 0n`.
 *
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function decomposePositiveFloat(x) {
	const bits = floatToBits(x)
	const rawExp = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & 0xfffffffffffffn
	if (rawExp === 0) {
		return { m: frac, e: -1074 }
	}
	return { m: (1n << 52n) | frac, e: rawExp - 1075 }
}

/**
 * Compare exact real values `y^3` and `x` for finite positive binary64 numbers `y` and `x`.
 *
 * @param {number} y
 * @param {number} x
 * @returns {-1 | 0 | 1} `-1` if `y^3 < x`, `0` if `y^3 === x`, `1` if `y^3 > x`
 */
function compareCube(y, x) {
	const { m: my, e: ey } = decomposePositiveFloat(y)
	const { m: mx, e: ex } = decomposePositiveFloat(x)
	const my3 = my * my * my
	const lhsExp = 3 * ey
	const lhsTop = bitLength(my3) + lhsExp
	const rhsTop = bitLength(mx) + ex
	if (lhsTop < rhsTop) return -1
	if (lhsTop > rhsTop) return 1

	const shift = lhsExp - ex
	let lhs = my3
	let rhs = mx
	if (shift > 0) {
		lhs <<= BigInt(shift)
	} else if (shift < 0) {
		rhs <<= BigInt(-shift)
	}
	if (lhs < rhs) return -1
	if (lhs > rhs) return 1
	return 0
}

/**
 * Compute an iterative Newton-Raphson approximation to `cbrt(x)` for finite `x > 0`.
 *
 * Scales `x = m * 2^e` by `2^(-3k)` into `[1, 8)` so all intermediate products
 * stay well within normal floating-point range, iterates Newton-Raphson, and scales back.
 *
 * @param {number} x
 * @returns {number}
 */
function cbrtApproxPositive(x) {
	const { m, e } = decomposePositiveFloat(x)
	const p = bitLength(m) - 1 + e
	const k = Math.floor(p / 3)
	const xScaled = Number(m) * 2 ** (e - 3 * k)

	// Linear initial guess mapping [1, 8) -> [1, 2)
	let y = 1 + (xScaled - 1) / 7
	let prev = 0
	for (let i = 0; i < 64; i++) {
		const next = (2 * y + xScaled / (y * y)) / 3
		if (next === y || next === prev) {
			y = next
			break
		}
		prev = y
		y = next
	}

	return y * 2 ** k
}

/**
 * Compute the greatest binary64 number `<= cbrt(x)` for finite `x > 0`.
 *
 * @param {number} x
 * @returns {number}
 */
function cbrtPositiveDown(x) {
	let y = cbrtApproxPositive(x)
	while (compareCube(y, x) > 0) {
		y = nextDownPositive(y)
	}
	while (true) {
		const up = nextUpPositive(y)
		if (compareCube(up, x) <= 0) {
			y = up
		} else {
			break
		}
	}
	return y
}

/**
 * Compute the least binary64 number `>= cbrt(x)` for finite `x > 0`.
 *
 * @param {number} x
 * @returns {number}
 */
function cbrtPositiveUp(x) {
	let y = cbrtApproxPositive(x)
	while (compareCube(y, x) < 0) {
		y = nextUpPositive(y)
	}
	while (true) {
		const down = nextDownPositive(y)
		if (compareCube(down, x) >= 0) {
			y = down
		} else {
			break
		}
	}
	return y
}

/**
 * Compute `cbrt(x)` rounded toward `-Infinity` for any non-NaN number `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function cbrtDown(x) {
	if (x === 0) return 0
	if (!Number.isFinite(x)) return x
	if (x > 0) return cbrtPositiveDown(x)
	return -cbrtPositiveUp(-x)
}

/**
 * Compute `cbrt(x)` rounded toward `+Infinity` for any non-NaN number `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function cbrtUp(x) {
	if (x === 0) return 0
	if (!Number.isFinite(x)) return x
	if (x > 0) return cbrtPositiveUp(x)
	return -cbrtPositiveDown(-x)
}

/**
 * Compute the cube root of a closed real interval `[lo, hi]` with outward rounding.
 *
 * Because `cbrt` is strictly increasing on `[-Infinity, Infinity]`, the exact image
 * of `[lo, hi]` is `[cbrt(lo), cbrt(hi)]`. Outward rounding guarantees:
 * `outLo <= cbrt(lo)` and `outHi >= cbrt(hi)`.
 *
 * @param {[number, number]} interval - Closed interval `[lo, hi]` with `lo <= hi`.
 * @returns {[number, number]} Outwardly rounded enclosing interval `[outLo, outHi]`.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either endpoint is `NaN` or if `lo > hi`.
 */
export function cbrtIntervalIterative(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('Expected interval to be a 2-element array [lo, hi]')
	}
	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError('Interval endpoints must be numbers')
	}
	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError('Interval endpoints must not be NaN')
	}
	if (lo > hi) {
		throw new RangeError('Interval lower bound must not exceed upper bound')
	}

	return [cbrtDown(lo), cbrtUp(hi)]
}
