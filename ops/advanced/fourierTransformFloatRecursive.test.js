import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformFloatRecursive } from './fourierTransformFloatRecursive.js';

/**
 * Independent O(N^2) direct DFT reference implementation for cross-checking.
 *
 * @param {Array<number | { re: number, im: number }>} signal
 * @param {boolean} [inverse=false]
 * @returns {Array<{ re: number, im: number }>}
 */
function naiveDft(signal, inverse = false) {
	const n = signal.length;
	const sign = inverse ? 1 : -1;
	const out = new Array(n);

	for (let k = 0; k < n; k++) {
		let sumRe = 0;
		let sumIm = 0;
		for (let t = 0; t < n; t++) {
			const sample = typeof signal[t] === 'number'
				? { re: signal[t], im: 0 }
				: signal[t];
			const angle = (sign * 2 * Math.PI * k * t) / n;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			sumRe += sample.re * cos - sample.im * sin;
			sumIm += sample.re * sin + sample.im * cos;
		}
		if (inverse) {
			sumRe /= n;
			sumIm /= n;
		}
		out[k] = { re: sumRe, im: sumIm };
	}

	return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible floating-point test signals.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Asserts two complex arrays are element-wise close within tolerance.
 *
 * @param {Array<{ re: number, im: number }>} actual
 * @param {Array<{ re: number, im: number }>} expected
 * @param {number} [tol=1e-10]
 */
function assertComplexArrayClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= tol,
			`Index ${i} real part mismatch: got ${actual[i].re}, expected ${expected[i].re}`
		);
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= tol,
			`Index ${i} imag part mismatch: got ${actual[i].im}, expected ${expected[i].im}`
		);
	}
}

