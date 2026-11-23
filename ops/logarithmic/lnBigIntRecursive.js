/**
 * Fixed-point scale factor (10^18) for non-integer natural logarithm results.
 */
const SCALE_DIGITS = 18;

/**
 * Recursively finds an upper bound power-of-two shift such that (n >> shift) === 0n.
 *
 * @param {bigint} n - Positive BigInt value.
 * @param {bigint} shift - Current power-of-two shift candidate.
 * @returns {bigint} Upper bound shift strictly greater than floor(log2(n)).
 */
function findShiftUpperBound(n, shift) {
	if ((n >> shift) === 0n) {
		return shift;
	}
	return findShiftUpperBound(n, shift << 1n);
}

/**
 * Recursively bisects [lo, hi] to find the exact bit length of a positive BigInt.
 * Invariant: (n >> lo) > 0n and (n >> hi) === 0n.
 *
 * @param {bigint} n - Positive BigInt value.
 * @param {bigint} lo - Lower bound bit shift.
 * @param {bigint} hi - Upper bound bit shift.
 * @returns {bigint} Exact number of bits required to represent n.
 */
function bisectBitLength(n, lo, hi) {
	if (hi - lo <= 1n) {
		return hi;
	}
	const mid = (lo + hi) >> 1n;
	if ((n >> mid) > 0n) {
		return bisectBitLength(n, mid, hi);
	}
	return bisectBitLength(n, lo, mid);
}

/**
 * Computes the bit length of a positive BigInt using recursive divide-and-conquer.
 *
 * @param {bigint} n - Positive BigInt value.
 * @returns {bigint} Bit length floor(log2(n)) + 1.
 */
function bitLengthRecursive(n) {
	const hi = findShiftUpperBound(n, 1n);
	const lo = hi === 1n ? 0n : hi >> 1n;
	return bisectBitLength(n, lo, hi);
}

/**
 * Recursive divide-and-conquer binary splitting for the odd-denominator power series:
 *
 *   F(start, end) = sum_{j = start}^{end - 1} (1 / (2j + 1)) * (x / y)^(j - start)
 *
 * Returns exact BigInt integers { D, X, Y, T } satisfying:
 *   D = prod_{j = start}^{end - 1} (2j + 1)
 *   X = x^(end - start)
 *   Y = y^(end - start)
 *   T = D * y^(end - start - 1) * F(start, end)
 *
 * @param {bigint} x - Numerator squared (p^2).
 * @param {bigint} y - Denominator squared (q^2).
 * @param {number} start - Inclusive starting term index.
 * @param {number} end - Exclusive ending term index (end > start).
 * @returns {{ D: bigint, X: bigint, Y: bigint, T: bigint }}
 */
function artanhBinarySplit(x, y, start, end) {
	if (end - start === 1) {
		return {
			D: BigInt(2 * start + 1),
			X: x,
			Y: y,
			T: 1n,
		};
	}

	const mid = (start + end) >> 1;
	const left = artanhBinarySplit(x, y, start, mid);
	const right = artanhBinarySplit(x, y, mid, end);

	return {
		D: left.D * right.D,
		X: left.X * right.X,
		Y: left.Y * right.Y,
		T: left.T * right.D * right.Y + left.D * left.X * right.T,
	};
}

/**
 * Computes round(2 * artanh(p / q) * scale) using recursive binary splitting.
 *
 * Because artanh(p / q) = (p / q) * F(0, terms) with x = p^2, y = q^2:
 *   2 * artanh(p / q) = 2 * (p / q) * (T / (D * Y / q^2)) = (2 * p * q * T) / (D * Y)
 *
 * @param {bigint} p - Non-negative rational numerator (0 <= p < q).
 * @param {bigint} q - Positive rational denominator.
 * @param {number} terms - Number of series terms to evaluate (>= 1).
 * @param {bigint} scale - Fixed-point working scale factor.
 * @returns {bigint} Scaled fixed-point approximation of 2 * artanh(p / q).
 */
function twoArtanhScaled(p, q, terms, scale) {
	if (p === 0n) {
		return 0n;
	}
	const { D, Y, T } = artanhBinarySplit(p * p, q * q, 0, terms);
	const numerator = 2n * p * q * T * scale;
	const denominator = D * Y;
	return (numerator + (denominator >> 1n)) / denominator;
}

