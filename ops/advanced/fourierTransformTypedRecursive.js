/**
 * Recursive divide-and-conquer Discrete Fourier Transform (FFT/DFT) over
 * Float64Array inputs.
 *
 * Uses recursive radix-2 Cooley-Tukey divide-and-conquer for even lengths
 * (and powers of two), and Bluestein's chirp-z algorithm backed by the same
 * recursive radix-2 FFT for odd lengths > 1, achieving O(N log N) time
 * complexity for arbitrary input lengths N >= 0.
 *
 * Convention:
 * - Forward (inverse = false):
 *     X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 * - Inverse (inverse = true):
 *     x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * @param {Float64Array} real - Real part of the input signal.
 * @param {Float64Array} [imag] - Optional imaginary part of the input signal
 *   (must have the same length as `real`; defaults to all zeros).
 * @param {object} [options] - Transform options.
 * @param {boolean} [options.inverse=false] - If true, computes the inverse DFT
 *   normalized by 1/N.
 * @returns {{ real: Float64Array, imag: Float64Array }} The transformed signal
 *   with fresh Float64Array buffers of length `real.length`.
 * @throws {TypeError} If `real` is not a Float64Array, `imag` (when provided)
 *   is not a Float64Array, `options` is not a plain object, or `options.inverse`
 *   is not a boolean.
 * @throws {RangeError} If `imag.length !== real.length` or any input element
 *   is non-finite (NaN, Infinity, -Infinity).
 */
export function fourierTransformTypedRecursive(real, imag, options) {
	validateInputs(real, imag, options);

	const n = real.length;
	const inverse = options?.inverse ?? false;

	if (n === 0) {
		return {
			real: new Float64Array(0),
			imag: new Float64Array(0),
		};
	}

	const inputImag = imag ?? new Float64Array(n);
	const sign = inverse ? 1 : -1;
	const { real: outReal, imag: outImag } = fftRecursive(real, inputImag, sign);

	if (inverse) {
		const invN = 1 / n;
		for (let i = 0; i < n; i++) {
			outReal[i] *= invN;
			outImag[i] *= invN;
		}
	}

	return { real: outReal, imag: outImag };
}

/**
 * Validates arguments to `fourierTransformTypedRecursive`.
 *
 * @param {unknown} real
 * @param {unknown} imag
 * @param {unknown} options
 */
function validateInputs(real, imag, options) {
	if (!(real instanceof Float64Array)) {
		throw new TypeError("Expected 'real' to be a Float64Array");
	}

	if (imag !== undefined) {
		if (!(imag instanceof Float64Array)) {
			throw new TypeError("Expected 'imag' to be a Float64Array when provided");
		}
		if (imag.length !== real.length) {
			throw new RangeError(
				`Expected 'imag' length (${imag.length}) to match 'real' length (${real.length})`,
			);
		}
	}

	if (options !== undefined) {
		if (
			typeof options !== "object" ||
			options === null ||
			Array.isArray(options)
		) {
			throw new TypeError("Expected 'options' to be a plain object when provided");
		}
		if (
			options.inverse !== undefined &&
			typeof options.inverse !== "boolean"
		) {
			throw new TypeError("Expected 'options.inverse' to be a boolean when provided");
		}
	}

	for (let i = 0; i < real.length; i++) {
		if (!Number.isFinite(real[i])) {
			throw new RangeError(
				`Expected all elements of 'real' to be finite numbers (found ${real[i]} at index ${i})`,
			);
		}
	}

	if (imag !== undefined) {
		for (let i = 0; i < imag.length; i++) {
			if (!Number.isFinite(imag[i])) {
				throw new RangeError(
					`Expected all elements of 'imag' to be finite numbers (found ${imag[i]} at index ${i})`,
				);
			}
		}
	}
}

/**
 * Unnormalized recursive divide-and-conquer FFT over Float64Array pairs.
 *
 * - Base case (n === 1): returns fresh 1-element Float64Arrays.
 * - Even n: splits into even/odd Float64Array halves, recurses on both halves,
 *   and merges element-wise via Cooley-Tukey butterfly twiddle factors.
 * - Odd n > 1: reduces to power-of-2 recursive radix-2 FFT via Bluestein's
 *   chirp-z algorithm.
 *
 * @param {Float64Array} re - Real part of length n >= 1.
 * @param {Float64Array} im - Imaginary part of length n >= 1.
 * @param {1 | -1} sign - Exponent sign (-1 for forward, +1 for inverse).
 * @returns {{ real: Float64Array, imag: Float64Array }}
 */
