/**
 * @typedef {Object} ComplexFloat64
 * @property {number} re - Real part as an IEEE-754 float64 number.
 * @property {number} im - Imaginary part as an IEEE-754 float64 number.
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - When true, computes the inverse DFT (scaled by 1/N).
 */

/**
 * Normalizes IEEE-754 negative zero (-0) to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates and converts the input signal into an array of finite complex float64 objects.
 *
 * @param {Array<number | ComplexFloat64> | Float64Array} signal
 * @returns {ComplexFloat64[]}
 */
function validateAndNormalizeSignal(signal) {
	if (signal instanceof Float64Array) {
		const out = new Array(signal.length);
		for (let i = 0; i < signal.length; i++) {
			const re = signal[i];
			if (!Number.isFinite(re)) {
				throw new RangeError(
					`Signal element at index ${i} must be a finite IEEE-754 float64 number`
				);
			}
			out[i] = { re: normalizeZero(re), im: 0 };
		}
		return out;
	}

	if (!Array.isArray(signal)) {
		throw new TypeError(
			'Signal must be an Array of finite numbers or { re, im } objects, or a Float64Array'
		);
	}

	const out = new Array(signal.length);
	for (let i = 0; i < signal.length; i++) {
		const item = signal[i];
		if (typeof item === 'number') {
			if (!Number.isFinite(item)) {
				throw new RangeError(
					`Signal element at index ${i} must be a finite IEEE-754 float64 number`
				);
			}
			out[i] = { re: normalizeZero(item), im: 0 };
		} else if (item !== null && typeof item === 'object') {
			const { re, im } = item;
			if (typeof re !== 'number' || typeof im !== 'number') {
				throw new TypeError(
					`Complex signal element at index ${i} must have numeric "re" and "im" properties`
				);
			}
			if (!Number.isFinite(re) || !Number.isFinite(im)) {
				throw new RangeError(
					`Complex signal element at index ${i} must have finite "re" and "im" float64 values`
				);
			}
			out[i] = { re: normalizeZero(re), im: normalizeZero(im) };
		} else {
			throw new TypeError(
				`Signal element at index ${i} must be a finite number or a { re, im } object`
			);
		}
	}

	return out;
}

/**
 * Validates options and extracts the transform direction flag.
 *
 * @param {FourierTransformOptions | undefined} options
 * @returns {boolean}
 */
function parseOptions(options) {
	if (options === undefined) {
		return false;
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Options must be a plain object when provided');
	}
	const { inverse = false } = options;
	if (typeof inverse !== 'boolean') {
		throw new TypeError('Option "inverse" must be a boolean');
	}
	return inverse;
}

/**
 * Recursive Cooley-Tukey radix-2 divide-and-conquer FFT.
 * Requires input length to be a power of two (N >= 1).
 *
 * @param {ComplexFloat64[]} x - Complex input samples of length N = 2^m.
 * @param {number} sign - -1 for forward transform, +1 for inverse transform.
 * @returns {ComplexFloat64[]}
 */
function fftRadix2Recursive(x, sign) {
	const n = x.length;
	if (n <= 1) {
		return n === 0 ? [] : [{ re: x[0].re, im: x[0].im }];
	}

	const half = n >>> 1;
	const even = new Array(half);
	const odd = new Array(half);

	for (let i = 0; i < half; i++) {
		even[i] = x[2 * i];
		odd[i] = x[2 * i + 1];
	}

	const evenFFT = fftRadix2Recursive(even, sign);
	const oddFFT = fftRadix2Recursive(odd, sign);

	const result = new Array(n);
	const baseAngle = (sign * 2 * Math.PI) / n;

	for (let k = 0; k < half; k++) {
		const angle = baseAngle * k;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		const o = oddFFT[k];
		const tRe = cos * o.re - sin * o.im;
		const tIm = sin * o.re + cos * o.im;

		const e = evenFFT[k];
		result[k] = {
			re: normalizeZero(e.re + tRe),
			im: normalizeZero(e.im + tIm),
		};
		result[k + half] = {
			re: normalizeZero(e.re - tRe),
			im: normalizeZero(e.im - tIm),
		};
	}

	return result;
}

/**
 * Bluestein's chirp-z transform for arbitrary lengths N >= 2, delegating
 * convolution to the recursive radix-2 divide-and-conquer FFT.
 *
 * @param {ComplexFloat64[]} x - Complex input samples of length N.
 * @param {number} sign - -1 for forward transform, +1 for inverse transform.
 * @returns {ComplexFloat64[]}
 */
