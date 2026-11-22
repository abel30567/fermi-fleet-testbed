const PI = Math.PI;
const HALF_PI = Math.PI / 2;
const TWO_POW_32 = 4294967296;
const TWO_POW_NEG_32 = 1 / TWO_POW_32;
const TWO_POW_16 = 65536;
const TWO_POW_NEG_16 = 1 / TWO_POW_16;

/**
 * Computes the non-negative square root of a finite real number x >= 0
 * using binary range reduction and Heron's iterative method.
 *
 * @param {number} x - Non-negative finite real number.
 * @returns {number} Principal square root of x.
 */
function sqrtIterative(x) {
	if (x === 0) {
		return 0;
	}
	let m = x;
	let scale = 1;
	while (m >= TWO_POW_32) {
		m *= TWO_POW_NEG_32;
		scale *= TWO_POW_16;
	}
	while (m >= 4) {
		m *= 0.25;
		scale *= 2;
	}
	while (m < TWO_POW_NEG_32) {
		m *= TWO_POW_32;
		scale *= TWO_POW_NEG_16;
	}
	while (m < 0.25) {
		m *= 4;
		scale *= 0.5;
	}

	let s = 0.5 * (m + 1);
	for (let i = 0; i < 64; i++) {
		const next = 0.5 * (s + m / s);
		if (next === s || Math.abs(next - s) <= Number.EPSILON * next) {
			s = next;
			break;
		}
		s = next;
	}
	return s * scale;
}

/**
 * Computes sqrt(a^2 + b^2) without intermediate overflow/underflow.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function hypotIterative(a, b) {
	let p = Math.abs(a);
	let q = Math.abs(b);
	if (p < q) {
		const tmp = p;
		p = q;
		q = tmp;
	}
	if (p === 0) {
		return 0;
	}
	const ratio = q / p;
	return p * sqrtIterative(1 + ratio * ratio);
}

/**
 * Evaluates 2 * sum_{k=0..inf} t^(2k+1) / (2k+1) = ln((1 + t) / (1 - t))
 * iteratively for |t| < 1.
 *
 * @param {number} t
 * @returns {number}
 */
function lnSeriesFromT(t) {
	const t2 = t * t;
	let term = t;
	let sum = t;
	for (let k = 3; k < 200; k += 2) {
		term *= t2;
		const delta = term / k;
		const next = sum + delta;
		if (next === sum) {
			break;
		}
		sum = next;
	}
	return 2 * sum;
}

const SQRT2 = sqrtIterative(2);
const SQRT1_2 = 0.5 * SQRT2;
const LN2 = lnSeriesFromT(1 / 3);

/**
 * Computes the natural logarithm ln(x) for x > 0 via binary range reduction
 * into [sqrt(2)/2, sqrt(2)] followed by the iterative atanh series.
 *
 * @param {number} x - Positive finite real number.
 * @returns {number}
 */
function lnIterative(x) {
	if (x === 1) {
		return 0;
	}
	let m = x;
	let exp = 0;
	while (m >= TWO_POW_32) {
		m *= TWO_POW_NEG_32;
		exp += 32;
	}
	while (m < TWO_POW_NEG_32) {
		m *= TWO_POW_32;
		exp -= 32;
	}
	while (m >= SQRT2) {
		m *= 0.5;
		exp += 1;
	}
	while (m < SQRT1_2) {
		m *= 2;
		exp -= 1;
	}
	const t = (m - 1) / (m + 1);
	return exp * LN2 + lnSeriesFromT(t);
}

/**
 * Computes ln(1 + u) accurately for u >= 0 without catastrophic cancellation
 * near u = 0.
 *
 * @param {number} u - Non-negative finite real number.
 * @returns {number}
 */
function ln1pIterative(u) {
	if (u === 0) {
		return 0;
	}
	if (u <= 0.5) {
		return lnSeriesFromT(u / (2 + u));
	}
	return lnIterative(1 + u);
}

/**
 * Computes atan(x) for finite real x >= 0 using iterative half-angle reduction
 * and the alternating Maclaurin series.
 *
 * @param {number} x - Non-negative finite real number.
 * @returns {number}
 */
function atanNonNegativeIterative(x) {
	if (x === 0) {
		return 0;
	}
	let t = x;
	let inverted = false;
	if (t > 1) {
		t = 1 / t;
		inverted = true;
	}
	let factor = 1;
	while (t > 0.1) {
		t = t / (1 + sqrtIterative(1 + t * t));
		factor *= 2;
	}
	const t2 = t * t;
	let term = t;
	let sum = t;
	for (let k = 3; k < 200; k += 2) {
		term *= -t2;
		const delta = term / k;
		const next = sum + delta;
		if (next === sum) {
			break;
		}
		sum = next;
	}
	const angle = factor * sum;
	return inverted ? HALF_PI - angle : angle;
}

/**
 * Computes atan2(y, x) in [0, pi/2] for x >= 0, y >= 0, (x, y) != (0, 0)
 * without overflow.
 *
 * @param {number} y - Non-negative finite real number.
 * @param {number} x - Non-negative finite real number.
 * @returns {number}
 */
function atan2FirstQuadrantIterative(y, x) {
	if (y === 0) {
		return 0;
	}
	if (x === 0) {
		return HALF_PI;
	}
	if (y <= x) {
		return atanNonNegativeIterative(y / x);
	}
	return HALF_PI - atanNonNegativeIterative(x / y);
}

/**
 * Applies safeguarded complex Newton refinement to cos(u + i*v) = x + i*y
 * inside the open first quadrant (u in [0, pi/2], v <= 0).
 *
 * @param {number} u - Initial real part in [0, pi/2].
 * @param {number} v - Initial imaginary part <= 0.
 * @param {number} x - Target real part > 0.
 * @param {number} y - Target imaginary part > 0.
 * @returns {{ re: number, im: number }}
 */
