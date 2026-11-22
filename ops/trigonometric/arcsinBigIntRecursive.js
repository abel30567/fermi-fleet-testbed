/**
 * Default fixed-point scaling factor (10^18) for fixed-point BigInt arithmetic.
 * A BigInt value `v` represents the real number `v / SCALE`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Extra internal guard precision factor (24 decimal digits beyond `scale`)
 * to prevent rounding and range-reduction error from affecting the output ULP.
 * @type {bigint}
 */
const GUARD = 10n ** 24n;

/**
 * Computes the bit length of a non-negative BigInt.
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	return n === 0n ? 0 : n.toString(2).length;
}

/**
 * Rounds the exact quotient `num / den` to the nearest BigInt (half away from zero)
 * for non-negative `num` and positive `den`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRound(num, den) {
	return (num + (den >> 1n)) / den;
}

/**
 * Exact integer square root floor(sqrt(n)) for non-negative BigInt `n`,
 * computed via recursive bit-halving divide-and-conquer with Newton-Raphson refinement.
 *
 * At each recursive step, `n` is shifted right by `2k` bits (where `k = floor(bitLength(n) / 4)`),
 * halving the bit-length until reaching a base case (`n < 16n`). Shifting the recursive result
 * left by `k` yields the top half of the square root bits, so a single Newton-Raphson step
 * converges to within +/-1 of floor(sqrt(n)).
 *
 * @param {bigint} n Non-negative BigInt.
 * @returns {bigint} Exact floor(sqrt(n)).
 */
function isqrtRecursive(n) {
	if (n < 16n) {
		if (n === 0n) return 0n;
		if (n < 4n) return 1n;
		if (n < 9n) return 2n;
		return 3n;
	}

	const k = BigInt(bitLength(n) >> 2);
	const hi = n >> (k << 1n);
	const x0 = isqrtRecursive(hi) << k;
	let x1 = (x0 + n / x0) >> 1n;

	while (x1 * x1 > n) {
		x1 -= 1n;
	}
	while ((x1 + 1n) * (x1 + 1n) <= n) {
		x1 += 1n;
	}
	return x1;
}

/**
 * Divide-and-conquer binary splitting evaluation of the arcsin Taylor series:
 *   arcsin(p / q) = (p / q) * sum_{k=0}^{N-1} prod_{j=1}^{k} ((2j - 1)^2 * p^2) / (2j * (2j + 1) * q^2)
 *
 * For interval [left, right), returns { P, Q, T } satisfying:
 *   P = prod_{k=left}^{right-1} a(k)
 *   Q = prod_{k=left}^{right-1} b(k)
 *   T / Q = sum_{k=left}^{right-1} prod_{j=left}^{k} (a(j) / b(j))
 * where a(0) = b(0) = 1, and for k >= 1:
 *   a(k) = (2k - 1)^2 * p^2
 *   b(k) = 2k * (2k + 1) * q^2
 *
 * @param {number} left Inclusive start term index.
 * @param {number} right Exclusive end term index (right > left).
 * @param {bigint} p2 Square of numerator (p^2).
 * @param {bigint} q2 Square of denominator (q^2).
 * @returns {{ P: bigint, Q: bigint, T: bigint }}
 */
function binarySplitArcsin(left, right, p2, q2) {
	if (right - left === 1) {
		if (left === 0) {
			return { P: 1n, Q: 1n, T: 1n };
		}
		const k = BigInt(left);
		const twoK = k << 1n;
		const odd = twoK - 1n;
		const a = odd * odd * p2;
		const b = twoK * (twoK + 1n) * q2;
		return { P: a, Q: b, T: a };
	}

	const mid = left + ((right - left) >> 1);
	const leftRes = binarySplitArcsin(left, mid, p2, q2);
	const rightRes = binarySplitArcsin(mid, right, p2, q2);

	return {
		P: leftRes.P * rightRes.P,
		Q: leftRes.Q * rightRes.Q,
		T: leftRes.T * rightRes.Q + leftRes.P * rightRes.T,
	};
}

/**
 * Evaluates arcsin(xW / W) * W for 0 <= xW <= W / 32 using binary-splitting Taylor series.
 * Because (xW / W)^2 <= 2^-10, each term decays by at least 10 bits, so
 * ceil(bitLength(W) / 10) + 3 terms guarantee truncation error << 1 / W.
 *
 * @param {bigint} xW Fixed-point input in [0, W / 32].
 * @param {bigint} W Internal working scale.
 * @returns {bigint}
 */