function fftBluestein(x, sign) {
	const n = x.length;
	let m = 1;
	while (m < 2 * n - 1) {
		m *= 2;
	}

	const chirpRe = new Float64Array(n);
	const chirpIm = new Float64Array(n);
	const twoN = 2 * n;

	for (let k = 0; k < n; k++) {
		const kSquaredMod = (k * k) % twoN;
		const angle = (sign * Math.PI * kSquaredMod) / n;
		chirpRe[k] = Math.cos(angle);
		chirpIm[k] = Math.sin(angle);
	}

	const a = new Array(m);
	const b = new Array(m);
	for (let i = 0; i < m; i++) {
		a[i] = { re: 0, im: 0 };
		b[i] = { re: 0, im: 0 };
	}

	for (let i = 0; i < n; i++) {
		const xi = x[i];
		const cRe = chirpRe[i];
		const cIm = chirpIm[i];
		a[i] = {
			re: xi.re * cRe - xi.im * cIm,
			im: xi.re * cIm + xi.im * cRe,
		};
	}

	b[0] = { re: chirpRe[0], im: -chirpIm[0] };
	for (let i = 1; i < n; i++) {
		const conj = { re: chirpRe[i], im: -chirpIm[i] };
		b[i] = conj;
		b[m - i] = conj;
	}

	const aFFT = fftRadix2Recursive(a, -1);
	const bFFT = fftRadix2Recursive(b, -1);

	const product = new Array(m);
	for (let i = 0; i < m; i++) {
		const ai = aFFT[i];
		const bi = bFFT[i];
		product[i] = {
			re: ai.re * bi.re - ai.im * bi.im,
			im: ai.re * bi.im + ai.im * bi.re,
		};
	}

	const conv = fftRadix2Recursive(product, 1);

	const result = new Array(n);
	for (let k = 0; k < n; k++) {
		const cRe = conv[k].re / m;
		const cIm = conv[k].im / m;
		const wRe = chirpRe[k];
		const wIm = chirpIm[k];
		result[k] = {
			re: normalizeZero(cRe * wRe - cIm * wIm),
			im: normalizeZero(cRe * wIm + cIm * wRe),
		};
	}

	return result;
}

/**
 * Recursive divide-and-conquer DFT dispatcher.
 * - For N <= 1: base case.
 * - For even N: splits into even and odd subproblems of length N / 2 recursively.
 * - For odd N > 1: reduces via Bluestein's algorithm to recursive radix-2 FFTs.
 *
 * @param {ComplexFloat64[]} x
 * @param {number} sign - -1 for forward, +1 for inverse.
 * @returns {ComplexFloat64[]}
 */
function dftRecursive(x, sign) {
	const n = x.length;
	if (n <= 1) {
		return n === 0 ? [] : [{ re: x[0].re, im: x[0].im }];
	}

	if ((n & (n - 1)) === 0) {
		return fftRadix2Recursive(x, sign);
	}

	if (n % 2 === 0) {
		const half = n / 2;
		const even = new Array(half);
		const odd = new Array(half);
		for (let i = 0; i < half; i++) {
			even[i] = x[2 * i];
			odd[i] = x[2 * i + 1];
		}

		const evenDFT = dftRecursive(even, sign);
		const oddDFT = dftRecursive(odd, sign);

		const result = new Array(n);
		const baseAngle = (sign * 2 * Math.PI) / n;

		for (let k = 0; k < half; k++) {
			const angle = baseAngle * k;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);

			const o = oddDFT[k];
			const tRe = cos * o.re - sin * o.im;
			const tIm = sin * o.re + cos * o.im;

			const e = evenDFT[k];
			result[k] = {
				re: normalizeZero(e.re + tRe),
				im: normalizeZero(e.im + tIm),
			};
			result[k + half] = {
				re: normalizeZero(e.re - tRe),
				im: normalizeZero(e.im - tIm),
			};
		}

		return result;
	}

	return fftBluestein(x, sign);
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse DFT over IEEE-754
 * float64 numbers using a recursive divide-and-conquer algorithm.
 *
 * Forward transform (`inverse: false`, default):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-2 * pi * i * k * n / N)
 *
 * Inverse transform (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+2 * pi * i * k * n / N)
 *
 * Uses recursive Cooley-Tukey radix-2 divide-and-conquer splitting for power-of-two
 * and even lengths, combined with Bluestein's chirp-z reduction (backed by the
 * recursive radix-2 FFT) for odd lengths, achieving O(N log N) time complexity for
 * all input sizes N.
 *
 * @param {Array<number | ComplexFloat64> | Float64Array} signal - Input sequence of finite float64 real numbers or `{ re, im }` complex numbers.
 * @param {FourierTransformOptions} [options] - Optional configuration (`{ inverse: false }`).
 * @returns {ComplexFloat64[]} Transformed sequence of complex IEEE-754 float64 objects `{ re, im }`.
 * @throws {TypeError} If `signal` is not an Array or Float64Array, contains invalid element types, or `options` is invalid.
 * @throws {RangeError} If any input value is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function fourierTransformFloatRecursive(signal, options) {
	const inverse = parseOptions(options);
	const normalized = validateAndNormalizeSignal(signal);
	const n = normalized.length;

	if (n === 0) {
		return [];
	}

	const sign = inverse ? 1 : -1;
	const transformed = dftRecursive(normalized, sign);

	if (inverse) {
		for (let i = 0; i < n; i++) {
			transformed[i] = {
				re: normalizeZero(transformed[i].re / n),
				im: normalizeZero(transformed[i].im / n),
			};
		}
	}

	return transformed;
}