/**
 * Computes the natural logarithm ln(n) of a positive BigInt integer, returning a
 * fixed-point BigInt scaled by 10^18 (rounded to the nearest integer).
 *
 * Uses a recursive / divide-and-conquer strategy with exact BigInt arithmetic:
 * 1. Recursive exponential search + binary search to extract k = floor(log2(n)).
 * 2. Range reduction to m = n / 2^k in [1 / sqrt(2), sqrt(2)], so
 *    ln(n) = k * ln(2) + ln(m) and |u| = |(m - 1) / (m + 1)| <= (sqrt(2) - 1)^2 < 0.172.
 * 3. Recursive binary splitting to evaluate 2 * artanh(u) for both ln(2) = 2 * artanh(1/3)
 *    and ln(m) = 2 * artanh((m - 1) / (m + 1)) with adaptive guard precision.
 *
 * @param {bigint} n - A strictly positive BigInt integer (n > 0n).
 * @returns {bigint} Fixed-point BigInt representing round(ln(n) * 10^18).
 * @throws {TypeError} If n is not a BigInt.
 * @throws {RangeError} If n <= 0n.
 */
export function lnBigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`);
	}
	if (n <= 0n) {
		throw new RangeError(`Natural logarithm requires a positive BigInt (n > 0n), received ${n}n`);
	}
	if (n === 1n) {
		return 0n;
	}

	// Step 1: Recursive divide-and-conquer bit length to get k = floor(log2(n)).
	let k = bitLengthRecursive(n) - 1n;

	// Adaptive working precision: 18 output digits + enough guard digits to absorb
	// multiplication by k and series/rounding errors.
	const kDigits = k > 0n ? k.toString().length : 1;
	const guardDigits = 20 + kDigits;
	const workDigits = SCALE_DIGITS + guardDigits;
	const workScale = 10n ** BigInt(workDigits);
	const guardScale = 10n ** BigInt(guardDigits);

	// Represent m = n / 2^k in binary fixed-point with F fractional bits such that
	// 2^(-F) << 10^(-workDigits).
	const fracBits = Math.ceil(workDigits * 3.35) + 8;
	const fracBitsBig = BigInt(fracBits);
	const one = 1n << fracBitsBig;

	let shift = fracBitsBig - k;
	let mFixed;
	if (shift >= 0n) {
		mFixed = n << shift;
	} else {
		const rightShift = -shift;
		mFixed = (n + (1n << (rightShift - 1n))) >> rightShift;
	}

	// Step 2: If m > sqrt(2) (equivalently mFixed^2 > 2 * 2^(2 * fracBits)),
	// divide m by 2 and increment k so m lies in [1 / sqrt(2), sqrt(2)].
	const twoSquaredScale = 1n << BigInt(2 * fracBits + 1);
	if (mFixed * mFixed > twoSquaredScale) {
		k += 1n;
		mFixed = (mFixed + 1n) >> 1n;
	}

	// Step 3: Evaluate ln(2) = 2 * artanh(1/3) via recursive binary splitting.
	// Since (1/3)^2 = 1/9 and 1 / log10(9) < 1.05, this guarantees tail < 10^-(workDigits + 3).
	const ln2Terms = Math.ceil((workDigits + 3) * 1.05) + 2;
	const ln2Work = twoArtanhScaled(1n, 3n, ln2Terms, workScale);

	// Step 4: Evaluate ln(m) = 2 * artanh((m - 1) / (m + 1)) via recursive binary splitting.
	// Since |u| <= (sqrt(2) - 1)^2, 1 / log10(1 / u^2) < 0.66, guaranteeing tail < 10^-(workDigits + 3).
	const negative = mFixed < one;
	const p = negative ? one - mFixed : mFixed - one;
	const q = mFixed + one;
	let lnMWork = 0n;
	if (p !== 0n) {
		const lnMTerms = Math.ceil((workDigits + 3) * 0.66) + 2;
		lnMWork = twoArtanhScaled(p, q, lnMTerms, workScale);
	}

	const totalWork = k * ln2Work + (negative ? -lnMWork : lnMWork);
	return (totalWork + (guardScale >> 1n)) / guardScale;
}
