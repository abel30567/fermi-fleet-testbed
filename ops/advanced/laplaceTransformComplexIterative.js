/**
 * Complex number representation `{ re, im }`.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Options controlling numerical quadrature for the Laplace transform.
 * @typedef {Object} LaplaceTransformOptions
 * @property {number} [upperBound] - Finite upper integration limit `T > 0` approximating infinity.
 * @property {number} [steps] - Number of uniform quadrature subintervals (positive integer).
 */

/**
 * Validates and converts a return value of `fn(t)` into a finite complex number `{ re, im }`.
 *
 * @param {number | Complex} value
 * @param {number} t
 * @returns {Complex}
 */
function toComplex(value, t) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`fn(${t}) returned a non-finite number`);
		}
		return { re: value, im: 0 };
	}

	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		const { re, im } = value;
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`fn(${t}) must return a finite number or complex { re, im }`);
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`fn(${t}) returned a complex value with non-finite components`);
		}
		return { re, im };
	}

	throw new TypeError(`fn(${t}) must return a finite number or complex { re, im }`);
}

/**
 * Evaluates the Laplace integrand `f(t) * exp(-s * t)` at time `t`.
 *
 * @param {(t: number) => number | Complex} fn
 * @param {Complex} s
 * @param {number} t
 * @returns {Complex}
 */
function evalIntegrand(fn, s, t) {
	const f = toComplex(fn(t), t);
	const decay = Math.exp(-s.re * t);

	if (!Number.isFinite(decay)) {
		if (f.re === 0 && f.im === 0) {
			return { re: 0, im: 0 };
		}
		throw new RangeError(`Laplace integrand overflowed at t=${t}`);
	}

	const angle = s.im * t;
	const cosVal = Math.cos(angle);
	const sinVal = Math.sin(angle);

	const re = decay * (f.re * cosVal + f.im * sinVal);
	const im = decay * (f.im * cosVal - f.re * sinVal);

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`Laplace integrand became non-finite at t=${t}`);
	}

	return { re, im };
}

/**
 * Computes the unilateral Laplace transform
 * `F(s) = integral_0^infinity f(t) * exp(-s * t) dt`
 * at a complex frequency `s = { re, im }` using a straightforward iterative
 * composite Simpson quadrature (with a Simpson's 3/8 tail for odd step counts >= 3,
 * or trapezoidal rule when `steps === 1`).
 *
 * The time-domain function `fn(t)` may return either a real `number` or a complex
 * object `{ re, im }`.
 *
 * @param {(t: number) => number | Complex} fn - Time-domain function `f(t)` defined for `t >= 0`.
 * @param {Complex} s - Complex frequency `{ re, im }` where the transform is evaluated.
 * @param {LaplaceTransformOptions} [options={}] - Optional integration parameters.
 * @returns {Complex} Numerical approximation of `F(s)` as `{ re, im }`.
 * @throws {TypeError} If `fn`, `s`, `options`, or `fn(t)` have invalid types.
 * @throws {RangeError} If numeric parameters are non-finite/out of range or the integrand overflows.
 */
export function laplaceTransformComplexIterative(fn, s, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}

	if (s === null || typeof s !== 'object' || Array.isArray(s)) {
		throw new TypeError('s must be a complex number object { re, im }');
	}
	if (typeof s.re !== 'number' || typeof s.im !== 'number') {
		throw new TypeError('s.re and s.im must be numbers');
	}
	if (!Number.isFinite(s.re) || !Number.isFinite(s.im)) {
		throw new RangeError('s.re and s.im must be finite numbers');
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object');
	}

	let upperBound;
	if (options.upperBound !== undefined) {
		if (typeof options.upperBound !== 'number') {
			throw new TypeError('options.upperBound must be a number');
		}
		if (!Number.isFinite(options.upperBound) || options.upperBound <= 0) {
			throw new RangeError('options.upperBound must be a finite positive number');
		}
		upperBound = options.upperBound;
	} else {
		upperBound = s.re > 0 ? Math.min(Math.max(50, 40 / s.re), 5000) : 50;
	}

	let steps;
	if (options.steps !== undefined) {
		if (typeof options.steps !== 'number') {
			throw new TypeError('options.steps must be a number');
		}
		if (!Number.isInteger(options.steps) || options.steps < 1) {
			throw new RangeError('options.steps must be a positive integer');
		}
		steps = options.steps;
	} else {
		const estimated = Math.max(
			8000,
			Math.ceil(upperBound * (16 * Math.abs(s.im) + 8 * Math.abs(s.re) + 20))
		);
		const capped = Math.min(estimated, 200000);
		steps = (capped & 1) === 0 ? capped : capped + 1;
	}

	const h = upperBound / steps;
	let totalRe = 0;
	let totalIm = 0;

	if (steps === 1) {
		const y0 = evalIntegrand(fn, s, 0);
		const y1 = evalIntegrand(fn, s, upperBound);
		totalRe = 0.5 * h * (y0.re + y1.re);
		totalIm = 0.5 * h * (y0.im + y1.im);
	} else if ((steps & 1) === 0) {
		// Composite Simpson's 1/3 rule over all `steps` intervals.
		const y0 = evalIntegrand(fn, s, 0);
		const yN = evalIntegrand(fn, s, upperBound);
		let accRe = y0.re + yN.re;
		let accIm = y0.im + yN.im;

		for (let i = 1; i < steps; i++) {
			const weight = (i & 1) === 1 ? 4 : 2;
			const y = evalIntegrand(fn, s, i * h);
			accRe += weight * y.re;
			accIm += weight * y.im;
		}

		totalRe = (h / 3) * accRe;
		totalIm = (h / 3) * accIm;
	} else {
		// Odd steps >= 3: composite Simpson's 1/3 rule on [0, m*h] + Simpson's 3/8 rule on [m*h, upperBound].
		const m = steps - 3;
		const yM = evalIntegrand(fn, s, m * h);

		if (m >= 2) {
			const y0 = evalIntegrand(fn, s, 0);
			let accRe = y0.re + yM.re;
			let accIm = y0.im + yM.im;

			for (let i = 1; i < m; i++) {
				const weight = (i & 1) === 1 ? 4 : 2;
				const y = evalIntegrand(fn, s, i * h);
				accRe += weight * y.re;
				accIm += weight * y.im;
			}

			totalRe += (h / 3) * accRe;
			totalIm += (h / 3) * accIm;
		}

		const yM1 = evalIntegrand(fn, s, (m + 1) * h);
		const yM2 = evalIntegrand(fn, s, (m + 2) * h);
		const yN = evalIntegrand(fn, s, upperBound);

		totalRe += (3 * h / 8) * (yM.re + 3 * yM1.re + 3 * yM2.re + yN.re);
		totalIm += (3 * h / 8) * (yM.im + 3 * yM1.im + 3 * yM2.im + yN.im);
	}

	return {
		re: totalRe === 0 ? 0 : totalRe,
		im: totalIm === 0 ? 0 : totalIm
	};
}