function fftRecursive(re, im, sign) {
	const n = re.length;

	if (n === 1) {
		const outRe = new Float64Array(1);
		const outIm = new Float64Array(1);
		outRe[0] = re[0];
		outIm[0] = im[0];
		return { real: outRe, imag: outIm };
	}

	if ((n & 1) === 0) {
		const half = n >>> 1;
		const evenRe = new Float64Array(half);
		const evenIm = new Float64Array(half);
		const oddRe = new Float64Array(half);
		const oddIm = new Float64Array(half);

		for (let i = 0; i < half; i++) {
			const idx = i << 1;
			evenRe[i] = re[idx];
			evenIm[i] = im[idx];
			oddRe[i] = re[idx + 1];
			oddIm[i] = im[idx + 1];
		}

		const even = fftRecursive(evenRe, evenIm, sign);
		const odd = fftRecursive(oddRe, oddIm, sign);

		const outRe = new Float64Array(n);
		const outIm = new Float64Array(n);
		const baseAngle = (sign * 2 * Math.PI) / n;

		for (let k = 0; k < half; k++) {
			const angle = baseAngle * k;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);

			const oddKRe = odd.real[k];
			const oddKIm = odd.imag[k];
			const tRe = cos * oddKRe - sin * oddKIm;
			const tIm = sin * oddKRe + cos * oddKIm;

			const evenKRe = even.real[k];
			const evenKIm = even.imag[k];

			outRe[k] = evenKRe + tRe;
			outIm[k] = evenKIm + tIm;
			outRe[k + half] = evenKRe - tRe;
			outIm[k + half] = evenKIm - tIm;
		}

		return { real: outRe, imag: outIm };
	}

	return bluesteinRecursive(re, im, sign);
}

/**
 * Computes an arbitrary odd-length DFT via Bluestein's chirp-z algorithm,
 * delegating the power-of-2 circular convolution to `fftRecursive`.
 *
 * Uses the identity:
 *   exp(sign * i * 2*pi*n*k / N) =
 *     exp(sign * i * pi*k^2 / N) *
 *     exp(sign * i * pi*n^2 / N) *
 *     exp(-sign * i * pi*(k - n)^2 / N)
 *
 * @param {Float64Array} re - Real part of odd length n >= 3.
 * @param {Float64Array} im - Imaginary part of odd length n >= 3.
 * @param {1 | -1} sign - Exponent sign (-1 for forward, +1 for inverse).
 * @returns {{ real: Float64Array, imag: Float64Array }}
 */
function bluesteinRecursive(re, im, sign) {
	const n = re.length;
	let m = 1;
	while (m < 2 * n - 1) {
		m <<= 1;
	}

	const twoN = 2 * n;
	const chirpRe = new Float64Array(n);
	const chirpIm = new Float64Array(n);

	for (let k = 0; k < n; k++) {
		// Compute (k * k) % (2 * n) using BigInt to prevent precision loss for large k
		const kSqMod = Number((BigInt(k) * BigInt(k)) % BigInt(twoN));
		const angle = (sign * Math.PI * kSqMod) / n;
		chirpRe[k] = Math.cos(angle);
		chirpIm[k] = Math.sin(angle);
	}

	const aRe = new Float64Array(m);
	const aIm = new Float64Array(m);
	for (let k = 0; k < n; k++) {
		const rk = re[k];
		const ik = im[k];
		const cr = chirpRe[k];
		const ci = chirpIm[k];
		aRe[k] = rk * cr - ik * ci;
		aIm[k] = rk * ci + ik * cr;
	}

	const bRe = new Float64Array(m);
	const bIm = new Float64Array(m);
	bRe[0] = chirpRe[0];
	bIm[0] = -chirpIm[0];
	for (let k = 1; k < n; k++) {
		const cr = chirpRe[k];
		const ci = -chirpIm[k];
		bRe[k] = cr;
		bIm[k] = ci;
		bRe[m - k] = cr;
		bIm[m - k] = ci;
	}

	const fa = fftRecursive(aRe, aIm, -1);
	const fb = fftRecursive(bRe, bIm, -1);

	const prodRe = new Float64Array(m);
	const prodIm = new Float64Array(m);
	for (let k = 0; k < m; k++) {
		prodRe[k] = fa.real[k] * fb.real[k] - fa.imag[k] * fb.imag[k];
		prodIm[k] = fa.real[k] * fb.imag[k] + fa.imag[k] * fb.real[k];
	}

	const conv = fftRecursive(prodRe, prodIm, 1);
	const invM = 1 / m;

	const outRe = new Float64Array(n);
	const outIm = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		const convRe = conv.real[k] * invM;
		const convIm = conv.imag[k] * invM;
		const cr = chirpRe[k];
		const ci = chirpIm[k];
		outRe[k] = convRe * cr - convIm * ci;
		outIm[k] = convRe * ci + convIm * cr;
	}

	return { real: outRe, imag: outIm };
}
