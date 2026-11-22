import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformComplexRecursive } from './fourierTransformComplexRecursive.js';

const EPS = 1e-10;

/**
 * Independent O(N^2) direct iterative DFT/IDFT reference implementation for cross-checking.
 *
 * @param {Array<{ re: number, im: number }>} x
 * @param {boolean} inverse
 * @returns {Array<{ re: number, im: number }>}
 */
function naiveDftReference(x, inverse = false) {
	const n = x.length;
	const sign = inverse ? 1 : -1;
	const scale = inverse ? 1 / n : 1;
	const out = new Array(n);

	for (let k = 0; k < n; k++) {
		let sumRe = 0;
		let sumIm = 0;
		for (let j = 0; j < n; j++) {
			const angle = (sign * 2 * Math.PI * k * j) / n;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			sumRe += x[j].re * cos - x[j].im * sin;
			sumIm += x[j].re * sin + x[j].im * cos;
		}
		out[k] = { re: sumRe * scale, im: sumIm * scale };
	}

	return out;
}

/**
 * Asserts two complex arrays are element-wise close within `tol` and contain no `-0`.
 *
 * @param {Array<{ re: number, im: number }>} actual
 * @param {Array<{ re: number, im: number }>} expected
 * @param {number} [tol]
 */
function assertComplexArrayClose(actual, expected, tol = EPS) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assert.equal(Object.is(actual[i].re, -0), false, `index ${i} re must not be -0`);
		assert.equal(Object.is(actual[i].im, -0), false, `index ${i} im must not be -0`);
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= tol,
			`index ${i} re mismatch: got ${actual[i].re}, expected ${expected[i].re}`,
		);
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= tol,
			`index ${i} im mismatch: got ${actual[i].im}, expected ${expected[i].im}`,
		);
	}
}

/**
 * Deterministic LCG-based complex signal generator for reproducible tests.
 *
 * @param {number} length
 * @param {number} seed
 * @returns {Array<{ re: number, im: number }>}
 */
function generateSignal(length, seed = 42) {
	let state = seed >>> 0;
	const next = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return (state / 0xffffffff) * 20 - 10;
	};
	return Array.from({ length }, () => ({ re: next(), im: next() }));
}

