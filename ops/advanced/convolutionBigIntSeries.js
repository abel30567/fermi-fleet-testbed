const DEFAULT_FIXED_POINT_SCALE = 10n ** 18n;

/**
 * Returns the exact bit length of a non-negative BigInt (0n for 0n,
 * otherwise the smallest integer b >= 1 such that n < 2^b).
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bitLength(n) {
	if (n === 0n) return 0n;
	const hex = n.toString(16);
	const topNibble = Number.parseInt(hex[0], 16);
	const topBits = 32 - Math.clz32(topNibble);
	return BigInt(hex.length - 1) * 4n + BigInt(topBits);
}

/**
 * Evaluates a signed polynomial P(x) = sum_{i=start}^{end-1} coeffs[i] * x^(i - start)
 * at x = 2^wordBits using divide-and-conquer binary splitting.
 *
 * @param {readonly bigint[]} coeffs
 * @param {number} start
 * @param {number} end
 * @param {bigint} wordBits
 * @returns {bigint}
 */
function packSignedPolynomial(coeffs, start, end, wordBits) {
	const len = end - start;
	if (len === 1) return coeffs[start];
	if (len === 2) return coeffs[start] + (coeffs[start + 1] << wordBits);
	const mid = start + (len >> 1);
	const low = packSignedPolynomial(coeffs, start, mid, wordBits);
	const high = packSignedPolynomial(coeffs, mid, end, wordBits);
	return low + (high << (wordBits * BigInt(mid - start)));
}

/**
 * Extracts signed coefficients c[start..end-1] from the packed integer
 * R = sum_{k=0}^{len-1} c[start + k] * 2^(wordBits * k), where every
 * |c[i]| < 2^(wordBits - 1) and wordBits >= 2n, using balanced binary splitting.
 *
 * Because |c[i]| <= 2^(wordBits - 1) - 1, any partial lower block of m coefficients
 * satisfies |R_low| <= (2^(wordBits - 1) - 1) * (2^(wordBits * m) - 1) / (2^wordBits - 1)
 * < 2^(wordBits * m - 1), guaranteeing unique balanced recovery at every split.
 *
 * @param {bigint} value
 * @param {bigint[]} out
 * @param {number} start
 * @param {number} end
 * @param {bigint} wordBits
 */
function unpackSignedPolynomial(value, out, start, end, wordBits) {
	const len = end - start;
	if (value === 0n) {
		out.fill(0n, start, end);
		return;
	}
	if (len === 1) {
		out[start] = value;
		return;
	}
	const mid = start + (len >> 1);
	const shift = wordBits * BigInt(mid - start);
	let high = value >> shift;
	let low = value - (high << shift);
	if (low >> (shift - 1n) !== 0n) {
		high += 1n;
		low -= 1n << shift;
	}
	unpackSignedPolynomial(low, out, start, mid, wordBits);
	unpackSignedPolynomial(high, out, mid, end, wordBits);
}

/**
 * Computes round-half-away-from-zero of (numerator / denominator) for exact BigInts.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator - Must be non-zero.
 * @returns {bigint}
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	if (numerator === 0n) return 0n;
	const negative = (numerator < 0n) !== (denominator < 0n);
	const absNum = numerator < 0n ? -numerator : numerator;
	const absDen = denominator < 0n ? -denominator : denominator;
	const quotient = (absNum * 2n + absDen) / (absDen * 2n);
	return negative ? -quotient : quotient;
}

/**
 * Validates that an input is an array of BigInt values and computes its max magnitude.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {bigint} Maximum absolute value across all elements (0n if empty).
 */
function validateBigIntArray(value, name) {
	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be an Array of BigInt values`);
	}
	let maxAbs = 0n;
	for (let i = 0; i < value.length; i++) {
		const item = value[i];
		if (typeof item !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a bigint, received ${typeof item}`);
		}
		const abs = item < 0n ? -item : item;
		if (abs > maxAbs) maxAbs = abs;
	}
	return maxAbs;
}

