/**
 * Element-wise arithmetic multiplication over one or more equal-length `Float64Array` series.
 *
 * Algorithm:
 * Computes the element-wise product
 *   P[i] = ∏_{k=0}^{m-1} series[k][i]
 * using exact IEEE-754 binary64 mantissa–exponent decomposition (`x = s · m · 2^e`
 * with `m ∈ [1, 2)` and exact integer `e`) combined with Dekker/Veltkamp's
 * error-free transformation `TwoProduct` and Knuth's `TwoSum` (compensated
 * double-double mantissa accumulation):
 *
 *   1. Each non-zero factor is split exactly via IEEE-754 bit manipulation into
 *      sign `s ∈ {-1, +1}`, normalized mantissa `m ∈ [1, 2)`, and integer base-2
 *      exponent `e ∈ [-1074, 1023]` (subnormals are normalized by scaling by `2^54`).
 *   2. Mantissas are multiplied in compensated form `(p, err)` using Veltkamp
 *      splitting (`splitter = 2^27 + 1`) and Dekker's `TwoProduct`, followed by
 *      Knuth's `TwoSum` to re-orthogonalize `(p, err)` and exact power-of-two
 *      renormalization into `[1, 2)`. Because `p, m ∈ [1, 2)`, Veltkamp splitting
 *      never overflows or underflows, and ~106 bits of intermediate significand
 *      precision are maintained across arbitrarily long series.
 *   3. Exponents are accumulated exactly in integer arithmetic (`expSum += e`),
 *      preventing spurious intermediate overflow (e.g. `1e200 * 1e200 * 1e-300`)
 *      and spurious intermediate underflow (e.g. `1e-200 * 1e-200 * 1e300`).
 *   4. Zero factors are tracked separately while continuing to propagate the exact
 *      IEEE-754 sign across all factors, avoiding `Infinity * 0 = NaN` in series
 *      that contain both very large values and exact zeros.
 *   5. The final result is reconstructed by exact IEEE-754 exponent insertion
 *      (`ldexp`), with single-rounding gradual underflow into subnormals,
 *      overflow to `±Infinity`, and signed-zero preservation.
 */

const f64View = new Float64Array(1);
const u64View = new BigUint64Array(f64View.buffer);

const EXP_MASK = 0x7ffn;
const FRAC_MASK = 0x000fffffffffffffn;
const ONE_BITS = 0x3ff0000000000000n;
const EXP_BIAS = 1023;
const TWO_POW_54 = 2 ** 54;
const TWO_POW_NEG54 = 2 ** -54;
const VELTKAMP_SPLITTER = 2 ** 27 + 1; // 134217729

/**
 * Scales a normalized positive mantissa `mant ∈ [1, 2)` by `2^exp` in IEEE-754 binary64,
 * handling normal outputs, gradual subnormal underflow, overflow to `Infinity`,
 * and underflow to `0`.
 *
 * @param {number} mant - Normalized significand in `[1, 2)`.
 * @param {number} exp - Integer base-2 exponent.
 * @returns {number} `mant * 2^exp` rounded to IEEE-754 binary64.
 */
function ldexpNormalized(mant, exp) {
	if (exp > 1023) {
		return Infinity;
	}
	if (exp >= -1022) {
		f64View[0] = mant;
		const fracBits = u64View[0] & FRAC_MASK;
		u64View[0] = (BigInt(exp + EXP_BIAS) << 52n) | fracBits;
		return f64View[0];
	}
	if (exp >= -1075) {
		// Shift into normal range (+54), construct exact binary64, then single-round via * 2^-54
		f64View[0] = mant;
		const fracBits = u64View[0] & FRAC_MASK;
		u64View[0] = (BigInt(exp + 54 + EXP_BIAS) << 52n) | fracBits;
		return f64View[0] * TWO_POW_NEG54;
	}
	return 0;
}

/**
 * Multiplies two or more (or an array of) equal-length `Float64Array` instances
 * element-wise, returning a new `Float64Array`.
 *
 * Accepts either variadic `Float64Array` arguments:
 *   `multiplyTypedSeries(a, b)`
 *   `multiplyTypedSeries(a, b, c, ...)`
 * or a single non-empty array of `Float64Array` instances:
 *   `multiplyTypedSeries([a, b, c, ...])`
 *
 * @param {...(Float64Array | Float64Array[])} args - One or more equal-length `Float64Array`
 *   inputs (or a single non-empty array thereof) containing only finite numbers.
 * @returns {Float64Array} A new `Float64Array` where element `i` is the product of all
 *   input elements at index `i`.
 * @throws {RangeError} If no `Float64Array` inputs are provided, if input lengths do not
 *   match, or if any element is `NaN`, `Infinity`, or `-Infinity`.
 * @throws {TypeError} If any input is not a `Float64Array`.
 */
