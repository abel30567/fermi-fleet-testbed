/**
 * Normalizes negative zero (-0) to positive zero (0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Constructs a normalized complex number object `{ re, im }`.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function makeComplex(re, im) {
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	};
}

/**
 * Adds two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function addComplex(a, b) {
	return {
		re: a.re + b.re,
		im: a.im + b.im,
	};
}

/**
 * Subtracts complex number `b` from `a`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function subComplex(a, b) {
	return {
		re: a.re - b.re,
		im: a.im - b.im,
	};
}

/**
 * Multiplies two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Checks whether `n` is a positive integer power of two.
 *
 * @param {number} n
 * @returns {boolean}
 */
function isPowerOfTwo(n) {
	if (!Number.isInteger(n) || n < 1) {
		return false;
	}
	let x = n;
	while (x > 1) {
		if (x % 2 !== 0) {
			return false;
		}
		x /= 2;
	}
	return true;
}

/**
 * Computes the smallest power of two greater than or equal to `n`.
 *
 * @param {number} n
 * @returns {number}
 */
function nextPowerOfTwo(n) {
	let m = 1;
	while (m < n) {
		m *= 2;
	}
	return m;
}

/**
 * Validates and clones an array of complex number objects `{ re, im }`.
 *
 * @param {unknown} input
 * @returns {Array<{ re: number, im: number }>}
 * @throws {TypeError} If `input` is not an array or an element is not an object with numeric `re` and `im`.
 * @throws {RangeError} If any `re` or `im` component is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexArray(input) {
	if (!Array.isArray(input)) {
		throw new TypeError('Expected input to be an array of complex numbers { re, im }');
	}

	const normalized = new Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const el = input[i];
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`Expected element at index ${i} to be a complex object { re, im }`);
		}
		if (typeof el.re !== 'number' || typeof el.im !== 'number') {
			throw new TypeError(
				`Expected element at index ${i} to have numeric re and im properties`,
			);
		}
		if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
			throw new RangeError(
				`Expected element at index ${i} to have finite re and im values`,
			);
		}
		normalized[i] = { re: el.re, im: el.im };
	}

	return normalized;
}

/**
 * Parses and validates the `options` argument into a boolean `inverse` flag.
 *
 * @param {boolean | { inverse?: boolean } | undefined} options
 * @returns {boolean}
 * @throws {TypeError} If `options` is neither a boolean nor a valid options object.
 */
function parseInverseOption(options) {
	if (options === undefined) {
		return false;
	}
	if (typeof options === 'boolean') {
		return options;
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected options to be an options object { inverse?: boolean } or boolean');
	}
	if (options.inverse !== undefined && typeof options.inverse !== 'boolean') {
		throw new TypeError('Expected options.inverse to be a boolean');
	}
	return options.inverse ?? false;
}

/**
 * Recursive Cooley-Tukey radix-2 Fast Fourier Transform (divide-and-conquer).
 *
 * Assumes `samples.length` is a positive power of two. Computes:
 * `Y[k] = sum_{n=0}^{N-1} samples[n] * exp(sign * i * 2 * pi * k * n / N)`
 * without scaling by `1 / N`.
 *
 * @param {Array<{ re: number, im: number }>} samples
 * @param {-1 | 1} sign - `-1` for forward DFT, `+1` for unnormalized inverse DFT.
 * @returns {Array<{ re: number, im: number }>}
 */
function radix2FftRecursive(samples, sign) {
	const n = samples.length;
	if (n === 1) {
		return [{ re: samples[0].re, im: samples[0].im }];
	}

	const half = n / 2;
	const evens = new Array(half);
	const odds = new Array(half);
	for (let i = 0; i < half; i++) {
		evens[i] = samples[i * 2];
		odds[i] = samples[i * 2 + 1];
	}

	const evenTransformed = radix2FftRecursive(evens, sign);
	const oddTransformed = radix2FftRecursive(odds, sign);

	const result = new Array(n);
	const angleStep = (sign * 2 * Math.PI) / n;
	for (let k = 0; k < half; k++) {
		const angle = angleStep * k;
		const twiddle = { re: Math.cos(angle), im: Math.sin(angle) };
		const oddTerm = mulComplex(twiddle, oddTransformed[k]);
		result[k] = addComplex(evenTransformed[k], oddTerm);
		result[k + half] = subComplex(evenTransformed[k], oddTerm);
	}

	return result;
}

