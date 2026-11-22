/**
 * Computes the element-wise base-2 logarithm (`log2`) of a `Float64Array`
 * using IEEE-754 binary64 exponent/mantissa extraction combined with a
 * range-reduced inverse hyperbolic tangent (`atanh`) Taylor series.
 *
 * For each positive finite element `x`:
 * 1. Extract the binary exponent `e` and normalized mantissa `m` in `[1, 2)`
 *    such that `x = m * 2^e` (scaling subnormals by `2^54` before extraction).
 * 2. Range-reduce `m` into `[sqrt(2)/2, sqrt(2)]` by halving `m` and
 *    incrementing `e` whenever `m > sqrt(2)`.
 * 3. Evaluate `ln(m) = 2 * atanh(u)` where `u = (m - 1) / (m + 1)` satisfies
 *    `|u| <= 3 - 2*sqrt(2) ≈ 0.17157`, using the odd power series
 *    `2 * u * sum_{k=0..12} u^(2k) / (2k + 1)` via Horner's method.
 * 4. Combine `log2(x) = e + ln(m) / ln(2)`.
 *
 * IEEE-754 edge cases:
 * - `NaN` -> `NaN`
 * - `x < 0` -> `NaN`
 * - `x === 0` (`+0` or `-0`) -> `-Infinity`
 * - `x === Infinity` -> `Infinity`
 *
 * @param {Float64Array} input - Input vector of 64-bit IEEE-754 floats.
 * @returns {Float64Array} A new `Float64Array` containing `log2(input[i])` for each element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */

const SQRT2 = 1.4142135623730951
const TWO_POW_54 = 18014398509481984 // 2^54, exact in float64
const INV_LN2 = 1.4426950408889634 // 1 / ln(2)

const EXP_MASK = 0x7ffn
const FRAC_MASK = 0x000fffffffffffffn
const ONE_EXP_BITS = 0x3ff0000000000000n

// Odd reciprocals 1 / (2k + 1) for k = 1..12 used in the atanh series
const C1 = 1 / 3
const C2 = 1 / 5
const C3 = 1 / 7
const C4 = 1 / 9
const C5 = 1 / 11
const C6 = 1 / 13
const C7 = 1 / 15
const C8 = 1 / 17
const C9 = 1 / 19
const C10 = 1 / 21
const C11 = 1 / 23
const C12 = 1 / 25

// Reusable 8-byte scratch buffer for zero-allocation IEEE-754 bit inspection
const scratchBuf = new ArrayBuffer(8)
const scratchF64 = new Float64Array(scratchBuf)
const scratchU64 = new BigUint64Array(scratchBuf)

/**
 * Scalar base-2 logarithm for a single IEEE-754 float64 value.
 *
 * @param {number} x
 * @returns {number}
 */
function log2Scalar(x) {
	if (x !== x || x < 0) {
		return Number.NaN
	}
	if (x === 0) {
		return Number.NEGATIVE_INFINITY
	}
	if (x === Number.POSITIVE_INFINITY) {
		return Number.POSITIVE_INFINITY
	}

	scratchF64[0] = x
	let bits = scratchU64[0]
	let biasedExp = Number((bits >> 52n) & EXP_MASK)
	let e

	if (biasedExp === 0) {
		// Subnormal: scale into normal range by multiplying by 2^54
		scratchF64[0] = x * TWO_POW_54
		bits = scratchU64[0]
		biasedExp = Number((bits >> 52n) & EXP_MASK)
		e = biasedExp - 1023 - 54
	} else {
		e = biasedExp - 1023
	}

	// Reconstruct mantissa m in [1, 2)
	scratchU64[0] = ONE_EXP_BITS | (bits & FRAC_MASK)
	let m = scratchF64[0]

	// Exact power of 2 fast path (m === 1)
	if (m === 1) {
		return e
	}

	// Range reduction into [sqrt(2)/2, sqrt(2)] so |u| <= 3 - 2*sqrt(2) ≈ 0.17157
	if (m > SQRT2) {
		m *= 0.5
		e += 1
	}

	// ln(m) = 2 * atanh(u) = 2 * u * (1 + u^2 * (1/3 + u^2 * (1/5 + ...)))
	const u = (m - 1) / (m + 1)
	const u2 = u * u

	const tail =
		C1 +
		u2 *
			(C2 +
				u2 *
					(C3 +
						u2 *
							(C4 +
								u2 *
									(C5 +
										u2 *
											(C6 +
												u2 *
													(C7 +
														u2 *
															(C8 +
																u2 *
																	(C9 +
																		u2 * (C10 + u2 * (C11 + u2 * C12))))))))))

	const lnM = 2 * u * (1 + u2 * tail)
	return e + lnM * INV_LN2
}

export function log2TypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		output[i] = log2Scalar(input[i])
	}

	return output
}
