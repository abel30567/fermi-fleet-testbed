const SCALE = 10n ** 18n;
const GUARD = 10n ** 18n;
const WORK_SCALE = SCALE * GUARD;

/**
 * Computes floor-approximated `arctan(1 / k) * workScale` iteratively using
 * the alternating Taylor series:
 *   arctan(1 / k) = 1/k - 1/(3*k^3) + 1/(5*k^5) - ...
 *
 * Converges rapidly for any integer k >= 2.
 *
 * @param {bigint} k - Positive integer denominator (k >= 2n).
 * @param {bigint} workScale - Fixed-point scaling factor (includes guard digits).
 * @returns {bigint} Scaled approximation of arctan(1 / k).
 */
function arctanReciprocal(k, workScale) {
	let power = workScale / k;
	if (power === 0n) {
		return 0n;
	}

	const k2 = k * k;
	let sum = power;
	let denom = 1n;
	let sign = -1n;

	while (power > 0n) {
		power /= k2;
		denom += 2n;
		const term = power / denom;
		if (term === 0n) {
			break;
		}
		sum += sign * term;
		sign = -sign;
	}

	return sum;
}

// Compute pi/4 and pi/2 at full working precision via Machin's formula:
//   pi/4 = 4 * arctan(1/5) - arctan(1/239)
const PI_OVER_4_WORK =
	4n * arctanReciprocal(5n, WORK_SCALE) - arctanReciprocal(239n, WORK_SCALE);
const PI_OVER_2_WORK = 2n * PI_OVER_4_WORK;

/**
 * Computes the trigonometric arctangent `arctan(x)` for an exact BigInt integer `x`,
 * returning a fixed-point BigInt scaled by `10^18` (rounded to nearest integer).
 *
 * Uses a straightforward iterative implementation over pure BigInt arithmetic:
 * - `arctan(0) = 0`
 * - `arctan(-x) = -arctan(x)`
 * - `arctan(1) = pi/4` (computed iteratively via Machin's formula)
 * - For `|x| >= 2`: `arctan(|x|) = pi/2 - arctan(1 / |x|)` using the
 *   alternating Taylor series for `arctan(1 / |x|)`.
 *
 * @param {bigint} x - Exact BigInt integer input.
 * @returns {bigint} Fixed-point BigInt representation of `arctan(x) * 10^18`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function arctanBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`);
	}

	if (x === 0n) {
		return 0n;
	}

	const negative = x < 0n;
	const absX = negative ? -x : x;

	const rawWork =
		absX === 1n
			? PI_OVER_4_WORK
			: PI_OVER_2_WORK - arctanReciprocal(absX, WORK_SCALE);

	// Round half away from zero from WORK_SCALE down to SCALE (10^18).
	const rounded = (rawWork + GUARD / 2n) / GUARD;

	return negative ? -rounded : rounded;
}
