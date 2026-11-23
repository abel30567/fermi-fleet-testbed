import test from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformTypedMemo } from './fourierTransformTypedMemo.js';

/**
 * Independent first-principles O(N^2) Discrete Fourier Transform reference
 * implementation used for cross-checking both radix-2 FFT and cyclic-table paths.
 *
 * @param {Float64Array} real
 * @param {Float64Array | null} imag
 * @param {boolean} inverse
 */
function referenceNaiveDft(real, imag = null, inverse = false) {
	const n = real.length;
	const outReal = new Float64Array(n);
	const outImag = new Float64Array(n);
	const sign = inverse ? 1 : -1;
	const scale = inverse ? 1 / n : 1;

	for (let k = 0; k < n; k++) {
		let sumRe = 0;
		let sumIm = 0;
		for (let t = 0; t < n; t++) {
			const angle = (sign * 2 * Math.PI * k * t) / n;
			const c = Math.cos(angle);
			const s = Math.sin(angle);
			const xr = real[t];
			const xi = imag ? imag[t] : 0;
			sumRe += xr * c - xi * s;
			sumIm += xr * s + xi * c;
		}
		outReal[k] = sumRe * scale;
		outImag[k] = sumIm * scale;
	}
	return { real: outReal, imag: outImag };
}

/**
 * Asserts two Float64Arrays are element-wise close within tolerance.
 */
function assertTypedArrayClose(actual, expected, tol = 1e-10, label = '') {
	assert.ok(actual instanceof Float64Array, `${label} actual must be Float64Array`);
	assert.equal(actual.length, expected.length, `${label} length mismatch`);
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		assert.ok(
			diff <= tol,
			`${label}[${i}]: expected ${expected[i]}, got ${actual[i]} (diff=${diff} > ${tol})`
		);
	}
}

test('impulse signal transforms to flat all-ones spectrum', () => {
	const input = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]);
	const res = fourierTransformTypedMemo(input);

	assertTypedArrayClose(res.real, new Float64Array(8).fill(1), 1e-12, 'real');
	assertTypedArrayClose(res.imag, new Float64Array(8).fill(0), 1e-12, 'imag');
	assertTypedArrayClose(res.magnitude, new Float64Array(8).fill(1), 1e-12, 'magnitude');
	assertTypedArrayClose(res.phase, new Float64Array(8).fill(0), 1e-12, 'phase');
});

test('constant DC signal concentrates all energy in bin 0', () => {
	const n = 8;
	const dc = 3.5;
	const input = new Float64Array(n).fill(dc);
	const res = fourierTransformTypedMemo(input);

	const expectedReal = new Float64Array(n);
	expectedReal[0] = n * dc;
	assertTypedArrayClose(res.real, expectedReal, 1e-12, 'real');
	assertTypedArrayClose(res.imag, new Float64Array(n), 1e-12, 'imag');
	assertTypedArrayClose(res.magnitude, expectedReal, 1e-12, 'magnitude');
});

test('pure cosine and sine tones produce exact analytical spectral peaks', () => {
	const n = 16;
	const freq = 3;
	const cosSig = new Float64Array(n);
	const sinSig = new Float64Array(n);
	for (let t = 0; t < n; t++) {
		const angle = (2 * Math.PI * freq * t) / n;
		cosSig[t] = Math.cos(angle);
		sinSig[t] = Math.sin(angle);
	}

	const cosRes = fourierTransformTypedMemo(cosSig);
	const expectedCosReal = new Float64Array(n);
	expectedCosReal[freq] = n / 2;
	expectedCosReal[n - freq] = n / 2;
	assertTypedArrayClose(cosRes.real, expectedCosReal, 1e-11, 'cos.real');
	assertTypedArrayClose(cosRes.imag, new Float64Array(n), 1e-11, 'cos.imag');

	const sinRes = fourierTransformTypedMemo(sinSig);
	const expectedSinImag = new Float64Array(n);
	expectedSinImag[freq] = -n / 2;
	expectedSinImag[n - freq] = n / 2;
	assertTypedArrayClose(sinRes.real, new Float64Array(n), 1e-11, 'sin.real');
	assertTypedArrayClose(sinRes.imag, expectedSinImag, 1e-11, 'sin.imag');
});