/**
 * Bluestein's chirp-z transform algorithm for arbitrary input lengths `N`.
 *
 * Rewrites `k * n = (k^2 + n^2 - (k - n)^2) / 2` to express the length-`N` DFT
 * as a length-`M` cyclic convolution where `M` is a power of two (`M >= 2N - 1`),
 * evaluated via the recursive Cooley-Tukey radix-2 FFT.
 *
 * @param {Array<{ re: number, im: number }>} samples
 * @param {-1 | 1} sign - `-1` for forward DFT, `+1` for unnormalized inverse DFT.
 * @returns {Array<{ re: number, im: number }>}
 */
function bluesteinFft(samples, sign) {
	const n = samples.length;
	const m = nextPowerOfTwo(2 * n - 1);
	const twoN = BigInt(2 * n);

	const chirp = new Array(n);
	for (let k = 0; k < n; k++) {
		const sqMod = Number((BigInt(k) * BigInt(k)) % twoN);
		const angle = (sign * Math.PI * sqMod) / n;
		chirp[k] = { re: Math.cos(angle), im: Math.sin(angle) };
	}

	const zero = { re: 0, im: 0 };
	const a = new Array(m).fill(zero);
	const b = new Array(m).fill(zero);

	for (let k = 0; k < n; k++) {
		a[k] = mulComplex(samples[k], chirp[k]);
	}

	b[0] = { re: chirp[0].re, im: -chirp[0].im };
	for (let k = 1; k < n; k++) {
		const conj = { re: chirp[k].re, im: -chirp[k].im };
		b[k] = conj;
		b[m - k] = conj;
	}

	const fftA = radix2FftRecursive(a, -1);
	const fftB = radix2FftRecursive(b, -1);

	const product = new Array(m);
	for (let k = 0; k < m; k++) {
		product[k] = mulComplex(fftA[k], fftB[k]);
	}

	const conv = radix2FftRecursive(product, 1);

	const result = new Array(n);
	for (let k = 0; k < n; k++) {
		const scaled = { re: conv[k].re / m, im: conv[k].im / m };
		result[k] = mulComplex(chirp[k], scaled);
	}

	return result;
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier Transform (IDFT)
 * of a sequence of complex numbers `{ re, im }` using a recursive divide-and-conquer FFT.
 *
 * Algorithm:
 * - For power-of-two lengths `N = 2^m`, directly runs the recursive Cooley-Tukey radix-2
 *   divide-and-conquer FFT in `O(N log N)` time.
 * - For arbitrary non-power-of-two lengths `N`, uses Bluestein's chirp-z transform to reduce
 *   the length-`N` DFT to a power-of-two cyclic convolution computed via the recursive
 *   Cooley-Tukey radix-2 FFT, maintaining `O(N log N)` complexity for all lengths.
 *
 * Conventions:
 * - Forward (`inverse = false`): `X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi * k * n / N)`
 * - Inverse (`inverse = true`):  `x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2*pi * k * n / N)`
 *
 * @param {Array<{ re: number, im: number }>} input - Sequence of complex numbers `{ re, im }`.
 * @param {boolean | { inverse?: boolean }} [options] - Optional transform direction (`{ inverse: true }` or `true` for IDFT).
 * @returns {Array<{ re: number, im: number }>} New array of transformed complex numbers `{ re, im }` (no `-0`).
 * @throws {TypeError} If `input` is not an array, any element is not a valid `{ re, im }` object with numeric fields, or `options` is invalid.
 * @throws {RangeError} If any `re` or `im` value is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function fourierTransformComplexRecursive(input, options = {}) {
	const samples = validateComplexArray(input);
	const inverse = parseInverseOption(options);

	const n = samples.length;
	if (n === 0) {
		return [];
	}

	const sign = inverse ? 1 : -1;
	const transformed = isPowerOfTwo(n)
		? radix2FftRecursive(samples, sign)
		: bluesteinFft(samples, sign);

	if (inverse) {
		return transformed.map((c) => makeComplex(c.re / n, c.im / n));
	}

	return transformed.map((c) => makeComplex(c.re, c.im));
}