function refineWithNewton(u, v, x, y) {
	let cu = u;
	let cv = v;
	for (let iter = 0; iter < 4; iter++) {
		const cosU = Math.cos(cu);
		const sinU = Math.sin(cu);
		const coshV = Math.cosh(cv);
		const sinhV = Math.sinh(cv);

		// f(w) = cos(w) - z
		const fRe = cosU * coshV - x;
		const fIm = -sinU * sinhV - y;
		const err = hypotIterative(fRe, fIm);
		if (err === 0) {
			break;
		}

		// -f'(w) = sin(w)
		const sinRe = sinU * coshV;
		const sinIm = cosU * sinhV;
		const sinMag = hypotIterative(sinRe, sinIm);
		if (sinMag <= 1e-3) {
			break;
		}

		// w_{k+1} = w_k + f(w_k) / sin(w_k)
		const denom = sinRe * sinRe + sinIm * sinIm;
		const dRe = (fRe * sinRe + fIm * sinIm) / denom;
		const dIm = (fIm * sinRe - fRe * sinIm) / denom;

		const nextU = cu + dRe;
		const nextV = cv + dIm;
		if (nextU < 0 || nextU > HALF_PI || nextV > 0) {
			break;
		}

		const nextErr = hypotIterative(
			Math.cos(nextU) * Math.cosh(nextV) - x,
			-Math.sin(nextU) * Math.sinh(nextV) - y,
		);
		if (nextErr >= err) {
			break;
		}
		cu = nextU;
		cv = nextV;
		if (hypotIterative(dRe, dIm) <= Number.EPSILON * hypotIterative(cu, cv)) {
			break;
		}
	}
	return { re: cu, im: cv };
}

/**
 * Computes the principal value of the complex inverse cosine arccos(z)
 * for a complex number z = { re, im }.
 *
 * Uses symmetry reduction to the closed first quadrant (x >= 0, y >= 0) where
 * the principal identity arccos(z) = -i * ln(z + i * sqrt(1 - z^2)) has no
 * subtractive cancellation, evaluating sqrt, ln/ln1p, and atan iteratively,
 * followed by safeguarded complex Newton refinement on cos(w) = z for interior
 * well-conditioned points.
 *
 * Principal branch properties:
 * - Re(arccos(z)) is in [0, pi].
 * - Branch cuts lie along (-Infinity, -1) and (1, +Infinity) on the real axis,
 *   continuous from the upper half-plane for im = +0 and lower half-plane for im = -0.
 * - cos(arccos(z)) = z for all finite complex inputs.
 *
 * @param {{ re: number, im: number }} z - Complex input object with finite numeric `re` and `im`.
 * @returns {{ re: number, im: number }} Principal complex arccos(z).
 * @throws {TypeError} If `z` is not a non-null non-array object or if `z.re` or `z.im` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (NaN, Infinity, or -Infinity).
 */
export function arccosComplexIterative(z) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('Input z must be a non-null object with numeric { re, im } properties');
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Complex components z.re and z.im must be numbers');
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Complex components z.re and z.im must be finite numbers');
	}

	const x = Math.abs(z.re);
	const y = Math.abs(z.im);

	let u;
	let v;

	if (x === 0 && y === 0) {
		u = HALF_PI;
		v = 0;
	} else if (x === 1 && y === 0) {
		u = 0;
		v = 0;
	} else {
		const maxCoord = x >= y ? x : y;
		if (maxCoord > 1e100) {
			// Asymptotic scaling avoids overflow in z^2 while preserving full float64 precision.
			const sx = x / maxCoord;
			const sy = y / maxCoord;
			u = atan2FirstQuadrantIterative(sy, sx);
			v = -(LN2 + lnIterative(maxCoord) + lnIterative(hypotIterative(sx, sy)));
		} else {
			// Evaluate w = sqrt(1 - z^2) = b - i*a with b >= 0, a >= 0 (upper half-plane limit).
			const c = (1 - x) * (1 + x) + y * y;
			const d = -2 * x * y;
			const r = hypotIterative(c, d);

			let a;
			let b;
			if (c >= 0) {
				b = sqrtIterative(0.5 * r + 0.5 * c);
				a = b === 0 ? 0 : (x * y) / b;
			} else {
				a = sqrtIterative(0.5 * r - 0.5 * c);
				b = a === 0 ? 0 : (x * y) / a;
			}

			// p = z + i*w = (x + a) + i*(y + b), both components >= 0 (cancellation-free).
			const pRe = x + a;
			const pIm = y + b;

			u = atan2FirstQuadrantIterative(pIm, pRe);

			// Exact cancellation-free identity: |p|^2 - 1 = 2 * (a*(x + a) + y*(y + b)) >= 0.
			const magSqMinusOne = 2 * (a * pRe + y * pIm);
			const absV = magSqMinusOne <= 1
				? 0.5 * ln1pIterative(magSqMinusOne)
				: lnIterative(hypotIterative(pRe, pIm));
			v = -absV;

			if (x > 0 && y > 0 && absV < 100) {
				const refined = refineWithNewton(u, v, x, y);
				u = refined.re;
				v = refined.im;
			}
		}
	}

	const rawRe = z.re < 0 ? PI - u : u;
	const negIm = z.im < 0 || Object.is(z.im, -0);
	const rawIm = negIm ? -v : v;

	return {
		re: rawRe === 0 ? 0 : rawRe,
		im: rawIm === 0 ? 0 : rawIm,
	};
}