test('independent cross-check against naive O(N^2) DFT for power-of-2 and non-power-of-2 lengths', () => {
	const lengths = [2, 3, 4, 5, 6, 7, 8, 12, 15, 16, 32, 37, 64];

	for (const n of lengths) {
		const re = new Float64Array(n);
		const im = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			re[i] = Math.sin(i * 1.37 + 0.25) * 2.5 - Math.cos(i * 0.73);
			im[i] = Math.cos(i * 0.91 - 0.5) * 1.75;
		}

		const fwd = fourierTransformTypedMemo(re, im);
		const refFwd = referenceNaiveDft(re, im, false);
		assertTypedArrayClose(fwd.real, refFwd.real, 1e-9, `fwd real N=${n}`);
		assertTypedArrayClose(fwd.imag, refFwd.imag, 1e-9, `fwd imag N=${n}`);

		const inv = fourierTransformTypedMemo(fwd.real, fwd.imag, { inverse: true });
		const refInv = referenceNaiveDft(fwd.real, fwd.imag, true);
		assertTypedArrayClose(inv.real, refInv.real, 1e-9, `inv vs ref real N=${n}`);
		assertTypedArrayClose(inv.imag, refInv.imag, 1e-9, `inv vs ref imag N=${n}`);
		assertTypedArrayClose(inv.real, re, 1e-9, `round-trip real N=${n}`);
		assertTypedArrayClose(inv.imag, im, 1e-9, `round-trip imag N=${n}`);
	}
});

test('satisfies Parseval energy conservation, linearity, and conjugate symmetry', () => {
	const n = 24; // non-power-of-two
	const x = new Float64Array(n);
	const y = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		x[i] = Math.sin(0.4 * i) + 0.3 * i - 2;
		y[i] = Math.cos(0.9 * i) * 1.5;
	}

	const fx = fourierTransformTypedMemo(x);
	const fy = fourierTransformTypedMemo(y);

	// 1. Parseval's theorem: sum(|x[n]|^2) === (1/N) * sum(|X[k]|^2)
	let timeEnergy = 0;
	let freqEnergy = 0;
	for (let i = 0; i < n; i++) {
		timeEnergy += x[i] * x[i];
		freqEnergy += fx.magnitude[i] * fx.magnitude[i];
	}
	assert.ok(
		Math.abs(timeEnergy - freqEnergy / n) < 1e-10,
		`Parseval mismatch: time=${timeEnergy}, freq/N=${freqEnergy / n}`
	);

	// 2. Conjugate symmetry for real-valued input: X[N - k] === conj(X[k])
	for (let k = 1; k < n; k++) {
		assert.ok(Math.abs(fx.real[k] - fx.real[n - k]) < 1e-11);
		assert.ok(Math.abs(fx.imag[k] + fx.imag[n - k]) < 1e-11);
	}

	// 3. Linearity: F(a*x + b*y) === a*F(x) + b*F(y)
	const a = 2.25;
	const b = -1.75;
	const combined = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		combined[i] = a * x[i] + b * y[i];
	}
	const fComb = fourierTransformTypedMemo(combined);
	const expectedRe = new Float64Array(n);
	const expectedIm = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		expectedRe[k] = a * fx.real[k] + b * fy.real[k];
		expectedIm[k] = a * fx.imag[k] + b * fy.imag[k];
	}
	assertTypedArrayClose(fComb.real, expectedRe, 1e-10, 'linearity real');
	assertTypedArrayClose(fComb.imag, expectedIm, 1e-10, 'linearity imag');
});

