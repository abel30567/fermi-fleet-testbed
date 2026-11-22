/**
 * Initial exponent shift (an even power of two) used for divide-and-conquer
 * range reduction by exact powers of four (`2 ** shift = 4 ** (shift / 2)`).
 * `2 ** 512` (~1.34e154) and `2 ** -512` (~7.46e-155) are both normal IEEE-754
 * float64 values, ensuring exact scaling without overflow or underflow across
 * the entire positive float64 domain `[Number.MIN_VALUE, Number.MAX_VALUE]`.
 */
const INITIAL_SHIFT = 512;

/**
 * Maximum recursive refinement steps for Heron's method on `[1, 4)`.
 * Quadratic convergence reaches full 53-bit IEEE-754 precision in <= 6 steps;
 * the cap provides an unconditional termination safeguard.
 */
const MAX_REFINEMENT_STEPS = 16;

/**
 * Recursively refines the square root of `m` (with `1 <= m < 4`) using
 * Heron's (Newton-Raphson) method without calling `Math.sqrt`.
 *
 * Termination handles both exact fixed points (`next === guess`) and
 * 1-ULP IEEE-754 rounding 2-cycles (`next === prevGuess`).
 *
 * @param {number} m - Reduced radicand in `[1, 4)`.
 * @param {number} guess - Current positive approximation of `sqrt(m)`.
 * @param {number} prevGuess - Previous approximation, used to detect 1-ULP 2-cycles.
 * @param {number} step - Current recursion depth.
 * @returns {number} Approximation of `sqrt(m)` within 1 ULP of exact IEEE-754 float64 precision.
 */
function heronRecursive(m, guess, prevGuess, step) {
	const next = 0.5 * (guess + m / guess);
	if (next === guess || next === prevGuess || step >= MAX_REFINEMENT_STEPS) {
		return next;
	}
	return heronRecursive(m, next, guess, step + 1);
}

/**
 * Recursively reduces a positive finite float64 `x` into `[1, 4)` via
 * divide-and-conquer scaling by exact powers of 4 (`2 ** shift`), computes
 * the reduced square root via {@link heronRecursive}, and rescales the root
 * by the corresponding exact power of 2 (`2 ** (shift / 2)`).
 *
 * Because every reduction and rescaling factor is an exact power of two in
 * normal float64 range, no mantissa rounding error is introduced during range
 * reduction — even for subnormals (`Number.MIN_VALUE`) and values near
 * `Number.MAX_VALUE`.
 *
 * @param {number} x - Positive finite radicand.
 * @param {number} shift - Current even power-of-two exponent step (512, 256, ..., 2).
 * @returns {number} Square root of `x`.
 */
function reduceAndSqrt(x, shift) {
	if (x >= 1 && x < 4) {
		// Linear initial estimate on [1, 4): exact at 1 and within 25% across [1, 4).
		const initialGuess = 0.5 * (1 + x);
		return heronRecursive(x, initialGuess, NaN, 0);
	}

	const factor = 2 ** shift;
	if (x >= factor) {
		return 2 ** (shift / 2) * reduceAndSqrt(x / factor, shift);
	}
	if (x < 1 / factor) {
		return 2 ** (-shift / 2) * reduceAndSqrt(x * factor, shift);
	}
	if (shift > 2) {
		return reduceAndSqrt(x, shift / 2);
	}

	// Here shift === 2 and 0.25 <= x < 1; scaling by 4 maps x directly into [1, 4).
	return 0.5 * reduceAndSqrt(x * 4, 2);
}

/**
 * Computes the principal square root of a non-negative finite IEEE-754 float64
 * number using a recursive divide-and-conquer algorithm (power-of-4 exponent
 * range reduction combined with recursive Heron / Newton-Raphson refinement),
 * without calling `Math.sqrt`.
 *
 * @param {number} x - Non-negative finite IEEE-754 float64 number.
 * @returns {number} The non-negative square root of `x` (preserves `-0` for `x = -0`).
 * @throws {TypeError} If `x` is not of type `'number'`.
 * @throws {RangeError} If `x` is `NaN`, `±Infinity`, or negative (`x < 0`).
 */
export function sqrtFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`);
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected x to be a finite number, got ${x}`);
	}
	if (x < 0) {
		throw new RangeError(`Cannot compute square root of negative number: ${x}`);
	}
	if (x === 0) {
		return x;
	}

	return reduceAndSqrt(x, INITIAL_SHIFT);
}
