/**
 * @fileoverview Series- and identity-based square root over IEEE-754 float64 Numbers.
 *
 * Computes `sqrt(x)` without delegating to `Math.sqrt` by combining:
 * 1. Exact IEEE-754 binary exponent range reduction: `x = m * 4^k`, with `m ∈ [0.5, 2)`.
 * 2. Dyadic anchor identity: `sqrt(m) = c * sqrt(1 + u)`, where `c = i / 64` is chosen
 *    from `[45/64, 91/64]` so that `u = (m - c^2) / c^2` satisfies `|u| < 0.022`.
 *    Both `c` and `c^2` are exact in float64, so `m - c^2` is exact by Sterbenz's lemma.
 * 3. Generalized binomial Taylor series:
 *    `sqrt(1 + u) = 1 + sum_{n=1..∞} C(1/2, n) * u^n`
 *    with `C(1/2, 1) = 1/2` and `C(1/2, n) = C(1/2, n - 1) * (3 - 2n) / (2n)`.
 *    For `|u| < 0.022`, this converges to IEEE-754 float64 precision in <= 12 terms.
 * 4. Exact final scaling by `2^k`.
 */

const F64_BUFFER = new ArrayBuffer(8)
const F64_VIEW = new DataView(F64_BUFFER)

/** Exact factor `2^54` used to normalize IEEE-754 subnormal inputs without rounding. */
const SUBNORMAL_SCALE = 2 ** 54
const SUBNORMAL_SHIFT = 54
const MIN_NORMAL = 2 ** -1022
const ANCHOR_DENOM = 64
const ANCHOR_DENOM_SQ = ANCHOR_DENOM * ANCHOR_DENOM // 4096
const MAX_SERIES_TERMS = 32

/**
 * Constructs the exact IEEE-754 float64 value `2^exp` for normal exponents
 * (`-1022 <= exp <= 1023`).
 *
 * @param {number} exp - Integer binary exponent in `[-1022, 1023]`.
 * @returns {number} Exact value `2^exp`.
 */
function exactPow2(exp) {
	F64_VIEW.setBigUint64(0, BigInt(exp + 1023) << 52n, false)
	return F64_VIEW.getFloat64(0, false)
}

/**
 * Decomposes a positive finite float64 `x` into `x = m * 4^k` where `m ∈ [0.5, 2)`
 * and `k` is an integer in `[-537, 512]`.
 *
 * @param {number} x - Positive finite float64 number.
 * @returns {{ m: number, k: number }} Exact range-reduced mantissa and quarter-scale exponent.
 */
function reduceToMantissaAndPow4(x) {
	let scaled = x
	let expOffset = 0

	// Normalize subnormals via an exact power-of-2 multiplication.
	if (scaled < MIN_NORMAL) {
		scaled *= SUBNORMAL_SCALE
		expOffset = -SUBNORMAL_SHIFT
	}

	F64_VIEW.setFloat64(0, scaled, false)
	const bits = F64_VIEW.getBigUint64(0, false)
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	const exp2 = biasedExp - 1023 + expOffset

	// Extract exact significand f ∈ [1, 2) by setting the biased exponent to 1023 (2^0).
	const significandBits = (bits & 0x000fffffffffffffn) | (1023n << 52n)
	F64_VIEW.setBigUint64(0, significandBits, false)
	const significand = F64_VIEW.getFloat64(0, false)

	// Make the exponent even: x = m * 2^(2k) = m * 4^k with m ∈ [0.5, 2).
	if ((exp2 & 1) === 0) {
		return { m: significand, k: exp2 >> 1 }
	}
	return { m: significand * 0.5, k: (exp2 + 1) >> 1 }
}

/**
 * Selects the integer `i ∈ [45, 91]` for dyadic anchor `c = i / 64` that minimizes
 * `|u| = |m / c^2 - 1|` for `m ∈ [0.5, 2)`.
 *
 * @param {number} m - Range-reduced value in `[0.5, 2)`.
 * @returns {number} Optimal integer numerator `i` for `c = i / 64`.
 */
function selectDyadicAnchor(m) {
	const scaledM = m * ANCHOR_DENOM_SQ // Exact: m * 4096 ∈ [2048, 8192)
	let lo = 45 // 45^2 = 2025 < 2048
	let hi = 91 // 91^2 = 8281 > 8192

	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1
		if (mid * mid <= scaledM) {
			lo = mid
		} else {
			hi = mid
		}
	}

	const loSq = lo * lo
	const hiSq = hi * hi
	// Compare |scaledM / lo^2 - 1| <= |1 - scaledM / hi^2|
	return scaledM * (loSq + hiSq) <= 2 * loSq * hiSq ? lo : hi
}

/**
 * Evaluates `sqrt(1 + u) - 1` using the generalized binomial Taylor series:
 * `sum_{n=1..∞} C(1/2, n) * u^n` for `|u| < 1`.
 *
 * Terms are collected and summed from smallest to largest magnitude to minimize
 * floating-point accumulation error.
 *
 * @param {number} u - Small perturbation around 0 (`|u| < 0.022`).
 * @returns {number} Series approximation of `sqrt(1 + u) - 1`.
 */
function binomialSqrtSeriesOffset(u) {
	if (u === 0) {
		return 0
	}

	const terms = []
	let term = 0.5 * u
	terms.push(term)

	for (let n = 2; n <= MAX_SERIES_TERMS; n += 1) {
		term = (term * u * (3 - 2 * n)) / (2 * n)
		if (term === 0) {
			break
		}
		terms.push(term)
		if (Math.abs(term) <= Number.EPSILON * 0.0625) {
			break
		}
	}

	// Sum from smallest magnitude to largest to preserve low-order bits.
	let sum = 0
	for (let idx = terms.length - 1; idx >= 0; idx -= 1) {
		sum += terms[idx]
	}
	return sum
}

/**
 * Computes the principal square root of a non-negative finite IEEE-754 float64
 * number using binary range reduction (`x = m * 4^k`), dyadic anchor identity
 * (`sqrt(m) = c * sqrt(1 + u)`), and the generalized binomial Taylor series for
 * `sqrt(1 + u)`.
 *
 * Does not delegate to `Math.sqrt`.
 *
 * @param {number} x - Non-negative finite IEEE-754 float64 number.
 * @returns {number} The principal square root of `x` (preserves `-0` for `-0`).
 * @throws {TypeError} If `x` is not a `number`.
 * @throws {RangeError} If `x` is `NaN`, non-finite (`±Infinity`), or negative (`x < 0`).
 */
export function sqrtFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, received ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected x to be a finite number, received ${x}`)
	}
	if (x < 0) {
		throw new RangeError(`Expected x to be non-negative, received ${x}`)
	}
	if (x === 0 || x === 1) {
		return x
	}

	const { m, k } = reduceToMantissaAndPow4(x)
	const anchorInt = selectDyadicAnchor(m)
	const anchor = anchorInt / ANCHOR_DENOM
	const anchorSq = (anchorInt * anchorInt) / ANCHOR_DENOM_SQ

	// Exact subtraction by Sterbenz's lemma; |u| < 0.022.
	const u = (m - anchorSq) / anchorSq
	const seriesOffset = binomialSqrtSeriesOffset(u)

	// sqrt(m) = c * (1 + seriesOffset) = c + c * seriesOffset
	const sqrtM = anchor + anchor * seriesOffset
	return sqrtM * exactPow2(k)
}
