const SCALE = 10n ** 18n;
const SCALE_CUBED = SCALE ** 3n;
const GUARD = 10n ** 18n;
const HALF_GUARD = GUARD / 2n;
const WORK_SCALE_CUBED = (SCALE * GUARD) ** 3n;

/**
 * Computes the exact bit length of a positive BigInt.
 *
 * @param {bigint} value - Positive BigInt integer.
 * @returns {number} Number of bits required to represent `value`.
 */
function bitLength(value) {
	const hex = value.toString(16);
	const topNibble = Number.parseInt(hex[0], 16);
	const topBits = 32 - Math.clz32(topNibble);
	return (hex.length - 1) * 4 + topBits;
}

/**
 * Computes the cube root of an exact BigInt integer `n`, returning a fixed-point
 * BigInt scaled by `10^18` representing `round(∛n * 10^18)`.
 *
 * Algorithm / Mathematical Identities:
 * 1. Odd symmetry: `∛(-n) = -∛n` with `∛0 = 0`.
 * 2. Fixed-point scaling with guard digits: `∛|n| * 10^36 = ∛(|n| * 10^108)`,
 *    providing 18 guard digits beyond the `10^18` output scale.
 * 3. Range reduction: Using the bit-length decomposition `M = |n| * 10^108 ≈ (c * 2^q)^3`
 *    followed by two iterations of Halley's rational cube-root identity
 *    `r_{k+1} = r_k * (r_k^3 + 2M) / (2r_k^3 + M)`, we obtain an anchor `r`
 *    with `|x| = |(M - r^3) / r^3| < 10^-8`.
 * 4. Generalized binomial Taylor series: Writing `M = r^3 + d` with `x = d / r^3`,
 *    `M^(1/3) = r * (1 + x)^(1/3) = r * Σ_{k=0}^∞ C(1/3, k) x^k`,
 *    evaluated via the exact term recurrence
 *    `T_0 = r`, `T_k = T_{k-1} * ((4 - 3k) * d) / (3k * r^3)` until `T_k === 0n`.
 * 5. Exact nearest-integer rounding at `10^18` scale verified against the
 *    exact midpoint cube inequality `(2s - 1)^3 < 8 * |n| * 10^54 < (2s + 1)^3`.
 *
 * @param {bigint} n - Exact BigInt integer (negative, zero, or positive).
 * @returns {bigint} Fixed-point BigInt equal to `round(∛n * 10^18)`.
 * @throws {TypeError} If `n` is not a `bigint`.
 */
export function cbrtBigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`);
	}

	if (n === 0n) {
		return 0n;
	}

	const isNegative = n < 0n;
	const absN = isNegative ? -n : n;

	// Scale M = |n| * (10^36)^3 so ∛M = ∛|n| * 10^36 (18 output + 18 guard digits).
	const M = absN * WORK_SCALE_CUBED;

	// Coarse bit-length anchor r0 within ~12.5% relative error of ∛M.
	const bits = bitLength(M);
	const q = Math.floor((bits - 1) / 3);
	const rem = (bits - 1) % 3;

	let r;
	if (rem === 0) {
		r = 9n << BigInt(q - 3);
	} else if (rem === 1) {
		r = 45n << BigInt(q - 5);
	} else {
		r = 57n << BigInt(q - 5);
	}

	// Two cubic-convergence Halley rational steps reduce |d / r^3| below 10^-8.
	for (let i = 0; i < 2; i += 1) {
		const r3 = r * r * r;
		r = (r * (r3 + 2n * M)) / (2n * r3 + M);
	}

	// Generalized binomial Taylor series: M^(1/3) = r * Σ C(1/3, k) * (d / r^3)^k.
	const r3 = r * r * r;
	const d = M - r3;

	let sum = r;
	let term = r;
	for (let k = 1n; term !== 0n; k += 1n) {
		term = (term * (4n - 3n * k) * d) / (3n * k * r3);
		sum += term;
	}

	// Round from 10^36 working scale to 10^18 output scale.
	let result = (sum + HALF_GUARD) / GUARD;

	// Exact nearest-integer verification: (2s - 1)^3 < 8 * |n| * 10^54 < (2s + 1)^3.
	const target8 = (absN * SCALE_CUBED) << 3n;
	while ((2n * result + 1n) ** 3n <= target8) {
		result += 1n;
	}
	while (result > 0n && (2n * result - 1n) ** 3n > target8) {
		result -= 1n;
	}

	return isNegative ? -result : result;
}
