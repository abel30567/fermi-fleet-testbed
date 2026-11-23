/**
 * Computes the base-2 logarithm (log2) of an IEEE-754 binary64 (float64) number
 * using a precomputed double-double lookup table, binary64 bit decomposition,
 * and bounded memoization.
 *
 * Algorithm:
 * 1. Validates that the input is a JavaScript `number` and handles IEEE-754
 *    special cases (`NaN`, negative numbers, `±0`, `Infinity`, and `1`).
 * 2. Checks a bounded FIFO memoization cache for previously computed finite
 *    positive inputs.
 * 3. Extracts the unbiased exponent `k` and normalized significand `m ∈ [1, 2)`
 *    directly from the IEEE-754 binary64 bit layout (normalizing subnormals by
 *    scaling by `2^54`). Exact powers of two return `k` immediately.
 * 4. Reduces `m` against the nearest precomputed grid point `c = 1 + idx / 256`
 *    (`idx ∈ [0, 256]`) so that `|u| = |(m - c) / (m + c)| <= 2^-10`.
 * 5. Evaluates `log2(m / c) = (2 / ln 2) * (u + u^3/3 + u^5/5 + u^7/7 + u^9/9)`
 *    and combines `k + log2(c) + log2(m / c)` in double-double arithmetic using
 *    the precomputed `(hi, lo)` table entries for full float64 accuracy.
 *
 * @module ops/logarithmic/log2FloatMemo
 */

const TABLE_BITS = 8
const TABLE_SIZE = 1 << TABLE_BITS // 256 intervals -> 257 grid points [1, 2]
const SCALE_SUBNORMAL = 18014398509481984 // 2^54
const SPLIT = 134217729 // 2^27 + 1 (Veltkamp splitting constant)
const MAX_CACHE_SIZE = 4096

// Shared typed-array scratchpad for IEEE-754 binary64 bit extraction.
const F64_BUF = new Float64Array(1)
const U32_VIEW = new Uint32Array(F64_BUF.buffer)
F64_BUF[0] = 1.0
const HI_IDX = U32_VIEW[1] === 0x3ff00000 ? 1 : 0
const LO_IDX = 1 - HI_IDX

/**
 * Error-free transformation for `a + b = s + e`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b
	const v = s - a
	const e = (a - (s - v)) + (b - v)
	return [s, e]
}

/**
 * Fast error-free transformation for `a + b = s + e` assuming `|a| >= |b|`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function quickTwoSum(a, b) {
	const s = a + b
	const e = b - (s - a)
	return [s, e]
}

/**
 * Error-free transformation for `a * b = p + e` via Veltkamp splitting.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
	const p = a * b
	const ca = SPLIT * a
	const aHi = ca - (ca - a)
	const aLo = a - aHi
	const cb = SPLIT * b
	const bHi = cb - (cb - b)
	const bLo = b - bHi
	const e = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo
	return [p, e]
}

/**
 * Double-double addition.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function ddAdd(a, b) {
	const [s, e] = twoSum(a[0], b[0])
	return quickTwoSum(s, e + a[1] + b[1])
}

/**
 * Double-double multiplication.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function ddMul(a, b) {
	const [p, e] = twoProd(a[0], b[0])
	return quickTwoSum(p, e + a[0] * b[1] + a[1] * b[0])
}

/**
 * Double-double division `a / b`.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function ddDiv(a, b) {
	const q1 = a[0] / b[0]
	const p1 = ddMul([q1, 0], b)
	const r1 = ddAdd(a, [-p1[0], -p1[1]])
	const q2 = r1[0] / b[0]
	const p2 = ddMul([q2, 0], b)
	const r2 = ddAdd(r1, [-p2[0], -p2[1]])
	const q3 = r2[0] / b[0]
	const [s, e] = quickTwoSum(q1, q2)
	return ddAdd([s, e], [q3, 0])
}

/**
 * Computes `ln(p / q)` in double-double precision via the artanh series
 * `ln((1 + u) / (1 - u)) = 2 * sum_{j>=0} u^(2j+1) / (2j+1)` where `u = (p - q) / (p + q)`.
 *
 * @param {number} p Positive numerator.
 * @param {number} q Positive denominator.
 * @returns {[number, number]}
 */
function ddLnRatio(p, q) {
	const u = ddDiv([p - q, 0], [p + q, 0])
	const u2 = ddMul(u, u)
	let term = u
	let sum = u
	for (let denom = 3; denom <= 61; denom += 2) {
		term = ddMul(term, u2)
		const contrib = ddDiv(term, [denom, 0])
		sum = ddAdd(sum, contrib)
		if (Math.abs(contrib[0]) < 1e-34 * Math.abs(sum[0])) {
			break
		}
	}
	return ddMul([2, 0], sum)
}

// Precompute `ln(2)` and `1 / ln(2)` in double-double precision using exact ratios:
// 2 = (4/3)^2 * (9/8), so ln(2) = 2*ln(4/3) + ln(9/8) (u = 1/7 and u = 1/17).
const LN2_DD = ddAdd(ddMul([2, 0], ddLnRatio(4, 3)), ddLnRatio(9, 8))
const INV_LN2_DD = ddDiv([1, 0], LN2_DD)
const INV_LN2_HI = INV_LN2_DD[0]
const INV_LN2_LO = INV_LN2_DD[1]