describe('fourierTransformComplexRecursive', () => {
	describe('edge cases', () => {
		it('handles empty array for forward and inverse transforms', () => {
			assert.deepEqual(fourierTransformComplexRecursive([]), []);
			assert.deepEqual(fourierTransformComplexRecursive([], { inverse: true }), []);
			assert.deepEqual(fourierTransformComplexRecursive([], true), []);
		});

		it('handles single-element array for forward and inverse transforms', () => {
			const input = [{ re: 3.5, im: -2.25 }];
			assertComplexArrayClose(fourierTransformComplexRecursive(input), input);
			assertComplexArrayClose(fourierTransformComplexRecursive(input, { inverse: true }), input);
		});

		it('never produces negative zero (-0) in output components', () => {
			const input = [
				{ re: -0, im: -0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 },
			];
			const fwd = fourierTransformComplexRecursive(input);
			const inv = fourierTransformComplexRecursive(input, { inverse: true });
			for (const arr of [fwd, inv]) {
				for (const c of arr) {
					assert.equal(Object.is(c.re, -0), false);
					assert.equal(Object.is(c.im, -0), false);
					assert.equal(c.re, 0);
					assert.equal(c.im, 0);
				}
			}
		});

		it('does not mutate the input array or its complex objects', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 5, im: -6 },
				{ re: 0, im: 1 },
			];
			const snapshot = input.map((c) => ({ ...c }));
			const out = fourierTransformComplexRecursive(input);
			assert.deepEqual(input, snapshot);
			assert.notEqual(out, input);
			for (let i = 0; i < input.length; i++) {
				assert.notEqual(out[i], input[i]);
			}
		});
	});

	describe('analytical normal cases', () => {
		it('transforms unit impulse [1, 0, ..., 0] to all ones for power-of-2 and prime lengths', () => {
			for (const n of [2, 4, 5, 7, 8]) {
				const impulse = Array.from({ length: n }, (_, i) => ({
					re: i === 0 ? 1 : 0,
					im: 0,
				}));
				const expected = Array.from({ length: n }, () => ({ re: 1, im: 0 }));
				assertComplexArrayClose(fourierTransformComplexRecursive(impulse), expected);
			}
		});

		it('transforms constant signal to DC-only spike', () => {
			const n = 8;
			const c = { re: 2.5, im: -1.5 };
			const signal = Array.from({ length: n }, () => ({ ...c }));
			const expected = Array.from({ length: n }, (_, k) =>
				k === 0 ? { re: c.re * n, im: c.im * n } : { re: 0, im: 0 },
			);
			assertComplexArrayClose(fourierTransformComplexRecursive(signal), expected);
		});

		it('transforms pure complex exponential exp(i * 2*pi * freq * n / N) to single bin', () => {
			for (const [n, freq] of [
				[8, 3],
				[7, 2],
				[12, 5],
			]) {
				const signal = Array.from({ length: n }, (_, idx) => {
					const angle = (2 * Math.PI * freq * idx) / n;
					return { re: Math.cos(angle), im: Math.sin(angle) };
				});
				const expected = Array.from({ length: n }, (_, k) =>
					k === freq ? { re: n, im: 0 } : { re: 0, im: 0 },
				);
				assertComplexArrayClose(fourierTransformComplexRecursive(signal), expected);
			}
		});

		it('computes exact known 4-point DFT and supports boolean and options-object inverse flags', () => {
			const x = [
				{ re: 1, im: 0 },
				{ re: 2, im: -1 },
				{ re: 0, im: -1 },
				{ re: -1, im: 2 },
			];
			const expected = [
				{ re: 2, im: 0 },
				{ re: -2, im: -2 },
				{ re: 0, im: -2 },
				{ re: 4, im: 4 },
			];
			const fwd = fourierTransformComplexRecursive(x);
			assertComplexArrayClose(fwd, expected);

			assertComplexArrayClose(fourierTransformComplexRecursive(fwd, { inverse: true }), x);
			assertComplexArrayClose(fourierTransformComplexRecursive(fwd, true), x);
			assertComplexArrayClose(fourierTransformComplexRecursive(x, { inverse: false }), expected);
			assertComplexArrayClose(fourierTransformComplexRecursive(x, false), expected);
		});
	});

	describe('cross-checks against independent reference and mathematical identities', () => {
		it('matches naive O(N^2) DFT/IDFT across power-of-2, prime, and composite lengths', () => {
			const lengths = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 24, 32, 37];
			for (const n of lengths) {
				const signal = generateSignal(n, 100 + n);

				const actualFwd = fourierTransformComplexRecursive(signal);
				const refFwd = naiveDftReference(signal, false);
				assertComplexArrayClose(actualFwd, refFwd, 1e-9);

				const actualInv = fourierTransformComplexRecursive(signal, { inverse: true });
				const refInv = naiveDftReference(signal, true);
				assertComplexArrayClose(actualInv, refInv, 1e-9);
			}
		});

		it('satisfies round-trip invertibility IDFT(DFT(x)) = x and DFT(IDFT(x)) = x', () => {
			for (const n of [1, 2, 3, 5, 8, 11, 16, 25, 64]) {
				const signal = generateSignal(n, 500 + n);
				const roundTrip1 = fourierTransformComplexRecursive(
					fourierTransformComplexRecursive(signal),
					{ inverse: true },
				);
				assertComplexArrayClose(roundTrip1, signal, 1e-9);

				const roundTrip2 = fourierTransformComplexRecursive(
					fourierTransformComplexRecursive(signal, { inverse: true }),
				);
				assertComplexArrayClose(roundTrip2, signal, 1e-9);
			}
		});

		it('satisfies Parseval / Plancherel energy conservation theorem', () => {
			for (const n of [4, 7, 12, 16, 29]) {
				const x = generateSignal(n, 900 + n);
				const X = fourierTransformComplexRecursive(x);
				const timeEnergy = x.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0);
				const freqEnergy = X.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0) / n;
				assert.ok(
					Math.abs(timeEnergy - freqEnergy) <= 1e-8 * Math.max(1, timeEnergy),
					`Parseval failed for n=${n}: time=${timeEnergy}, freq=${freqEnergy}`,
				);
			}
		});

		it('satisfies linearity: DFT(a*x + b*y) = a*DFT(x) + b*DFT(y)', () => {
			const a = { re: 1.5, im: -0.75 };
			const b = { re: -2.25, im: 3.1 };
			const mul = (u, v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re });
			const add = (u, v) => ({ re: u.re + v.re, im: u.im + v.im });

			for (const n of [8, 11]) {
				const x = generateSignal(n, 11);
				const y = generateSignal(n, 29);
				const combined = x.map((xi, i) => add(mul(a, xi), mul(b, y[i])));

				const lhs = fourierTransformComplexRecursive(combined);
				const X = fourierTransformComplexRecursive(x);
				const Y = fourierTransformComplexRecursive(y);
				const rhs = X.map((Xi, i) => add(mul(a, Xi), mul(b, Y[i])));

				assertComplexArrayClose(lhs, rhs, 1e-9);
			}
		});

		it('satisfies circular convolution theorem for power-of-2 and non-power-of-2 lengths', () => {
			for (const n of [8, 9, 13]) {
				const x = generateSignal(n, 77 + n);
				const y = generateSignal(n, 88 + n);

				// Direct circular convolution: (x * y)[m] = sum_{j=0}^{n-1} x[j] * y[(m - j) mod n]
				const directConv = Array.from({ length: n }, (_, m) => {
					let re = 0;
					let im = 0;
					for (let j = 0; j < n; j++) {
						const k = (m - j + n) % n;
						re += x[j].re * y[k].re - x[j].im * y[k].im;
						im += x[j].re * y[k].im + x[j].im * y[k].re;
					}
					return { re, im };
				});

				const X = fourierTransformComplexRecursive(x);
				const Y = fourierTransformComplexRecursive(y);
				const prod = X.map((Xi, i) => ({
					re: Xi.re * Y[i].re - Xi.im * Y[i].im,
					im: Xi.re * Y[i].im + Xi.im * Y[i].re,
				}));
				const fftConv = fourierTransformComplexRecursive(prod, { inverse: true });

				assertComplexArrayClose(fftConv, directConv, 1e-8);
			}
		});

		it('satisfies circular time-shift theorem', () => {
			const n = 10;
			const shift = 3;
			const x = generateSignal(n, 314);
			const shifted = Array.from({ length: n }, (_, idx) => x[(idx - shift + n) % n]);

			const X = fourierTransformComplexRecursive(x);
			const shiftedFft = fourierTransformComplexRecursive(shifted);
			const expected = X.map((Xk, k) => {
				const angle = (-2 * Math.PI * k * shift) / n;
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				return {
					re: Xk.re * cos - Xk.im * sin,
					im: Xk.re * sin + Xk.im * cos,
				};
			});

			assertComplexArrayClose(shiftedFft, expected, 1e-9);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, 'hello', {}, { re: 1, im: 0 }]) {
				assert.throws(() => fourierTransformComplexRecursive(bad), TypeError);
			}
		});

		it('throws TypeError when any element is not a complex object { re, im } with numeric fields', () => {
			const badInputs = [
				[null],
				[undefined],
				[42],
				[[1, 2]],
				[{ re: 1 }],
				[{ im: 2 }],
				[{ re: '1', im: 0 }],
				[{ re: 1, im: null }],
				[{ re: 1, im: 0 }, { re: 2, im: undefined }],
			];
			for (const bad of badInputs) {
				assert.throws(() => fourierTransformComplexRecursive(bad), TypeError);
			}
		});

		it('throws RangeError when any re or im value is non-finite', () => {
			const badInputs = [
				[{ re: Number.NaN, im: 0 }],
				[{ re: 0, im: Number.NaN }],
				[{ re: Number.POSITIVE_INFINITY, im: 0 }],
				[{ re: 0, im: Number.NEGATIVE_INFINITY }],
				[{ re: 1, im: 2 }, { re: Number.POSITIVE_INFINITY, im: 1 }],
			];
			for (const bad of badInputs) {
				assert.throws(() => fourierTransformComplexRecursive(bad), RangeError);
			}
		});

		it('throws TypeError for invalid options argument', () => {
			const valid = [{ re: 1, im: 0 }];
			for (const badOpts of [null, 1, 'true', [], { inverse: 'true' }, { inverse: 1 }]) {
				assert.throws(() => fourierTransformComplexRecursive(valid, badOpts), TypeError);
			}
		});
	});
});
