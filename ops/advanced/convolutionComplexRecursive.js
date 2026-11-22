/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes `-0` to `0` while leaving all other numbers unchanged.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that an input is an array of finite complex `{ re, im }` objects
 * and returns a shallow copy of normalized complex objects.
 *
 * @param {unknown} seq - Input value to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Complex[]} Validated complex sequence.
 * @throws {TypeError} If `seq` is not an array or contains invalid complex elements.
 * @throws {RangeError} If any complex element has non-finite `re` or `im`.
 */
function validateComplexSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of complex { re, im } objects`);
	}

	const copy = new Array(seq.length);
	for (let i = 0; i < seq.length; i++) {
		const el = seq[i];
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a non-null complex { re, im } object`);
		}
		const { re, im } = el;
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`${name}[${i}] must have numeric re and im properties`);
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`${name}[${i}] must have finite re and im properties`);
		}
		copy[i] = { re: normalizeZero(re), im: normalizeZero(im) };
	}

	return copy;
}

/**
 * Computes the radix-2 Fast Fourier Transform (or unscaled inverse FFT)
 * of a complex sequence whose length is a power of two, using the recursive
 * divide-and-conquer Cooley-Tukey algorithm.
 *
 * @param {Complex[]} x - Complex input sequence of power-of-two length.
 * @param {boolean} invert - If `false`, computes forward DFT; if `true`, computes unscaled inverse DFT.
 * @returns {Complex[]} Transformed complex sequence of the same length.
 */
function fftRecursive(x, invert) {
	const n = x.length;
	if (n === 1) {
		return [{ re: x[0].re, im: x[0].im }];
	}

	const half = n / 2;
	const even = new Array(half);
	const odd = new Array(half);
	for (let i = 0; i < half; i++) {
		even[i] = x[2 * i];
		odd[i] = x[2 * i + 1];
	}

	const yEven = fftRecursive(even, invert);
	const yOdd = fftRecursive(odd, invert);

	const out = new Array(n);
	const sign = invert ? 1 : -1;
	const angleStep = (sign * 2 * Math.PI) / n;

	for (let k = 0; k < half; k++) {
		let wRe;
		let wIm;
		if (k === 0) {
			wRe = 1;
			wIm = 0;
		} else if (4 * k === n) {
			wRe = 0;
			wIm = sign;
		} else {
			const angle = angleStep * k;
			wRe = Math.cos(angle);
			wIm = Math.sin(angle);
		}

		const oddK = yOdd[k];
		const tRe = wRe * oddK.re - wIm * oddK.im;
		const tIm = wRe * oddK.im + wIm * oddK.re;

		const evenK = yEven[k];
		out[k] = {
			re: evenK.re + tRe,
			im: evenK.im + tIm,
		};
		out[k + half] = {
			re: evenK.re - tRe,
			im: evenK.im - tIm,
		};
	}

	return out;
}

/**
 * Pads a complex sequence with `{ re: 0, im: 0 }` up to the target length.
 *
 * @param {Complex[]} seq - Input complex sequence.
 * @param {number} targetLength - Desired padded length (`>= seq.length`).
 * @returns {Complex[]} Zero-padded sequence.
 */
function zeroPad(seq, targetLength) {
	const padded = new Array(targetLength);
	for (let i = 0; i < seq.length; i++) {
		padded[i] = seq[i];
	}
	for (let i = seq.length; i < targetLength; i++) {
		padded[i] = { re: 0, im: 0 };
	}
	return padded;
}

/**
 * Computes the discrete linear convolution of two complex sequences
 * using a recursive divide-and-conquer Cooley-Tukey radix-2 FFT.
 *
 * For non-empty sequences `a` (length `M`) and `b` (length `N`), the output
 * has length `M + N - 1`, where:
 *
 *   `(a * b)[k] = sum_{j = max(0, k - N + 1)}^{min(k, M - 1)} a[j] * b[k - j]`
 *
 * If either `a` or `b` is empty, returns `[]`.
 *
 * Algorithm:
 * 1. Validate both input sequences.
 * 2. Zero-pad both sequences to the smallest power of two `L >= M + N - 1`.
 * 3. Recursively transform both padded sequences with radix-2 Cooley-Tukey FFT.
 * 4. Multiply spectra pointwise in the frequency domain.
 * 5. Recursively apply the inverse FFT, scale by `1 / L`, normalize `-0` to `0`,
 *    and truncate to length `M + N - 1`.
 *
 * Time complexity: `O((M + N) log(M + N))`.
 *
 * @param {readonly Complex[]} a - First complex sequence.
 * @param {readonly Complex[]} b - Second complex sequence.
 * @returns {Complex[]} Discrete linear convolution of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a `{ re, im }` object with numeric `re` and `im`.
 * @throws {RangeError} If any element has non-finite (`NaN`, `Infinity`, `-Infinity`) `re` or `im`.
 */
export function convolutionComplexRecursive(a, b) {
	const seqA = validateComplexSequence(a, 'a');
	const seqB = validateComplexSequence(b, 'b');

	if (seqA.length === 0 || seqB.length === 0) {
		return [];
	}

	const outLen = seqA.length + seqB.length - 1;
	let fftSize = 1;
	while (fftSize < outLen) {
		fftSize *= 2;
	}

	const paddedA = zeroPad(seqA, fftSize);
	const paddedB = zeroPad(seqB, fftSize);

	const freqA = fftRecursive(paddedA, false);
	const freqB = fftRecursive(paddedB, false);

	const freqProd = new Array(fftSize);
	for (let i = 0; i < fftSize; i++) {
		const fa = freqA[i];
		const fb = freqB[i];
		freqProd[i] = {
			re: fa.re * fb.re - fa.im * fb.im,
			im: fa.re * fb.im + fa.im * fb.re,
		};
	}

	const rawConv = fftRecursive(freqProd, true);

	const result = new Array(outLen);
	for (let i = 0; i < outLen; i++) {
		result[i] = {
			re: normalizeZero(rawConv[i].re / fftSize),
			im: normalizeZero(rawConv[i].im / fftSize),
		};
	}

	return result;
}