test('edge cases: empty array, length-1 array, negative zero, and large power-of-2', () => {
	// Empty input
	const empty = fourierTransformTypedMemo(new Float64Array(0));
	assert.equal(empty.real.length, 0);
	assert.equal(empty.imag.length, 0);
	assert.equal(empty.magnitude.length, 0);
	assert.equal(empty.phase.length, 0);

	// Length 1 (real and complex)
	const single = fourierTransformTypedMemo(new Float64Array([-4.5]), new Float64Array([2]));
	assertTypedArrayClose(single.real, new Float64Array([-4.5]), 1e-12);
	assertTypedArrayClose(single.imag, new Float64Array([2]), 1e-12);
	assert.ok(Math.abs(single.magnitude[0] - Math.hypot(-4.5, 2)) < 1e-12);
	assert.ok(Math.abs(single.phase[0] - Math.atan2(2, -4.5)) < 1e-12);

	// -0 and +0 consistency
	const negZero = fourierTransformTypedMemo(new Float64Array([-0, 1, -0, -1]));
	const posZero = fourierTransformTypedMemo(new Float64Array([0, 1, 0, -1]));
	assertTypedArrayClose(negZero.real, posZero.real, 1e-12);
	assertTypedArrayClose(negZero.imag, posZero.imag, 1e-12);

	// Larger power-of-two (N=512) round-trip
	const bigN = 512;
	const bigInput = new Float64Array(bigN);
	for (let i = 0; i < bigN; i++) {
		bigInput[i] = Math.sin((2 * Math.PI * 17 * i) / bigN) + 0.5 * Math.cos((2 * Math.PI * 63 * i) / bigN);
	}
	const bigFwd = fourierTransformTypedMemo(bigInput);
	const bigInv = fourierTransformTypedMemo(bigFwd.real, bigFwd.imag, { inverse: true });
	assertTypedArrayClose(bigInv.real, bigInput, 1e-10, 'N=512 round-trip real');
	assertTypedArrayClose(bigInv.imag, new Float64Array(bigN), 1e-10, 'N=512 round-trip imag');
});

test('memoization returns consistent results and isolates cached buffers from caller mutation', () => {
	const input = new Float64Array([1.5, -2.25, 3.75, 0.5, -1.0, 2.0, -0.5, 4.0]);
	const inputSnapshot = input.slice();

	const first = fourierTransformTypedMemo(input);
	const firstRealCopy = first.real.slice();
	const firstImagCopy = first.imag.slice();

	// Mutate caller's returned arrays aggressively
	first.real.fill(999999);
	first.imag.fill(-999999);
	first.magnitude.fill(0);
	first.phase.fill(0);

	// Second call must hit cache cleanly without seeing mutated buffers
	const second = fourierTransformTypedMemo(input);
	assert.deepStrictEqual(second.real, firstRealCopy);
	assert.deepStrictEqual(second.imag, firstImagCopy);
	// Input must not be mutated
	assert.deepStrictEqual(input, inputSnapshot);

	// Explicit all-zero imag array matches omitted imag array
	const withZeroImag = fourierTransformTypedMemo(input, new Float64Array(input.length));
	assert.deepStrictEqual(withZeroImag.real, firstRealCopy);
	assert.deepStrictEqual(withZeroImag.imag, firstImagCopy);
});

test('input validation rejects non-Float64Array, mismatched lengths, non-finite values, and bad options', () => {
	assert.throws(() => fourierTransformTypedMemo([1, 2, 3, 4]), TypeError);
	assert.throws(() => fourierTransformTypedMemo(new Float32Array([1, 2])), TypeError);
	assert.throws(() => fourierTransformTypedMemo(null), TypeError);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, 2]), [0, 0]),
		TypeError
	);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
		RangeError
	);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, Number.NaN, 3])),
		RangeError
	);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, Number.POSITIVE_INFINITY])),
		RangeError
	);
	assert.throws(
		() =>
			fourierTransformTypedMemo(
				new Float64Array([1, 2]),
				new Float64Array([0, Number.NEGATIVE_INFINITY])
			),
		RangeError
	);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, 2]), null, null),
		TypeError
	);
	assert.throws(
		() => fourierTransformTypedMemo(new Float64Array([1, 2]), null, { inverse: 'yes' }),
		TypeError
	);
});
