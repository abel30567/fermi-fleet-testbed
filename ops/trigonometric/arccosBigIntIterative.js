/**
 * Fixed-point scaling factor for inputs and outputs: 10^18.
 * A BigInt value `x` represents the real number `x / 10^18`.
 */
const SCALE = 10n ** 18n;

/**
 * Extra guard-digit factor (10^24) providing 42 total fractional digits during
 * intermediate fixed-point computations so results round accurately to 10^18.
 */
const GUARD = 10n ** 24n;
const HALF_GUARD = GUARD / 2n;
const WORK_SCALE = SCALE * GUARD;
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE;

/**
 * Half-angle reduction threshold (`0.05` in working fixed-point scale).
 * Reducing the arcsin argument below 0.05 ensures the Maclaurin series
 * converges to 42 decimal digits in under 20 iterations.
 */
const REDUCE_THRESHOLD = WORK_SCALE / 20n;

/**
 * Computes the exact integer square root floor(sqrt(n)) for a non-negative BigInt
 * using iterative Newton-Raphson.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} floor(sqrt(n)).
 */
function isqrt(n) {
	if (n < 2n) {
		return n;
	}
	let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
	while (true) {
		const next = (x + n / x) >> 1n;
		if (next >= x) {
			return x;
		}
		x = next;
	}
}

/**
 * Computes arcsin(s / WORK_SCALE) * WORK_SCALE iteratively for `0n <= s <= WORK_SCALE`.
 *
 * Uses iterative half-angle reduction via the cancellation-free identity
 * `sin(theta / 2) = s / sqrt(2 * (1 + sqrt(1 - s^2)))` until `s <= 0.05`,
 * then evaluates the Maclaurin series
 * `arcsin(s) = sum_{n=0..inf} ((2n)! / (4^n * (n!)^2 * (2n + 1))) * s^(2n + 1)`.
 *
 * @param {bigint} s - Non-negative sine value scaled by `WORK_SCALE`.
 * @returns {bigint} Angle in radians scaled by `WORK_SCALE`.
 */
function arcsinWork(s) {
	if (s === 0n) {
		return 0n;
	}

	let current = s;
	let halvings = 0n;

	while (current > REDUCE_THRESHOLD) {
		const cosVal = isqrt((WORK_SCALE - current) * (WORK_SCALE + current));
		const denom = isqrt(2n * (WORK_SCALE + cosVal) * WORK_SCALE);
		current = (current * WORK_SCALE) / denom;
		halvings += 1n;
	}

	const s2 = current * current;
	let sum = current;
	let coeff = current;

	for (let n = 1n; ; n += 1n) {
		const twoN = 2n * n;
		coeff = (coeff * (twoN - 1n) * s2) / (twoN * WORK_SCALE_SQ);
		const term = coeff / (twoN + 1n);
		if (term === 0n) {
			break;
		}
		sum += term;
	}

	return sum << halvings;
}

/**
 * High-precision pi scaled by `WORK_SCALE`, computed iteratively from `6 * arcsin(1/2)`.
 */
const PI_WORK = 6n * arcsinWork(WORK_SCALE / 2n);

/**
 * Computes the inverse cosine `arccos(x)` over fixed-point BigInt values scaled by `10^18`
 * using a straightforward iterative half-angle reduction and Maclaurin series algorithm.
 *
 * For an input `x` representing the real value `u = x / 10^18` in `[-1, 1]`, returns
 * `round(arccos(u) * 10^18)` as a BigInt in `[0, round(pi * 10^18)]`.
 *
 * Method:
 * - For `x >= 0`: uses the exact identity `arccos(u) = 2 * arcsin(sqrt((1 - u) / 2))`,
 *   which avoids precision loss as `u -> 1`.
 * - For `x < 0`: uses symmetry `arccos(u) = pi - arccos(-u)`, avoiding precision loss
 *   as `u -> -1`.
 * - Evaluates `arcsin` iteratively with 24 extra guard digits via half-angle reduction
 *   and the Maclaurin series, then rounds to the nearest `10^18`-scaled BigInt.
 *
 * @param {bigint} x - Fixed-point input scaled by `10^18`, must satisfy `-10^18 <= x <= 10^18`.
 * @returns {bigint} `arccos(x / 10^18)` in radians, scaled by `10^18`.
 * @throws {TypeError} If `x` is not a `bigint`.
 * @throws {RangeError} If `x` is outside `[-10^18, 10^18]`.
 */
export function arccosBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt fixed-point input scaled by 10^18, received ${typeof x}`);
	}
	if (x < -SCALE || x > SCALE) {
		throw new RangeError(`Input ${x} is out of domain [-10^18, 10^18]`);
	}

	if (x === SCALE) {
		return 0n;
	}
	if (x === -SCALE) {
		return (PI_WORK + HALF_GUARD) / GUARD;
	}

	const isNegative = x < 0n;
	const absX = isNegative ? -x : x;

	// Compute s = sqrt((1 - |u|) / 2) in WORK_SCALE:
	// (1 - |u|) / 2 = ((SCALE - absX) * GUARD) / 2n
	const halfOneMinusU = ((SCALE - absX) * GUARD) / 2n;
	const s = isqrt(halfOneMinusU * WORK_SCALE);

	const anglePos = 2n * arcsinWork(s);
	const resultWork = isNegative ? PI_WORK - anglePos : anglePos;

	return (resultWork + HALF_GUARD) / GUARD;
}
