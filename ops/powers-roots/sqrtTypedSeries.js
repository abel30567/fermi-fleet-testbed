/**
 * Element-wise square root over a Float64Array using exact IEEE-754
 * exponent/mantissa range reduction and a transformed binomial power series.
 *
 * Mathematical basis:
 * 1. Exact binary range reduction:
 *    Any finite positive IEEE-754 double `x` is decomposed without rounding as
 *    `x = m * 2^(2k)` where `m ∈ [0.5, 2)` and `k ∈ [-537, 512]` (subnormal
 *    inputs are first scaled by `2^54` so their significand is normalized).
 *    Consequently, `sqrt(x) = sqrt(m) * 2^k`.
 *
 * 2. Transformed binomial series around `m = 1`:
 *    Setting `u = (m - 1) / (m + 1)` gives `m = (1 + u) / (1 - u)` with
 *    `|u| <= 1/3`, hence `z = u^2 ∈ [0, 1/9]`. Using the identity
 *
 *      sqrt(m) = sqrt((1 + u) / (1 - u))
 *              = (1 + u) * (1 - u^2)^(-1/2)
 *              = (1 + u) * sum_{n=0}^{∞} C(2n, n) / 4^n * z^n
 *
 *    All series coefficients are strictly positive dyadic rationals
 *    (`c_n = C(2n, n) / 4^n`), avoiding catastrophic cancellation. Because
 *    `z <= 1/9`, truncating at `n = 19` (`20` terms) yields a remainder below
 *    `10^-19` (beyond IEEE-754 binary64 precision) when evaluated via Horner's
 *    scheme.
 *
 * 3. Final Newton-Raphson polish and exact scaling:
 *    One Heron/Newton step `y = 0.5 * (y + m / y)` eliminates residual
 *    polynomial rounding error, and multiplying by the exact normal power of
 *    two `2^k` produces `sqrt(x)` with full binary64 accuracy across all
 *    normal and subnormal positive doubles.
 */

const SERIES_TERMS = 20;
const SERIES_COEFFS = new Float64Array(SERIES_TERMS);

{
	let centralBinom = 1n;
	let pow4 = 1;
	SERIES_COEFFS[0] = 1;
	for (let n = 1; n < SERIES_TERMS; n++) {
		centralBinom = (centralBinom * BigInt(2 * (2 * n - 1))) / BigInt(n);
		pow4 *= 4;
		SERIES_COEFFS[n] = Number(centralBinom) / pow4;
	}
}

const BIT_BUF = new ArrayBuffer(8);
const F64_VIEW = new Float64Array(BIT_BUF);
const U64_VIEW = new BigUint64Array(BIT_BUF);

const EXP_MASK = 0x7ffn;
const MANTISSA_MASK = 0x000fffffffffffffn;
const BIAS = 1023;
const BIAS_EXP_BITS = 0x3ff0000000000000n;
const SUBNORMAL_SCALE = 2 ** 54;
const SUBNORMAL_EXP_SHIFT = 54;

/**
 * Evaluates `sqrt(x)` for a single validated finite non-negative number `x`.
 *
 * @param {number} x - Finite non-negative IEEE-754 double.
 * @returns {number} Square root of `x`.
 */
function sqrtScalarSeries(x) {
	if (x === 0) {
		return x;
	}

	// Step 1: Exact IEEE-754 bit extraction into x = s * 2^exp with s in [1, 2).
	F64_VIEW[0] = x;
	let bits = U64_VIEW[0];
	let biasedExp = Number((bits >> 52n) & EXP_MASK);
	let expOffset = 0;

	if (biasedExp === 0) {
		// Subnormal: multiply by 2^54 (exact) to normalize.
		F64_VIEW[0] = x * SUBNORMAL_SCALE;
		bits = U64_VIEW[0];
		biasedExp = Number((bits >> 52n) & EXP_MASK);
		expOffset = -SUBNORMAL_EXP_SHIFT;
	}

	const exp = biasedExp - BIAS + expOffset;
	U64_VIEW[0] = (bits & MANTISSA_MASK) | BIAS_EXP_BITS;
	const s = F64_VIEW[0]; // s in [1, 2)

	// Step 2: Reduce to x = m * 2^(2k) with m in [0.5, 2).
	let m;
	let k;
	if ((exp & 1) === 0) {
		m = s;
		k = exp >> 1;
	} else {
		m = s * 0.5;
		k = (exp + 1) >> 1;
	}

	// Step 3: Transformed binomial series for sqrt(m) = (1 + u) * (1 - u^2)^(-1/2).
	const u = (m - 1) / (m + 1);
	const z = u * u;

	let sum = SERIES_COEFFS[SERIES_TERMS - 1];
	for (let i = SERIES_TERMS - 2; i >= 0; i--) {
		sum = sum * z + SERIES_COEFFS[i];
	}

	let y = (1 + u) * sum;

	// Step 4: Single Newton-Raphson polish for full 53-bit rounding accuracy.
	y = 0.5 * (y + m / y);

	// Step 5: Exact scaling by 2^k (k in [-537, 512], always a normal power of 2).
	U64_VIEW[0] = BigInt(k + BIAS) << 52n;
	return y * F64_VIEW[0];
}

/**
 * Computes the element-wise square root of a `Float64Array` using exact binary
 * range reduction and a transformed binomial series expansion around 1.
 *
 * Does not mutate `input`; always returns a newly allocated `Float64Array`.
 *
 * @param {Float64Array} input - Input array of finite non-negative doubles.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise square roots.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 * @throws {RangeError} If any element of `input` is negative, `NaN`, or non-finite (`±Infinity`).
 */
export function sqrtTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const len = input.length;
	const output = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const x = input[i];
		if (!Number.isFinite(x)) {
			throw new RangeError(
				`Invalid non-finite element at index ${i}: ${x}`
			);
		}
		if (x < 0) {
			throw new RangeError(
				`Invalid negative element at index ${i}: ${x}`
			);
		}
		output[i] = sqrtScalarSeries(x);
	}

	return output;
}