// Precompute `log2(1 + i / 256)` for `i = 0..256` as double-double `(hi, lo)` tables.
const LOG2_TABLE_HI = new Float64Array(TABLE_SIZE + 1)
const LOG2_TABLE_LO = new Float64Array(TABLE_SIZE + 1)

{
	let accLn = [0, 0]
	LOG2_TABLE_HI[0] = 0
	LOG2_TABLE_LO[0] = 0
	for (let i = 1; i < TABLE_SIZE; i++) {
		accLn = ddAdd(accLn, ddLnRatio(TABLE_SIZE + i, TABLE_SIZE + i - 1))
		const log2Val = ddMul(accLn, INV_LN2_DD)
		LOG2_TABLE_HI[i] = log2Val[0]
		LOG2_TABLE_LO[i] = log2Val[1]
	}
	LOG2_TABLE_HI[TABLE_SIZE] = 1
	LOG2_TABLE_LO[TABLE_SIZE] = 0
}

/** @type {Map<number, number>} */
const memoCache = new Map()

/**
 * Computes the base-2 logarithm of an IEEE-754 float64 number `x` using a
 * precomputed lookup table and bounded memoization.
 *
 * Follows IEEE-754 / ECMAScript `Math.log2` semantics for all special values:
 * - `log2FloatMemo(NaN)` -> `NaN`
 * - `log2FloatMemo(x)` for `x < 0` (including `-Infinity`) -> `NaN`
 * - `log2FloatMemo(±0)` -> `-Infinity`
 * - `log2FloatMemo(1)` -> `+0`
 * - `log2FloatMemo(Infinity)` -> `Infinity`
 *
 * @param {number} x - The IEEE-754 float64 number to take the base-2 logarithm of.
 * @returns {number} The base-2 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `number`.
 */
export function log2FloatMemo(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${x === null ? 'null' : typeof x}`)
	}

	// Handle NaN and negative inputs (including -Infinity).
	if (Number.isNaN(x) || x < 0) {
		return NaN
	}
	if (x === 0) {
		return -Infinity
	}
	if (x === Infinity) {
		return Infinity
	}
	if (x === 1) {
		return 0
	}

	const cached = memoCache.get(x)
	if (cached !== undefined) {
		return cached
	}

	// Decompose IEEE-754 binary64 into exponent k and normalized mantissa m in [1, 2).
	F64_BUF[0] = x
	let hi = U32_VIEW[HI_IDX]
	let lo = U32_VIEW[LO_IDX]
	let biasedExp = (hi >>> 20) & 0x7ff
	let k

	if (biasedExp === 0) {
		// Subnormal: scale by 2^54 into the normal range.
		F64_BUF[0] = x * SCALE_SUBNORMAL
		hi = U32_VIEW[HI_IDX]
		lo = U32_VIEW[LO_IDX]
		biasedExp = (hi >>> 20) & 0x7ff
		k = biasedExp - 1023 - 54
	} else {
		k = biasedExp - 1023
	}

	const mantHi = hi & 0x000fffff
	let result

	if (mantHi === 0 && lo === 0) {
		// Exact power of two: x = 2^k.
		result = k
	} else {
		// Reconstruct normalized mantissa m in [1, 2) by setting exponent to 1023 (0x3ff).
		U32_VIEW[HI_IDX] = 0x3ff00000 | mantHi
		U32_VIEW[LO_IDX] = lo
		const m = F64_BUF[0]

		// Round top 9 mantissa bits to nearest grid point idx in [0, 256].
		const idx = ((mantHi >>> 11) + 1) >>> 1
		const c = 1 + idx / TABLE_SIZE

		// Exact difference dm = m - c (Sterbenz's lemma) and double-double sum s = c + m.
		const dm = m - c
		const [sHi, sLo] = twoSum(c, m)

		// Compute u = (m - c) / (m + c) in double-double precision; |u| <= 2^-10.
		const uHi = dm / sHi
		const [pHi, pLo] = twoProd(uHi, sHi)
		const uLo = ((dm - pHi) - pLo - uHi * sLo) / sHi

		// Leading term: (2 / ln 2) * u in double-double precision.
		const lead = ddMul([2 * uHi, 2 * uLo], [INV_LN2_HI, INV_LN2_LO])

		// Tail terms: (2 / ln 2) * u^3 * (1/3 + u^2*(1/5 + u^2*(1/7 + u^2/9))).
		// Since |u| <= 2^-10, truncation error is < 2^-90 and tail <= 2^-30.
		const u2 = uHi * uHi
		const polyTail =
			(2 * INV_LN2_HI) *
			uHi *
			u2 *
			(1 / 3 + u2 * (1 / 5 + u2 * (1 / 7 + u2 * (1 / 9))))

		// Combine k + LOG2_TABLE[idx] + lead + polyTail in double-double arithmetic.
		const base = ddAdd([k, 0], [LOG2_TABLE_HI[idx], LOG2_TABLE_LO[idx]])
		const total = ddAdd(base, ddAdd(lead, [polyTail, 0]))
		result = total[0] + total[1]
	}

	// Store in bounded FIFO memoization cache.
	if (memoCache.size >= MAX_CACHE_SIZE) {
		memoCache.delete(memoCache.keys().next().value)
	}
	memoCache.set(x, result)

	return result
}
