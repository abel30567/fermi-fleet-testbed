import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fourierTransformTypedRecursive } from "./fourierTransformTypedRecursive.js";

/**
 * Independent direct O(N^2) DFT implementation used solely as a mathematical
 * cross-check reference.
 *
 * @param {Float64Array} real
 * @param {Float64Array} [imag]
 * @param {boolean} [inverse=false]
 * @returns {{ real: Float64Array, imag: Float64Array }}
 */
function naiveDft(real, imag = new Float64Array(real.length), inverse = false) {
	const n = real.length;
	const outRe = new Float64Array(n);
	const outIm = new Float64Array(n);
	const sign = inverse ? 1 : -1;
	const scale = inverse ? 1 / n : 1;

	for (let k = 0; k < n; k++) {
		let sumRe = 0;
		let sumIm = 0;
		for (let t = 0; t < n; t++) {
			const angle = (sign * 2 * Math.PI * k * t) / n;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			sumRe += real[t] * cos - imag[t] * sin;
			sumIm += real[t] * sin + imag[t] * cos;
		}
		outRe[k] = sumRe * scale;
		outIm[k] = sumIm * scale;
	}

	return { real: outRe, imag: outIm };
}

/**
 * Deterministic pseudo-random signal generator (LCG) for reproducible tests.
 *
 * @param {number} n
 * @param {number} seed
 * @returns {Float64Array}
 */
function deterministicSignal(n, seed) {
	const out = new Float64Array(n);
	let state = seed >>> 0;
	for (let i = 0; i < n; i++) {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		out[i] = (state / 0xffffffff) * 20 - 10;
	}
	return out;
}

/**
 * Asserts two Float64Arrays match element-wise within an absolute tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tol=1e-9]
 */
