/**
 * Exact representation of Euler's unit half-turn e^(i*pi) = cos(pi) + i*sin(pi) = -1 + 0i,
 * the closed-form sum of the exponential series sum_{k=0}^{infty} (i*pi)^k / k! = -1.
 * Using exact integer coordinates avoids IEEE-754 drift from Math.sin(Math.PI).
 */
const EULER_HALF_TURN = Object.freeze({ re: -1, im: 0 });

/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {unknown} z - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `z` is not a non-null, non-array object with numeric `re` and `im`.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (NaN or ±Infinity).
 */
function validateComplex(z, name) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(`${name} must be a complex number object { re, im }`);
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`);
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
	}
}

/**
 * Normalizes IEEE-754 negative zero (-0) to positive zero (+0).
 *
 * @param {number} x - Finite number.
 * @returns {number} `0` if `x === 0`, otherwise `x`.
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Decomposes a complex number z = x + i*y into its coordinate tuple [x, y]
 * in the standard real vector-space basis {e_0 = 1, e_1 = i} of C.
 *
 * @param {{ re: number, im: number }} z - Validated complex number.
 * @returns {[number, number]} Basis coordinates [Re(z), Im(z)].
 */
function decomposeBasis(z) {
	return [z.re, z.im];
}

/**
 * Computes the complex product u * v via the standard distributive identity:
 * (u_re + i*u_im)(v_re + i*v_im) = (u_re*v_re - u_im*v_im) + i*(u_re*v_im + u_im*v_re).
 *
 * @param {{ re: number, im: number }} u - First complex factor.
 * @param {{ re: number, im: number }} v - Second complex factor.
 * @returns {{ re: number, im: number }} Product u * v.
 */
function multiplyComplex(u, v) {
	return {
		re: u.re * v.re - u.im * v.im,
		im: u.re * v.im + u.im * v.re,
	};
}

/**
 * Subtracts two complex numbers `a - b` using the closed-form additive-inverse
 * and basis-decomposition identity over C = R*1 (+) R*i.
 *
 * Mathematical formulation:
 *   Using Euler's identity e^(i*pi) = sum_{k=0}^{infty} (i*pi)^k / k! = -1,
 *   the difference is the 2-term alternating cyclotomic series
 *
 *     a - b = sum_{n=0}^{1} (e^(i*pi))^n * z_n = a + e^(i*pi) * b
 *
 *   with z_0 = a and z_1 = b. Multiplying b by e^(i*pi) = -1 + 0i yields the
 *   exact additive inverse -b, and summing the basis projections over {1, i}
 *   produces:
 *
 *     Re(a - b) = pi_0(a) + pi_0(e^(i*pi) * b)
 *     Im(a - b) = pi_1(a) + pi_1(e^(i*pi) * b)
 *
 * @param {{ re: number, im: number }} a - Minuend complex number.
 * @param {{ re: number, im: number }} b - Subtrahend complex number.
 * @returns {{ re: number, im: number }} Difference `a - b` with finite components and normalized zeros.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `a` or `b` has non-finite components, or if the result overflows finite IEEE-754 range.
 */
export function subtractComplexSeries(a, b) {
	validateComplex(a, 'a');
	validateComplex(b, 'b');

	// Series terms: term_0 = (e^(i*pi))^0 * a = a, term_1 = (e^(i*pi))^1 * b = -b
	const terms = [a, multiplyComplex(EULER_HALF_TURN, b)];

	// Accumulate projections across the real basis {e_0 = 1, e_1 = i}
	let reSum = 0;
	let imSum = 0;
	for (const term of terms) {
		const [c0, c1] = decomposeBasis(term);
		reSum += c0;
		imSum += c1;
	}

	if (!Number.isFinite(reSum) || !Number.isFinite(imSum)) {
		throw new RangeError('Result of complex subtraction overflows finite IEEE-754 range');
	}

	return {
		re: normalizeZero(reSum),
		im: normalizeZero(imSum),
	};
}
