/**
 * Exact-input trigonometric sine over BigInt integer radians, returning a
 * fixed-point BigInt scaled by 10^18.
 *
 * Algorithm & Mathematical Identities:
 * 1. Exact special case and odd symmetry:
 *    - sin(0) = 0
 *    - sin(-x) = -sin(x)
 * 2. High-precision π computation via Machin's formula:
 *    - π / 4 = 4·arctan(1/5) - arctan(1/239)
 *    - arctan(1/m) = Σ_{k=0}^∞ (-1)^k / ((2k + 1) · m^{2k + 1})
 *    Computed to `digits(|x|) + WORK_DECIMALS + PI_EXTRA_DECIMALS` fractional
 *    decimal digits so range reduction modulo 2π preserves full guard precision
 *    even for arbitrarily large |x|. Computed π values (up to a bounded cache
 *    limit) are cached and reused across calls.
 * 3. Range and quadrant reduction:
 *    - Reduce |x| modulo 2π into (-π, π].
 *    - Apply odd symmetry sin(-u) = -sin(u) to map into [0, π].
 *    - Apply reflection identity sin(π - u) = sin(u) to map into [0, π/2].
 * 4. Maclaurin series evaluation at high guard precision (10^42):
 *    - sin(u) = Σ_{k=0}^∞ (-1)^k · u^{2k + 1} / (2k + 1)!
 *    Since u ∈ [0, π/2], terms shrink super-exponentially and converge to 42
 *    decimal digits in ~22 iterations.
 * 5. Round half-away-from-zero from 10^42 down to the 10^18 fixed-point scale.
 */

const OUTPUT_DECIMALS = 18;
const GUARD_DECIMALS = 24;
const WORK_DECIMALS = OUTPUT_DECIMALS + GUARD_DECIMALS; // 42 fractional digits
const PI_RANGE_MARGIN = 8;
const MAX_CACHED_PI_DIGITS = 10_000;

const WORK_SCALE = 10n ** BigInt(WORK_DECIMALS);
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE;
const GUARD_SCALE = 10n ** BigInt(GUARD_DECIMALS);
const HALF_GUARD_SCALE = GUARD_SCALE >> 1n;

let cachedPiDigits = 0;
let cachedPiValue = 0n;

/**
 * Computes fixed-point `floor_approx(scale * arctan(1 / invX))` using the
 * alternating Taylor series for arctan(1 / invX).
 *
 * @param {bigint} invX - Positive integer denominator (e.g., 5n or 239n).
 * @param {bigint} scale - Fixed-point decimal scale (10n ** BigInt(digits)).
 * @returns {bigint} Scaled approximation of arctan(1 / invX).
 */
function atanReciprocal(invX, scale) {
	const invX2 = invX * invX;
	let power = scale / invX;
	let sum = power;
	let k = 1n;

	while (power !== 0n) {
		power /= invX2;
		if (power === 0n) break;
		const term = power / (2n * k + 1n);
		if (term === 0n) break;
		if ((k & 1n) === 1n) {
			sum -= term;
		} else {
			sum += term;
		}
		k += 1n;
	}

	return sum;
}

/**
 * Computes π scaled by 10^digits (rounded to nearest) via Machin's formula:
 * π = 16·arctan(1/5) - 4·arctan(1/239).
 *
 * @param {number} digits - Number of fractional decimal digits required.
 * @returns {bigint} Approximation of π * 10^digits.
 */
function computePi(digits) {
	if (digits <= cachedPiDigits) {
		const diff = cachedPiDigits - digits;
		if (diff === 0) return cachedPiValue;
		const divisor = 10n ** BigInt(diff);
		return (cachedPiValue + (divisor >> 1n)) / divisor;
	}

	const extraDigits = Math.max(12, Math.ceil(Math.log10(digits + 10)) + 8);
	const internalScale = 10n ** BigInt(digits + extraDigits);
	const piInternal =
		16n * atanReciprocal(5n, internalScale) -
		4n * atanReciprocal(239n, internalScale);

	const extraScale = 10n ** BigInt(extraDigits);
	const piRounded = (piInternal + (extraScale >> 1n)) / extraScale;

	if (digits <= MAX_CACHED_PI_DIGITS) {
		cachedPiDigits = digits;
		cachedPiValue = piRounded;
	}

	return piRounded;
}

/**
 * Computes `sin(x)` for an exact BigInt integer `x` (in radians), returning a
 * fixed-point BigInt scaled by `10n ** 18n` (i.e., `round(sin(x) * 10^18)`).
 *
 * @param {bigint} x - Exact integer angle in radians.
 * @returns {bigint} Fixed-point representation of `sin(x) * 10^18`.
 * @throws {TypeError} If `x` is not a BigInt.
 */
export function sinBigIntSeries(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a BigInt, received ${typeof x}`);
	}

	if (x === 0n) {
		return 0n;
	}

	let sign = 1n;
	let ax = x;
	if (ax < 0n) {
		sign = -1n;
		ax = -ax;
	}

	// Compute π with enough fractional digits to absorb |x| during modulo 2π reduction.
	const axDigits = ax.toString().length;
	const piDigits = axDigits + WORK_DECIMALS + PI_RANGE_MARGIN;
	const piScaled = computePi(piDigits);
	const twoPiScaled = piScaled << 1n;

	// Reduce ax modulo 2π into [0, 2π), then into (-π, π].
	const xScaled = ax * (10n ** BigInt(piDigits));
	let rem = xScaled % twoPiScaled;
	if (rem > piScaled) {
		rem -= twoPiScaled;
	}

	// Odd symmetry: sin(-u) = -sin(u) -> map into [0, π].
	if (rem < 0n) {
		sign = -sign;
		rem = -rem;
	}

	// Reflection symmetry: sin(π - u) = sin(u) -> map into [0, π/2].
	const halfPiScaled = piScaled >> 1n;
	if (rem > halfPiScaled) {
		rem = piScaled - rem;
	}

	// Scale reduced argument u down to WORK_SCALE (10^42).
	const shiftScale = 10n ** BigInt(piDigits - WORK_DECIMALS);
	const u = (rem + (shiftScale >> 1n)) / shiftScale;

	if (u === 0n) {
		return 0n;
	}

	// Evaluate Maclaurin series: sin(u) = Σ_{k=0}^∞ (-1)^k u^{2k+1} / (2k+1)!
	const u2 = u * u;
	let term = u;
	let sum = u;
	let k = 1n;

	while (term !== 0n) {
		term = (term * u2) / (WORK_SCALE_SQ * (2n * k) * (2n * k + 1n));
		if (term === 0n) break;
		if ((k & 1n) === 1n) {
			sum -= term;
		} else {
			sum += term;
		}
		k += 1n;
	}

	// Round half-away-from-zero from 10^42 to 10^18.
	const rounded = (sum + HALF_GUARD_SCALE) / GUARD_SCALE;
	return sign < 0n ? -rounded : rounded;
}