describe('fourierTransformFloatRecursive', () => {
	describe('normal cases', () => {
		it('computes DFT of a unit impulse (delta function)', () => {
			const res = fourierTransformFloatRecursive([1, 0, 0, 0, 0, 0, 0, 0]);
			const expected = Array.from({ length: 8 }, () => ({ re: 1, im: 0 }));
			assertComplexArrayClose(res, expected);
		});

		it('computes DFT of a constant (DC) signal', () => {
			const res = fourierTransformFloatRecursive([3.5, 3.5, 3.5, 3.5]);
			const expected = [
				{ re: 14, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];
			assertComplexArrayClose(res, expected);
		});

		it('computes DFT of an alternating Nyquist signal', () => {
			const res = fourierTransformFloatRecursive([1, -1, 1, -1]);
			const expected = [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 4, im: 0 },
				{ re: 0, im: 0 },
			];
			assertComplexArrayClose(res, expected);
		});

		it('detects pure cosine and sine wave frequencies accurately', () => {
			const n = 16;
			const cosSignal = Array.from({ length: n }, (_, t) =>
				Math.cos((2 * Math.PI * 3 * t) / n)
			);
			const cosOut = fourierTransformFloatRecursive(cosSignal);
			for (let k = 0; k < n; k++) {
				const expectedRe = k === 3 || k === n - 3 ? n / 2 : 0;
				assert.ok(Math.abs(cosOut[k].re - expectedRe) < 1e-11);
				assert.ok(Math.abs(cosOut[k].im) < 1e-11);
			}

			const sinSignal = Array.from({ length: n }, (_, t) =>
				Math.sin((2 * Math.PI * 5 * t) / n)
			);
			const sinOut = fourierTransformFloatRecursive(sinSignal);
			for (let k = 0; k < n; k++) {
				let expectedIm = 0;
				if (k === 5) expectedIm = -n / 2;
				if (k === n - 5) expectedIm = n / 2;
				assert.ok(Math.abs(sinOut[k].re) < 1e-11);
				assert.ok(Math.abs(sinOut[k].im - expectedIm) < 1e-11);
			}
		});

		it('transforms complex exponential signals to a single frequency bin', () => {
			const n = 8;
			const k0 = 3;
			const signal = Array.from({ length: n }, (_, t) => ({
				re: Math.cos((2 * Math.PI * k0 * t) / n),
				im: Math.sin((2 * Math.PI * k0 * t) / n),
			}));
			const out = fourierTransformFloatRecursive(signal);
			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === k0 ? n : 0,
				im: 0,
			}));
			assertComplexArrayClose(out, expected);
		});

		it('supports Float64Array inputs', () => {
			const typed = new Float64Array([1.25, -2.5, 3.75, -0.5]);
			const fromTyped = fourierTransformFloatRecursive(typed);
			const fromArray = fourierTransformFloatRecursive(Array.from(typed));
			assertComplexArrayClose(fromTyped, fromArray, 1e-15);
		});

		it('recovers original signals via inverse transform across power-of-2, composite, and prime lengths', () => {
			const rand = createPrng(12345);
			for (const n of [4, 6, 7, 9, 12, 13, 16, 15, 32]) {
				const signal = Array.from({ length: n }, () => ({
					re: rand() * 20 - 10,
					im: rand() * 20 - 10,
				}));
				const spectrum = fourierTransformFloatRecursive(signal);
				const recovered = fourierTransformFloatRecursive(spectrum, { inverse: true });
				assertComplexArrayClose(recovered, signal, 1e-10);
			}
		});
	});

	describe('edge cases', () => {
		it('handles empty arrays and empty Float64Arrays', () => {
			assert.deepEqual(fourierTransformFloatRecursive([]), []);
			assert.deepEqual(fourierTransformFloatRecursive([], { inverse: true }), []);
			assert.deepEqual(fourierTransformFloatRecursive(new Float64Array(0)), []);
		});

		it('handles length-1 real and complex inputs', () => {
			assert.deepEqual(fourierTransformFloatRecursive([42.5]), [{ re: 42.5, im: 0 }]);
			assert.deepEqual(
				fourierTransformFloatRecursive([{ re: -3.25, im: 7.5 }], { inverse: true }),
				[{ re: -3.25, im: 7.5 }]
			);
		});

		it('handles length-2 inputs accurately', () => {
			assertComplexArrayClose(fourierTransformFloatRecursive([5, -2]), [
				{ re: 3, im: 0 },
				{ re: 7, im: 0 },
			]);
		});

		it('normalizes negative zero and handles all-zero signals', () => {
			const res = fourierTransformFloatRecursive([-0, -0, -0, -0]);
			for (const bin of res) {
				assert.ok(Object.is(bin.re, 0));
				assert.ok(Object.is(bin.im, 0));
			}
		});

		it('handles very small and very large finite float64 magnitudes', () => {
			const tiny = [1e-100, -1e-100, 1e-100, -1e-100];
			const tinyRes = fourierTransformFloatRecursive(tiny);
			assert.ok(Math.abs(tinyRes[2].re - 4e-100) <= 1e-112);

			const large = [1e100, 1e100, 1e100, 1e100];
			const largeRes = fourierTransformFloatRecursive(large);
			assert.ok(Math.abs(largeRes[0].re - 4e100) <= 1e88);
		});

		it('does not mutate input array or complex element objects', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: 3, im: -4 },
				{ re: -5, im: 6 },
			];
			const snapshot = structuredClone(input);
			fourierTransformFloatRecursive(input);
			assert.deepEqual(input, snapshot);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-Array / non-Float64Array signal inputs', () => {
			for (const bad of [null, undefined, 123, '123', {}, new Int32Array([1, 2])]) {
				assert.throws(
					() => fourierTransformFloatRecursive(bad),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws TypeError for invalid element types in signal', () => {
			assert.throws(() => fourierTransformFloatRecursive(['1', 2]), { name: 'TypeError' });
			assert.throws(() => fourierTransformFloatRecursive([null]), { name: 'TypeError' });
			assert.throws(() => fourierTransformFloatRecursive([undefined]), { name: 'TypeError' });
			assert.throws(() => fourierTransformFloatRecursive([1n]), { name: 'TypeError' });
			assert.throws(() => fourierTransformFloatRecursive([{ re: 1 }]), { name: 'TypeError' });
			assert.throws(() => fourierTransformFloatRecursive([{ re: '1', im: 0 }]), {
				name: 'TypeError',
			});
		});

		it('throws RangeError for non-finite IEEE-754 float64 values', () => {
			for (const badVal of [NaN, Infinity, -Infinity]) {
				assert.throws(() => fourierTransformFloatRecursive([1, badVal]), {
					name: 'RangeError',
				});
				assert.throws(
					() => fourierTransformFloatRecursive(new Float64Array([1, badVal])),
					{ name: 'RangeError' }
				);
				assert.throws(
					() => fourierTransformFloatRecursive([{ re: badVal, im: 0 }]),
					{ name: 'RangeError' }
				);
				assert.throws(
					() => fourierTransformFloatRecursive([{ re: 0, im: badVal }]),
					{ name: 'RangeError' }
				);
			}
		});

		it('throws TypeError for invalid options argument', () => {
			assert.throws(() => fourierTransformFloatRecursive([1, 2], null), {
				name: 'TypeError',
			});
			assert.throws(() => fourierTransformFloatRecursive([1, 2], 'inverse'), {
				name: 'TypeError',
			});
			assert.throws(() => fourierTransformFloatRecursive([1, 2], []), {
				name: 'TypeError',
			});
			assert.throws(() => fourierTransformFloatRecursive([1, 2], { inverse: 1 }), {
				name: 'TypeError',
			});
		});
	});

	describe('independent cross-checks', () => {
		it('matches O(N^2) naive DFT across power-of-2, composite, and prime lengths', () => {
			const rand = createPrng(987654);
			const lengths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 24, 32];

			for (const n of lengths) {
				const signal = Array.from({ length: n }, () => ({
					re: rand() * 10 - 5,
					im: rand() * 10 - 5,
				}));

				const forwardActual = fourierTransformFloatRecursive(signal);
				const forwardRef = naiveDft(signal, false);
				assertComplexArrayClose(forwardActual, forwardRef, 1e-10);

				const inverseActual = fourierTransformFloatRecursive(signal, { inverse: true });
				const inverseRef = naiveDft(signal, true);
				assertComplexArrayClose(inverseActual, inverseRef, 1e-10);
			}
		});

		it('satisfies Parseval energy conservation theorem', () => {
			const rand = createPrng(2026);
			for (const n of [7, 12, 16, 25]) {
				const signal = Array.from({ length: n }, () => ({
					re: rand() * 6 - 3,
					im: rand() * 6 - 3,
				}));
				const spectrum = fourierTransformFloatRecursive(signal);

				const timeEnergy = signal.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0);
				const freqEnergy =
					spectrum.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0) / n;

				assert.ok(
					Math.abs(timeEnergy - freqEnergy) < 1e-10,
					`Parseval mismatch for N=${n}: time=${timeEnergy}, freq=${freqEnergy}`
				);
			}
		});

		it('satisfies linearity and Hermitian conjugate symmetry for real inputs', () => {
			const rand = createPrng(777);
			const n = 14;
			const x = Array.from({ length: n }, () => rand() * 4 - 2);
			const y = Array.from({ length: n }, () => rand() * 4 - 2);
			const a = 2.5;
			const b = -1.75;

			const combined = x.map((xi, i) => a * xi + b * y[i]);
			const fftCombined = fourierTransformFloatRecursive(combined);
			const fftX = fourierTransformFloatRecursive(x);
			const fftY = fourierTransformFloatRecursive(y);
			const linearExpected = fftX.map((fx, k) => ({
				re: a * fx.re + b * fftY[k].re,
				im: a * fx.im + b * fftY[k].im,
			}));
			assertComplexArrayClose(fftCombined, linearExpected, 1e-10);

			// Conjugate symmetry: X[N - k] = conj(X[k]) for real input x
			for (let k = 1; k < n; k++) {
				assert.ok(Math.abs(fftX[n - k].re - fftX[k].re) < 1e-10);
				assert.ok(Math.abs(fftX[n - k].im + fftX[k].im) < 1e-10);
			}
		});

		it('satisfies the circular convolution theorem', () => {
			const rand = createPrng(314159);
			const n = 12;
			const a = Array.from({ length: n }, () => rand() * 5 - 2.5);
			const b = Array.from({ length: n }, () => rand() * 5 - 2.5);

			// Direct circular convolution
			const directConv = new Array(n);
			for (let k = 0; k < n; k++) {
				let sum = 0;
				for (let m = 0; m < n; m++) {
					sum += a[m] * b[(k - m + n) % n];
				}
				directConv[k] = { re: sum, im: 0 };
			}

			// FFT-based circular convolution
			const fftA = fourierTransformFloatRecursive(a);
			const fftB = fourierTransformFloatRecursive(b);
			const prod = fftA.map((fa, k) => ({
				re: fa.re * fftB[k].re - fa.im * fftB[k].im,
				im: fa.re * fftB[k].im + fa.im * fftB[k].re,
			}));
			const fftConv = fourierTransformFloatRecursive(prod, { inverse: true });

			assertComplexArrayClose(fftConv, directConv, 1e-10);
		});
	});
});