export function multiplyTypedSeries(...args) {
	if (args.length === 0) {
		throw new RangeError('multiplyTypedSeries requires at least one Float64Array input');
	}

	/** @type {Float64Array[]} */
	let seriesList;
	if (args.length === 1 && Array.isArray(args[0])) {
		seriesList = args[0];
		if (seriesList.length === 0) {
			throw new RangeError('Series array must contain at least one Float64Array');
		}
	} else {
		seriesList = args;
	}

	const numSeries = seriesList.length;
	for (let k = 0; k < numSeries; k++) {
		if (!(seriesList[k] instanceof Float64Array)) {
			throw new TypeError(`Input at index ${k} must be a Float64Array`);
		}
	}

	const length = seriesList[0].length;
	for (let k = 1; k < numSeries; k++) {
		if (seriesList[k].length !== length) {
			throw new RangeError(
				`All Float64Array inputs must have equal length (expected ${length}, got ${seriesList[k].length} at index ${k})`
			);
		}
	}

	// Validate finiteness across all inputs before computing results
	for (let k = 0; k < numSeries; k++) {
		const arr = seriesList[k];
		for (let i = 0; i < length; i++) {
			if (!Number.isFinite(arr[i])) {
				throw new RangeError(
					`Non-finite value (${arr[i]}) in series ${k} at index ${i}`
				);
			}
		}
	}

	if (numSeries === 1) {
		return new Float64Array(seriesList[0]);
	}

	const out = new Float64Array(length);

	for (let i = 0; i < length; i++) {
		let sign = 1;
		let hasZero = false;
		let p = 1;
		let err = 0;
		let expSum = 0;

		for (let k = 0; k < numSeries; k++) {
			const x = seriesList[k][i];

			if (x === 0) {
				if (Object.is(x, -0)) {
					sign = -sign;
				}
				hasZero = true;
				continue;
			}

			let ax = x;
			if (ax < 0) {
				sign = -sign;
				ax = -ax;
			}

			if (hasZero) {
				// Value is already zero; only remaining sign flips matter.
				continue;
			}

			// Exact frexp: ax = m * 2^e with m in [1, 2)
			f64View[0] = ax;
			let bits = u64View[0];
			let biasedExp = Number((bits >> 52n) & EXP_MASK);
			let e;
			if (biasedExp === 0) {
				// Subnormal: scale into normal range by exact power of 2
				f64View[0] = ax * TWO_POW_54;
				bits = u64View[0];
				biasedExp = Number((bits >> 52n) & EXP_MASK);
				e = biasedExp - EXP_BIAS - 54;
			} else {
				e = biasedExp - EXP_BIAS;
			}
			u64View[0] = (bits & FRAC_MASK) | ONE_BITS;
			const m = f64View[0];

			// Dekker / Veltkamp TwoProduct(p, m): p * m = h + r (exact)
			const c1 = VELTKAMP_SPLITTER * p;
			const pHi = c1 - (c1 - p);
			const pLo = p - pHi;

			const c2 = VELTKAMP_SPLITTER * m;
			const mHi = c2 - (c2 - m);
			const mLo = m - mHi;

			const h = p * m;
			const r = ((pHi * mHi - h) + pHi * mLo + pLo * mHi) + pLo * mLo;

			// Propagate compensated error and re-orthogonalize with Knuth TwoSum
			const low = r + err * m;
			const s = h + low;
			const v = s - h;
			err = (h - (s - v)) + (low - v);
			p = s;

			// Keep p normalized in [1, 2) via exact power-of-2 scaling
			while (p >= 2) {
				p *= 0.5;
				err *= 0.5;
				expSum += 1;
			}
			while (p < 1) {
				p *= 2;
				err *= 2;
				expSum -= 1;
			}

			expSum += e;
		}

		if (hasZero) {
			out[i] = sign < 0 ? -0 : 0;
			continue;
		}

		let mant = p + err;
		if (mant >= 2) {
			mant *= 0.5;
			expSum += 1;
		} else if (mant < 1) {
			mant *= 2;
			expSum -= 1;
		}

		out[i] = sign * ldexpNormalized(mant, expSum);
	}

	return out;
}
