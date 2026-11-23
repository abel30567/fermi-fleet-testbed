/**
 * Computes the square root of an IEEE-754 float64 Number using exact
 * power-of-two range reduction and iterative Newton-Raphson (Heron's)
 * refinement.
 *
 * Follows IEEE-754 `squareRoot` special-value semantics:
 * - `sqrtFloatIterative(NaN)` returns `NaN`
 * - `sqrtFloatIterative(+0)` returns `+0`
 * - `sqrtFloatIterative(-0)` returns `-0`
 * - `sqrtFloatIterative(+Infinity)` returns `+Infinity`
 * - `sqrtFloatIterative(x)` for `x < 0` (including `-Infinity`) returns `NaN`
 *
 * @param {number} x - An IEEE-754 float64 number.
 * @returns {number} The square root of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */

const SCALE_DOWN_STEPS = [
	[2 ** 512, 2 ** -512, 256],
	[2 ** 256, 2 ** -256, 128],
	[2 ** 128, 2 ** -128, 64],
	[2 ** 64, 2 ** -64, 32],
	[2 ** 32, 2 ** -32, 16],
	[2 ** 16, 2 ** -16, 8],
	[2 ** 8, 2 ** -8, 4],
	[2 ** 4, 2 ** -4, 2],
	[2 ** 2, 2 ** -2, 1],
];

const SCALE_UP_STEPS = [
	[2 ** -256, 2 ** 256, 128],
	[2 ** -128, 2 ** 128, 64],
	[2 ** -64, 2 ** 64, 32],
	[2 ** -32, 2 ** 32, 16],
	[2 ** -16, 2 ** 16, 8],
	[2 ** -8, 2 ** 8, 4],
	[2 ** -4, 2 ** 4, 2],
	[2 ** -2, 2 ** 2, 1],
];

const TWO_POW_512 = 2 ** 512;
const TWO_POW_NEG_512 = 2 ** -512;
const MAX_ITERATIONS = 64;

export function sqrtFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(
			`Expected a number, got ${x === null ? 'null' : typeof x}`,
		);
	}

	if (Number.isNaN(x) || x < 0) {
		return NaN;
	}

	if (x === 0 || x === Infinity) {
		return x;
	}

	// Reduce x = m * 2^(2k) with m in [1, 4) using exact power-of-two scaling.
	let m = x;
	let k = 0;

	if (m >= 4) {
		for (const [threshold, invScale, halfExp] of SCALE_DOWN_STEPS) {
			if (m >= threshold) {
				m *= invScale;
				k += halfExp;
			}
		}
	} else if (m < 1) {
		while (m < TWO_POW_NEG_512) {
			m *= TWO_POW_512;
			k -= 256;
		}
		for (const [threshold, scale, halfExp] of SCALE_UP_STEPS) {
			if (m < threshold) {
				m *= scale;
				k -= halfExp;
			}
		}
		if (m < 1) {
			m *= 4;
			k -= 1;
		}
	}

	// Heron's / Newton-Raphson iteration on m in [1, 4).
	// By AM-GM, 0.5 * (1 + m) >= sqrt(m), so iterates decrease monotonically
	// until reaching the float64 fixed point or 1-ULP boundary.
	let guess = 0.5 * (1 + m);
	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const next = 0.5 * (guess + m / guess);
		if (next >= guess) {
			break;
		}
		guess = next;
	}

	return guess * 2 ** k;
}
