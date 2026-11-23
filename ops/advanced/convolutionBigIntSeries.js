/**
 * Exact discrete linear convolution over arbitrary-precision BigInt sequences
 * using formal power series Kronecker substitution (evaluation/interpolation
 * in a balanced signed power-of-two radix with divide-and-conquer binary splitting).
 *
 * Mathematical identity:
 * Given formal polynomials A(x) = sum_{i=0}^{m-1} a_i x^i and
 * B(x) = sum_{j=0}^{n-1} b_j x^j, their Cauchy product is
 * C(x) = A(x) * B(x) = sum_{k=0}^{m+n-2} c_k x^k where
 * c_k = sum_{i + j = k} a_i * b_j.
 *
 * Choosing bit-width W such that 2^(W - 1) > min(m, n) * max(|a_i|) * max(|b_j|)
 * guarantees every coefficient satisfies |c_k| < 2^(W - 1), so evaluating at
 * x = 2^W yields an integer C(2^W) = A(2^W) * B(2^W) whose balanced signed
 * base-2^W representation uniquely and exactly recovers every c_k.
 *
 * For fixed-point BigInt sequences (e.g., scaled by 10^18), pass
 * `{ scale: 10n ** 18n }` to rescale each exact convolution sum by `scale`
 * using exact round-half-to-even BigInt division.
 *
 * @module ops/advanced/convolutionBigIntSeries
 */

/**
 * Default fixed-point scale factor (10^18) for optional fixed-point convolution.
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n;

const VALID_MODES = new Set(['full', 'same', 'valid']);

/**
 * Compute exact bit length of a non-negative BigInt.
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	if (n === 0n) return 0;
	const hex = n.toString(16);
	const topNibble = parseInt(hex[0], 16);
	const topBits = 32 - Math.clz32(topNibble);
	return (hex.length - 1) * 4 + topBits;
}

/**
 * Evaluate the formal series slice coeffs[lo..hi-1] at x = 2^widthBig
 * using divide-and-conquer binary splitting.
 * @param {bigint[]} coeffs
 * @param {number} lo
 * @param {number} hi
 * @param {bigint} widthBig
 * @returns {bigint}
 */
function packSeries(coeffs, lo, hi, widthBig) {
	const len = hi - lo;
	if (len === 1) return coeffs[lo];
	const mid = lo + (len >> 1);
	const low = packSeries(coeffs, lo, mid, widthBig);
	const high = packSeries(coeffs, mid, hi, widthBig);
	return low + (high << (widthBig * BigInt(mid - lo)));
}

/**
 * Unpack a balanced signed base-(2^widthBig) integer into out[lo..hi-1]
 * using divide-and-conquer splitting.
 *
 * Because every coefficient satisfies |c_k| <= 2^(W-1) - 1 (with W >= 2),
 * any lower half of length k satisfies |V_low| < (1/2) * 2^(W * k),
 * so the balanced residue modulo 2^(W * k) uniquely recovers V_low and V_high.
 *
 * @param {bigint} value
 * @param {bigint[]} out
 * @param {number} lo
 * @param {number} hi
 * @param {bigint} widthBig
 */
function unpackSeries(value, out, lo, hi, widthBig) {
	const len = hi - lo;
	if (len === 1) {
		out[lo] = value;
		return;
	}
	const mid = lo + (len >> 1);
	const splitShift = widthBig * BigInt(mid - lo);
	const splitHalf = 1n << (splitShift - 1n);
	const splitBase = splitHalf << 1n;
	let low = value & (splitBase - 1n);
	if (low >= splitHalf) {
		low -= splitBase;
	}
	const high = (value - low) >> splitShift;
	unpackSeries(low, out, lo, mid, widthBig);
	unpackSeries(high, out, mid, hi, widthBig);
}

/**
 * Exact BigInt division with round-half-to-even (banker's rounding).
 * @param {bigint} num
 * @param {bigint} den - Must be strictly positive.
 * @returns {bigint}
 */
function divRoundHalfToEven(num, den) {
	const q = num / den;
	const r = num % den;
	if (r === 0n) return q;
	const absR2 = (r < 0n ? -r : r) << 1n;
	if (absR2 > den) {
		return num > 0n ? q + 1n : q - 1n;
	}
	if (absR2 === den && (q & 1n) !== 0n) {
		return num > 0n ? q + 1n : q - 1n;
	}
	return q;
}

