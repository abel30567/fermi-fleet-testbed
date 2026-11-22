const SCALE = 10n ** 18n
const MIN_WORK_BITS = 64n
const GUARD_BITS = 32n

/**
 * Returns the bit length of a positive BigInt `x > 0n`, i.e., the unique
 * integer `k >= 1` satisfying `2^(k - 1) <= x < 2^k`.
 *
 * @param {bigint} x - Positive BigInt integer.
 * @returns {bigint} Bit length of `x`.
 */
function bitLength(x) {
	return BigInt(x.toString(2).length)
}

/**
 * Computes fixed-point division `a / b` over exact BigInt integers, returning
 * the result scaled by `10^18` (`10n ** 18n`) and rounded half-away-from-zero
 * to the nearest integer.
 *
 * **Rounding convention (half-away-from-zero):**
 * Returns `sign(a / b) * floor((|a| * 10^18) / |b| + 1/2)`.
 * Exact midpoints (`2 * (|a| * 10^18 mod |b|) === |b|`) round away from zero
 * (e.g., `+0.5` rounds to `+1n`, `-0.5` rounds to `-1n`).
 *
 * **Algorithm / Identity (Goldschmidt Geometric-Series Reciprocal):**
 * Let `N = |a| * 10^18` and `D = |b|` with bit length `k = bitLength(D)`, so
 * `d = D / 2^k ∈ [1/2, 1)` and `r = 1 - d ∈ (0, 1/2]`. By the Euler product /
 * Goldschmidt geometric-series identity:
 *
 *   1 / d = 1 / (1 - r) = ∑_{j=0}^{∞} r^j = ∏_{i=0}^{∞} (1 + r^(2^i))
 *
 * We evaluate this product in fixed-point binary arithmetic with working
 * precision `W = max(64, max(0, bitLength(N) - k + 1) + 32)` fractional bits
 * (quadratic convergence in `O(log W)` iterations, using only shifts,
 * multiplications, and additions/subtractions — no native BigInt division).
 * Because `dFixed >= d` and truncation floors each factor, the initial
 * estimate `q = (N * x) >> (W + k)` satisfies `floor(N / D) - 1 <= q <= floor(N / D)`.
 * A final exact residual check `rem = N - q * D` guarantees exact Euclidean
 * division (`0 <= rem < D`) and exact half-away-from-zero rounding (0 ulp error).
 *
 * @param {bigint} a - Dividend (exact BigInt integer).
 * @param {bigint} b - Divisor (exact non-zero BigInt integer).
 * @returns {bigint} Fixed-point quotient `round((a / b) * 10^18)` (half-away-from-zero).
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `b === 0n` (division by zero).
 */
export function divideBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend 'a' to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected divisor 'b' to be a bigint, got ${typeof b}`)
	}
	if (b === 0n) {
		throw new RangeError("Division by zero: divisor 'b' must be non-zero")
	}

	if (a === 0n) {
		return 0n
	}

	const negative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	const numerator = absA * SCALE
	const denominator = absB

	const numBits = bitLength(numerator)
	const denBits = bitLength(denominator)

	// Working precision W must exceed the quotient's bit length plus guard bits.
	const quotientBits = numBits >= denBits ? numBits - denBits + 1n : 0n
	const workBits =
		quotientBits + GUARD_BITS > MIN_WORK_BITS
			? quotientBits + GUARD_BITS
			: MIN_WORK_BITS

	const one = 1n << workBits

	// Normalize D into dFixed ≈ (D / 2^denBits) * 2^workBits ∈ [2^(W-1), 2^W],
	// rounding up when right-shifting so dFixed / 2^W >= D / 2^denBits.
	const shift = workBits - denBits
	const dFixed =
		shift >= 0n ? denominator << shift : (denominator >> -shift) + 1n

	// Goldschmidt geometric-series product for 1 / d = ∏_{i>=0} (1 + r^(2^i)),
	// where r = 1 - d ∈ [0, 1/2].
	let x = one
	let r = one - dFixed
	while (r > 0n) {
		x = (x * (one + r)) >> workBits
		r = (r * r) >> workBits
	}

	// Initial quotient estimate from scaled reciprocal x ≈ 2^workBits / d.
	let q = (numerator * x) >> (workBits + denBits)

	// Exact residual verification ensuring 0 <= rem < denominator.
	let rem = numerator - q * denominator
	while (rem >= denominator) {
		q += 1n
		rem -= denominator
	}
	while (rem < 0n) {
		q -= 1n
		rem += denominator
	}

	// Round half away from zero: increment when rem / denominator >= 1/2.
	if ((rem << 1n) >= denominator) {
		q += 1n
	}

	return negative && q !== 0n ? -q : q
}