function assertCloseArray(actual, expected, tol = 1e-9) {
	assert.ok(actual instanceof Float64Array, "Expected Float64Array output");
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		assert.ok(
			diff <= tol,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tol}`,
		);
	}
}

describe("fourierTransformTypedRecursive", () => {
	describe("normal analytical cases", () => {
		it("transforms unit impulse [1, 0, 0, 0] to all ones", () => {
			const real = new Float64Array([1, 0, 0, 0]);
			const res = fourierTransformTypedRecursive(real);

			assertCloseArray(res.real, new Float64Array([1, 1, 1, 1]));
			assertCloseArray(res.imag, new Float64Array([0, 0, 0, 0]));
		});

		it("transforms constant DC signal [3, 3, 3, 3] to [12, 0, 0, 0]", () => {
			const real = new Float64Array([3, 3, 3, 3]);
			const res = fourierTransformTypedRecursive(real);

			assertCloseArray(res.real, new Float64Array([12, 0, 0, 0]));
			assertCloseArray(res.imag, new Float64Array([0, 0, 0, 0]));
		});

		it("transforms a pure cosine wave to symmetric real spectral peaks", () => {
			const n = 16;
			const freq = 3;
			const real = new Float64Array(n);
			for (let t = 0; t < n; t++) {
				real[t] = Math.cos((2 * Math.PI * freq * t) / n);
			}

			const res = fourierTransformTypedRecursive(real);
			const expectedRe = new Float64Array(n);
			expectedRe[freq] = n / 2;
			expectedRe[n - freq] = n / 2;

			assertCloseArray(res.real, expectedRe);
			assertCloseArray(res.imag, new Float64Array(n));
		});

		it("transforms a pure sine wave to conjugate antisymmetric imaginary peaks", () => {
			const n = 16;
			const freq = 5;
			const real = new Float64Array(n);
			for (let t = 0; t < n; t++) {
				real[t] = Math.sin((2 * Math.PI * freq * t) / n);
			}

			const res = fourierTransformTypedRecursive(real);
			const expectedIm = new Float64Array(n);
			expectedIm[freq] = -n / 2;
			expectedIm[n - freq] = n / 2;

			assertCloseArray(res.real, new Float64Array(n));
			assertCloseArray(res.imag, expectedIm);
		});

		it("transforms a complex exponential exp(+i*2*pi*k0*t/N) to a single bin peak", () => {
			const n = 8;
			const k0 = 2;
			const real = new Float64Array(n);
			const imag = new Float64Array(n);
			for (let t = 0; t < n; t++) {
				const angle = (2 * Math.PI * k0 * t) / n;
				real[t] = Math.cos(angle);
				imag[t] = Math.sin(angle);
			}

			const res = fourierTransformTypedRecursive(real, imag);
			const expectedRe = new Float64Array(n);
			expectedRe[k0] = n;

			assertCloseArray(res.real, expectedRe);
			assertCloseArray(res.imag, new Float64Array(n));
		});

		it("recovers original signal after forward + inverse round-trip", () => {
			for (const n of [1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 16, 32]) {
				const real = deterministicSignal(n, 100 + n);
				const imag = deterministicSignal(n, 200 + n);

				const freq = fourierTransformTypedRecursive(real, imag);
				const recovered = fourierTransformTypedRecursive(
					freq.real,
					freq.imag,
					{ inverse: true },
				);

				assertCloseArray(recovered.real, real, 1e-9);
				assertCloseArray(recovered.imag, imag, 1e-9);
			}
		});
	});

	describe("independent cross-checks", () => {
		it("matches naive O(N^2) DFT across power-of-2, composite, and prime lengths", () => {
			const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 31, 32, 64];

			for (const n of lengths) {
				const real = deterministicSignal(n, 1000 + n);
				const imag = deterministicSignal(n, 2000 + n);

				const fwdActual = fourierTransformTypedRecursive(real, imag);
				const fwdExpected = naiveDft(real, imag, false);
				assertCloseArray(fwdActual.real, fwdExpected.real, 1e-8);
				assertCloseArray(fwdActual.imag, fwdExpected.imag, 1e-8);

				const invActual = fourierTransformTypedRecursive(real, imag, {
					inverse: true,
				});
				const invExpected = naiveDft(real, imag, true);
				assertCloseArray(invActual.real, invExpected.real, 1e-8);
				assertCloseArray(invActual.imag, invExpected.imag, 1e-8);
			}
		});

		it("satisfies Parseval's energy conservation theorem", () => {
			for (const n of [4, 7, 12, 32, 53]) {
				const real = deterministicSignal(n, 3000 + n);
				const imag = deterministicSignal(n, 4000 + n);

				let timeEnergy = 0;
				for (let i = 0; i < n; i++) {
					timeEnergy += real[i] * real[i] + imag[i] * imag[i];
				}

				const freq = fourierTransformTypedRecursive(real, imag);
				let freqEnergy = 0;
				for (let k = 0; k < n; k++) {
					freqEnergy += freq.real[k] * freq.real[k] + freq.imag[k] * freq.imag[k];
				}

				assert.ok(
					Math.abs(timeEnergy - freqEnergy / n) < 1e-8,
					`Parseval mismatch for n=${n}: time=${timeEnergy}, freq/N=${freqEnergy / n}`,
				);
			}
		});

		it("satisfies linearity: FFT(a*x + b*y) === a*FFT(x) + b*FFT(y)", () => {
			const n = 15;
			const a = 2.5;
			const b = -1.75;
			const xRe = deterministicSignal(n, 5001);
			const xIm = deterministicSignal(n, 5002);
			const yRe = deterministicSignal(n, 5003);
			const yIm = deterministicSignal(n, 5004);

			const combRe = new Float64Array(n);
			const combIm = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				combRe[i] = a * xRe[i] + b * yRe[i];
				combIm[i] = a * xIm[i] + b * yIm[i];
			}

			const lhs = fourierTransformTypedRecursive(combRe, combIm);
			const fx = fourierTransformTypedRecursive(xRe, xIm);
			const fy = fourierTransformTypedRecursive(yRe, yIm);

			const rhsRe = new Float64Array(n);
			const rhsIm = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				rhsRe[i] = a * fx.real[i] + b * fy.real[i];
				rhsIm[i] = a * fx.imag[i] + b * fy.imag[i];
			}

			assertCloseArray(lhs.real, rhsRe, 1e-8);
			assertCloseArray(lhs.imag, rhsIm, 1e-8);
		});

		it("satisfies circular convolution theorem", () => {
			const n = 10;
			const x = deterministicSignal(n, 6001);
			const y = deterministicSignal(n, 6002);

			// Direct circular convolution
			const directConv = new Float64Array(n);
			for (let k = 0; k < n; k++) {
				let sum = 0;
				for (let j = 0; j < n; j++) {
					sum += x[j] * y[(k - j + n) % n];
				}
				directConv[k] = sum;
			}

			// FFT-based circular convolution
			const fx = fourierTransformTypedRecursive(x);
			const fy = fourierTransformTypedRecursive(y);
			const prodRe = new Float64Array(n);
			const prodIm = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				prodRe[i] = fx.real[i] * fy.real[i] - fx.imag[i] * fy.imag[i];
				prodIm[i] = fx.real[i] * fy.imag[i] + fx.imag[i] * fy.real[i];
			}
			const fftConv = fourierTransformTypedRecursive(prodRe, prodIm, {
				inverse: true,
			});

			assertCloseArray(fftConv.real, directConv, 1e-8);
			assertCloseArray(fftConv.imag, new Float64Array(n), 1e-8);
		});
	});

	describe("edge cases", () => {
		it("handles empty Float64Array (length 0)", () => {
			const res = fourierTransformTypedRecursive(new Float64Array(0));
			assert.ok(res.real instanceof Float64Array);
			assert.ok(res.imag instanceof Float64Array);
			assert.equal(res.real.length, 0);
			assert.equal(res.imag.length, 0);

			const inv = fourierTransformTypedRecursive(
				new Float64Array(0),
				new Float64Array(0),
				{ inverse: true },
			);
			assert.equal(inv.real.length, 0);
			assert.equal(inv.imag.length, 0);
		});

		it("handles single-element Float64Array (length 1) without aliasing input", () => {
			const real = new Float64Array([42.5]);
			const imag = new Float64Array([-7.25]);
			const res = fourierTransformTypedRecursive(real, imag);

			assert.notEqual(res.real, real);
			assert.notEqual(res.imag, imag);
			assertCloseArray(res.real, new Float64Array([42.5]));
			assertCloseArray(res.imag, new Float64Array([-7.25]));
		});

		it("handles all-zero signal", () => {
			const real = new Float64Array(8);
			const res = fourierTransformTypedRecursive(real);
			assertCloseArray(res.real, new Float64Array(8));
			assertCloseArray(res.imag, new Float64Array(8));
		});

		it("does not mutate input Float64Arrays", () => {
			const real = new Float64Array([1, -2, 3.5, -4.25, 5, 6]);
			const imag = new Float64Array([0.5, 1.5, -2.5, 3.5, -4.5, 5.5]);
			const realCopy = new Float64Array(real);
			const imagCopy = new Float64Array(imag);

			fourierTransformTypedRecursive(real, imag);
			fourierTransformTypedRecursive(real, imag, { inverse: true });

			assert.deepEqual(real, realCopy);
			assert.deepEqual(imag, imagCopy);
		});

		it("works correctly on Float64Array subarrays with non-zero byteOffset", () => {
			const backing = new Float64Array([99, 99, 1, 2, 3, 4, 99]);
			const view = backing.subarray(2, 6);
			const res = fourierTransformTypedRecursive(view);
			const expected = naiveDft(new Float64Array([1, 2, 3, 4]));

			assertCloseArray(res.real, expected.real);
			assertCloseArray(res.imag, expected.imag);
		});

		it("supports larger power-of-2 and prime inputs efficiently", () => {
			for (const n of [256, 257]) {
				const real = deterministicSignal(n, 7000 + n);
				const imag = deterministicSignal(n, 8000 + n);
				const freq = fourierTransformTypedRecursive(real, imag);
				const rec = fourierTransformTypedRecursive(freq.real, freq.imag, {
					inverse: true,
				});
				assertCloseArray(rec.real, real, 1e-7);
				assertCloseArray(rec.imag, imag, 1e-7);
			}
		});
	});

	describe("invalid inputs", () => {
		it("throws TypeError when real is not a Float64Array", () => {
			for (const bad of [
				undefined,
				null,
				[],
				[1, 2, 3, 4],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				"1234",
				42,
				{},
			]) {
				assert.throws(
					() => fourierTransformTypedRecursive(bad),
					TypeError,
				);
			}
		});

		it("throws TypeError when imag is provided and not a Float64Array", () => {
			const real = new Float64Array([1, 2, 3, 4]);
			for (const bad of [
				null,
				[0, 0, 0, 0],
				new Float32Array([0, 0, 0, 0]),
				"zeros",
				0,
				{},
			]) {
				assert.throws(
					() => fourierTransformTypedRecursive(real, bad),
					TypeError,
				);
			}
		});

		it("throws RangeError when imag length does not match real length", () => {
			assert.throws(
				() =>
					fourierTransformTypedRecursive(
						new Float64Array([1, 2, 3, 4]),
						new Float64Array([0, 0]),
					),
				RangeError,
			);
		});

		it("throws RangeError when real or imag contains NaN or Infinity", () => {
			assert.throws(
				() => fourierTransformTypedRecursive(new Float64Array([1, Number.NaN, 3, 4])),
				RangeError,
			);
			assert.throws(
				() =>
					fourierTransformTypedRecursive(
						new Float64Array([1, Number.POSITIVE_INFINITY, 3, 4]),
					),
				RangeError,
			);
			assert.throws(
				() =>
					fourierTransformTypedRecursive(
						new Float64Array([1, 2, 3, 4]),
						new Float64Array([0, 0, Number.NEGATIVE_INFINITY, 0]),
					),
				RangeError,
			);
			assert.throws(
				() =>
					fourierTransformTypedRecursive(
						new Float64Array([1, 2]),
						new Float64Array([0, Number.NaN]),
					),
				RangeError,
			);
		});

		it("throws TypeError when options or options.inverse has invalid type", () => {
			const real = new Float64Array([1, 2, 3, 4]);
			for (const badOpts of [null, true, 123, "inverse", []]) {
				assert.throws(
					() => fourierTransformTypedRecursive(real, undefined, badOpts),
					TypeError,
				);
			}
			for (const badInv of [null, 1, 0, "true", {}]) {
				assert.throws(
					() =>
						fourierTransformTypedRecursive(real, undefined, {
							inverse: badInv,
						}),
					TypeError,
				);
			}
		});
	});
});