function arcsinSmallBinarySplit(xW, W) {
	if (xW === 0n) return 0n;
	const terms = Math.ceil(bitLength(W) / 10) + 3;
	const { Q, T } = binarySplitArcsin(0, terms, xW * xW, W * W);
	return divRound(xW * T, Q);
}

/**
 * Recursively computes arcsin(xW / W) * W for 0 <= xW <= W using the exact
 * half-angle reduction identity:
 *   arcsin(x) = 2 * arcsin(x / sqrt(2 * (1 + sqrt(1 - x^2))))
 *
 * This form avoids catastrophic cancellation across the entire interval [0, 1],
 * including x = 1 and values arbitrarily close to 1. At most 6 recursive steps
 * reduce any x in [0, 1] into [0, 1/32], where divide-and-conquer binary splitting
 * evaluates the Maclaurin series rapidly to full working precision.
 *
 * @param {bigint} xW Fixed-point input scaled by W, with 0 <= xW <= W.
 * @param {bigint} W Internal working scale.
 * @returns {bigint} Fixed-point arcsin(xW / W) scaled by W.
 */
function arcsinHalfAngleRecursive(xW, W) {
	if (xW === 0n) return 0n;
	if (xW * 32n <= W) {
		return arcsinSmallBinarySplit(xW, W);
	}

	const c = isqrtRecursive(W * W - xW * xW);
	const d = isqrtRecursive(2n * W * (W + c));
	const xHalf = divRound(xW * W, d);
	return arcsinHalfAngleRecursive(xHalf, W) << 1n;
}

/**
 * Computes the inverse sine (arcsin) over exact fixed-point BigInt values using a
 * genuinely recursive and divide-and-conquer algorithm.
 *
 * Representation:
 * - Input `x` represents the real number `x / scale` in the domain `[-1, 1]`
 *   (i.e. `-scale <= x <= scale`).
 * - Output is a BigInt representing `arcsin(x / scale) * scale` in radians,
 *   lying in `[-pi/2 * scale, +pi/2 * scale]`, rounded to the nearest integer.
 * - Default scaling is `SCALE = 10n ** 18n` (18 decimal places).
 *
 * Algorithm:
 * 1. Exploits odd symmetry: `arcsin(-x) = -arcsin(x)`.
 * 2. Lifts `x` to an internal working scale `W = scale * 10^24` (24 extra guard digits).
 * 3. Applies recursive half-angle range reduction:
 *    `arcsin(x) = 2 * arcsin(x / sqrt(2 * (1 + sqrt(1 - x^2))))`
 *    using a recursive bit-halving integer square root (`isqrtRecursive`) until `x <= 1/32`.
 * 4. Evaluates the Maclaurin series at the reduced argument via divide-and-conquer
 *    binary splitting (`binarySplitArcsin`), then rounds back to `scale`.
 *
 * @param {bigint} x Fixed-point input scaled by `scale`, with `-scale <= x <= scale`.
 * @param {bigint} [scale=SCALE] Positive BigInt fixed-point scaling factor (default `10n ** 18n`).
 * @returns {bigint} Fixed-point `arcsin(x / scale)` in radians, scaled by `scale`.
 * @throws {TypeError} If `x` or `scale` is not a BigInt.
 * @throws {RangeError} If `scale <= 0n` or `|x| > scale` (outside domain `[-1, 1]`).
 */
export function arcsinBigIntRecursive(x, scale = SCALE) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a bigint, got ${typeof x}`);
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`Expected scale to be a bigint, got ${typeof scale}`);
	}
	if (scale <= 0n) {
		throw new RangeError('scale must be a positive bigint');
	}
	if (x < -scale || x > scale) {
		throw new RangeError(
			`Domain error: x must satisfy -scale <= x <= scale (got ${x} with scale ${scale})`
		);
	}

	if (x === 0n) {
		return 0n;
	}

	const negative = x < 0n;
	const absX = negative ? -x : x;

	const W = scale * GUARD;
	const xW = absX * GUARD;
	const resultW = arcsinHalfAngleRecursive(xW, W);
	const rounded = divRound(resultW, GUARD);

	return negative ? -rounded : rounded;
}
