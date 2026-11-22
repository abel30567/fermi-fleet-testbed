const SCALE_HIGH = 2 ** 400;
const SCALE_LOW = 2 ** -400;
const MAX_POW2_EXP = 1023;
const MIN_POW2_EXP = -1022;
const POW2_MAX = 2 ** MAX_POW2_EXP;
const POW2_MIN = 2 ** MIN_POW2_EXP;

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} z - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `z` is not an object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateComplex(z, name) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError(`${name} must be an object with numeric { re, im } properties`);
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`);
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
	}
}

/**
 * Multiplies `x` by `2^exp` in exact power-of-two steps to avoid spurious
 * intermediate overflow or underflow when `|exp|` exceeds normal IEEE-754 exponent bounds.
 *
 * @param {number} x - Finite number to scale.
 * @param {number} exp - Integer binary exponent.
 * @returns {number} `x * 2^exp`.
 */
function scalePow2(x, exp) {
	if (x === 0 || exp === 0) {
		return x === 0 ? 0 : x;
	}
	let value = x;
	let remaining = exp;
	while (remaining > MAX_POW2_EXP) {
		value *= POW2_MAX;
		remaining -= MAX_POW2_EXP;
	}
	while (remaining < MIN_POW2_EXP) {
		value *= POW2_MIN;
		remaining -= MIN_POW2_EXP;
	}
	return value * (2 ** remaining);
}

/**
 * Multiplies two complex numbers `{ re, im }` using Gauss's 3-multiplication
 * closed-form identity.
 *
 * Mathematical identity:
 * Given `a = a.re + i*a.im` and `b = b.re + i*b.im`, define:
 * - `k1 = a.re * (b.re + b.im)`
 * - `k2 = b.im * (a.re + a.im)`
 * - `k3 = b.re * (a.im - a.re)`
 *
 * Then:
 * - `Re(a * b) = k1 - k2 = a.re*b.re - a.im*b.im`
 * - `Im(a * b) = k1 + k3 = a.re*b.im + a.im*b.re`
 *
 * When operand magnitudes lie outside `[2^-400, 2^400]`, exact power-of-two
 * scaling is applied prior to evaluating `k1`, `k2`, `k3` and inverted
 * afterward to prevent spurious intermediate overflow, underflow, or `NaN`.
 *
 * @param {{ re: number, im: number }} a - First complex operand.
 * @param {{ re: number, im: number }} b - Second complex operand.
 * @returns {{ re: number, im: number }} Product `a * b` with `-0` normalized to `0`.
 * @throws {TypeError} If `a` or `b` is not an object or has non-numeric `re`/`im`.
 * @throws {RangeError} If `a` or `b` has non-finite (`NaN` or `±Infinity`) `re`/`im`.
 */
export function multiplyComplexSeries(a, b) {
	validateComplex(a, 'a');
	validateComplex(b, 'b');

	const maxA = Math.max(Math.abs(a.re), Math.abs(a.im));
	const maxB = Math.max(Math.abs(b.re), Math.abs(b.im));

	if (maxA === 0 || maxB === 0) {
		return { re: 0, im: 0 };
	}

	let ar = a.re;
	let ai = a.im;
	let br = b.re;
	let bi = b.im;
	let expA = 0;
	let expB = 0;

	if (maxA > SCALE_HIGH || maxA < SCALE_LOW || maxB > SCALE_HIGH || maxB < SCALE_LOW) {
		expA = Math.floor(Math.log2(maxA));
		expB = Math.floor(Math.log2(maxB));
		ar = scalePow2(ar, -expA);
		ai = scalePow2(ai, -expA);
		br = scalePow2(br, -expB);
		bi = scalePow2(bi, -expB);
	}

	const k1 = ar * (br + bi);
	const k2 = bi * (ar + ai);
	const k3 = br * (ai - ar);

	let re = k1 - k2;
	let im = k1 + k3;

	const totalExp = expA + expB;
	if (totalExp !== 0) {
		re = scalePow2(re, totalExp);
		im = scalePow2(im, totalExp);
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}