/**
 * Validate that input is an Array of BigInt values.
 * @param {unknown} seq
 * @param {string} name
 */
function validateBigIntArray(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an Array of BigInt values`);
	}
	for (let i = 0; i < seq.length; i++) {
		if (typeof seq[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt, got ${typeof seq[i]}`);
		}
	}
}

/**
 * Compute the exact discrete linear convolution of two BigInt sequences using
 * formal power series Kronecker substitution.
 *
 * @param {bigint[]} a - First sequence of BigInt coefficients.
 * @param {bigint[]} b - Second sequence of BigInt coefficients.
 * @param {object} [options] - Optional configuration.
 * @param {'full'|'same'|'valid'} [options.mode='full'] - Output slice mode:
 *   - `'full'`: full convolution of length `a.length + b.length - 1`.
 *   - `'same'`: central slice of length `Math.max(a.length, b.length)`.
 *   - `'valid'`: fully overlapping slice of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`.
 * @param {bigint} [options.scale=1n] - Positive BigInt fixed-point scale divisor
 *   (e.g., `10n ** 18n` for 10^18-scaled fixed-point inputs; defaults to `1n` for
 *   exact unscaled integer convolution).
 * @returns {bigint[]} The resulting convolved sequence of BigInt values.
 * @throws {TypeError} If `a` or `b` is not an Array of BigInts, `options` is not a plain object,
 *   or `options.scale` is not a BigInt.
 * @throws {RangeError} If `options.mode` is unsupported or `options.scale <= 0n`.
 */
export function convolutionBigIntSeries(a, b, options = {}) {
	validateBigIntArray(a, 'a');
	validateBigIntArray(b, 'b');

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { mode = 'full', scale = 1n } = options;

	if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
		throw new RangeError(`options.mode must be one of "full", "same", or "valid"`);
	}

	if (typeof scale !== 'bigint') {
		throw new TypeError(`options.scale must be a BigInt, got ${typeof scale}`);
	}
	if (scale <= 0n) {
		throw new RangeError('options.scale must be a positive BigInt (> 0n)');
	}

	const m = a.length;
	const n = b.length;

	if (m === 0 || n === 0) {
		return [];
	}

	const fullLen = m + n - 1;

	let maxA = 0n;
	for (let i = 0; i < m; i++) {
		const abs = a[i] < 0n ? -a[i] : a[i];
		if (abs > maxA) maxA = abs;
	}

	let maxB = 0n;
	for (let j = 0; j < n; j++) {
		const abs = b[j] < 0n ? -b[j] : b[j];
		if (abs > maxB) maxB = abs;
	}

	/** @type {bigint[]} */
	let full;

	if (maxA === 0n || maxB === 0n) {
		full = new Array(fullLen).fill(0n);
	} else {
		const maxOverlap = BigInt(Math.min(m, n));
		const maxCoeffBound = maxOverlap * maxA * maxB;
		// Guarantee 2^(W - 1) > maxCoeffBound so every |c_k| < 2^(W - 1) with W >= 2.
		const widthBig = BigInt(bitLength(maxCoeffBound) + 1);

		const packedA = packSeries(a, 0, m, widthBig);
		const packedB = packSeries(b, 0, n, widthBig);
		const packedC = packedA * packedB;

		full = new Array(fullLen);
		unpackSeries(packedC, full, 0, fullLen, widthBig);
	}

	let result = full;
	if (mode === 'same') {
		const outLen = Math.max(m, n);
		const start = Math.floor((Math.min(m, n) - 1) / 2);
		result = full.slice(start, start + outLen);
	} else if (mode === 'valid') {
		const minLen = Math.min(m, n);
		const maxLen = Math.max(m, n);
		const start = minLen - 1;
		const outLen = maxLen - minLen + 1;
		result = full.slice(start, start + outLen);
	}

	if (scale !== 1n) {
		for (let k = 0; k < result.length; k++) {
			result[k] = divRoundHalfToEven(result[k], scale);
		}
	}

	return result;
}