/**
 * Computes the exact discrete convolution (Cauchy product of formal power series /
 * polynomials) of two arbitrary-precision BigInt sequences:
 *
 *   (a * b)[n] = sum_{k = max(0, n - M + 1)}^{min(n, N - 1)} a[k] * b[n - k]
 *
 * for 0 <= n <= N + M - 2, where N = a.length and M = b.length.
 * Returns an empty array `[]` if either input array is empty.
 *
 * Algorithm:
 * Uses signed Kronecker substitution (the generating-function identity
 * A(B) * B_poly(B) = (A * B_poly)(B) at base B = 2^W) with divide-and-conquer
 * binary splitting for both packing and balanced-base unpacking. The bit width
 * W = bitLength(min(N, M) * max(|a|) * max(|b|)) + 1 guarantees that every output
 * coefficient c[n] satisfies |c[n]| < 2^(W - 1), enabling exact recovery for
 * arbitrary-magnitude positive and negative BigInts with a single BigInt product.
 *
 * When `options.normalized` is `true`, each output coefficient is divided by the
 * kernel sum `sum(b)` and scaled by `options.scale` (default `10n ** 18n` fixed-point),
 * rounded half away from zero.
 *
 * @param {readonly bigint[]} a - First sequence of BigInt coefficients.
 * @param {readonly bigint[]} b - Second sequence (kernel) of BigInt coefficients.
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.normalized=false] - If true, normalize output by sum(b) in fixed-point BigInt scaled by `scale`.
 * @param {bigint} [options.scale=1000000000000000000n] - Positive BigInt fixed-point scale used when `normalized` is true (defaults to 10^18).
 * @returns {bigint[]} Exact discrete convolution sequence (or fixed-point normalized sequence when `normalized: true`).
 * @throws {TypeError} If `a` or `b` is not an array of BigInts, or if `options` fields have invalid types.
 * @throws {RangeError} If `options.scale <= 0n`, or if `options.normalized` is true and `sum(b) === 0n` on non-empty inputs.
 */
export function convolutionBigIntSeries(a, b, options) {
	const maxA = validateBigIntArray(a, 'a');
	const maxB = validateBigIntArray(b, 'b');

	let normalized = false;
	let scale = DEFAULT_FIXED_POINT_SCALE;

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be a plain object');
		}
		if (options.normalized !== undefined) {
			if (typeof options.normalized !== 'boolean') {
				throw new TypeError('options.normalized must be a boolean');
			}
			normalized = options.normalized;
		}
		if (options.scale !== undefined) {
			if (typeof options.scale !== 'bigint') {
				throw new TypeError('options.scale must be a bigint');
			}
			if (options.scale <= 0n) {
				throw new RangeError('options.scale must be a positive bigint');
			}
			scale = options.scale;
		}
	}

	const n = a.length;
	const m = b.length;
	if (n === 0 || m === 0) {
		return [];
	}

	let sumB = 0n;
	if (normalized) {
		for (let j = 0; j < m; j++) {
			sumB += b[j];
		}
		if (sumB === 0n) {
			throw new RangeError('Cannot normalize convolution when the sum of kernel b is zero');
		}
	}

	const outLen = n + m - 1;
	const result = new Array(outLen);

	if (maxA === 0n || maxB === 0n) {
		result.fill(0n);
		return result;
	}

	const maxTerms = BigInt(n < m ? n : m);
	const cMax = maxTerms * maxA * maxB;
	const wordBits = bitLength(cMax) + 1n;

	const packedA = packSignedPolynomial(a, 0, n, wordBits);
	const packedB = packSignedPolynomial(b, 0, m, wordBits);
	const product = packedA * packedB;

	unpackSignedPolynomial(product, result, 0, outLen, wordBits);

	if (normalized) {
		for (let i = 0; i < outLen; i++) {
			result[i] = divRoundHalfAwayFromZero(result[i] * scale, sumB);
		}
	}

	return result;
}
