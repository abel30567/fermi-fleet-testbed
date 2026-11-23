import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionComplexSeries } from './convolutionComplexSeries.js';

const c = (re, im = 0) => ({ re, im });

function cAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im };
}

function cSub(x, y) {
	return { re: x.re - y.re, im: x.im - y.im };
}

function cMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	};
}

function cDiv(x, y) {
	const denom = y.re * y.re + y.im * y.im;
	return {
		re: (x.re * y.re + x.im * y.im) / denom,
		im: (x.im * y.re - x.re * y.im) / denom,
	};
}

function cPow(z, n) {
	let acc = c(1, 0);
	for (let i = 0; i < n; i++) {
		acc = cMul(acc, z);
	}
	return acc;
}

function cConj(z) {
	return { re: z.re, im: -z.im };
}

function evalPoly(coeffs, z) {
	// Horner's method for P(z) = sum_k coeffs[k] * z^k
	let acc = c(0, 0);
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = cAdd(cMul(acc, z), coeffs[i]);
	}
	return acc;
}

function naiveDft(seq, invert = false) {
	const N = seq.length;
	const sign = invert ? 2 : -2;
	const out = new Array(N);
	for (let k = 0; k < N; k++) {
		let re = 0;
		let im = 0;
		for (let n = 0; n < N; n++) {
			const angle = (sign * Math.PI * k * n) / N;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			re += seq[n].re * cos - seq[n].im * sin;
			im += seq[n].re * sin + seq[n].im * cos;
		}
		out[k] = invert ? { re: re / N, im: im / N } : { re, im };
	}
	return out;
}

function assertComplexClose(actual, expected, tol = 1e-10, label = '') {
	const prefix = label ? `${label}: ` : '';
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}real mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}imag mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`
	);
}

function assertComplexSeqClose(actual, expected, tol = 1e-10, label = '') {
	assert.equal(actual.length, expected.length, `${label} length mismatch`);
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${label}[${i}]`);
	}
}

describe('convolutionComplexSeries', () => {
	describe('normal cases', () => {
		it('computes exact full convolution of Gaussian integer sequences', () => {
			// (1 + 2i) + (3 - i)z  times  (2 + i) + (-1 + 4i)z
			// c0 = (1+2i)(2+i) = 0 + 5i
			// c1 = (1+2i)(-1+4i) + (3-i)(2+i) = (-9+2i) + (7+i) = -2 + 3i
			// c2 = (3-i)(-1+4i) = 1 + 13i
			const a = [c(1, 2), c(3, -1)];
			const b = [c(2, 1), c(-1, 4)];
			const expected = [c(0, 5), c(-2, 3), c(1, 13)];

			const resAuto = convolutionComplexSeries(a, b);
			const resCauchy = convolutionComplexSeries(a, b, { method: 'cauchy' });
			const resSpectral = convolutionComplexSeries(a, b, { method: 'spectral' });

			assert.deepStrictEqual(resAuto, expected);
			assert.deepStrictEqual(resCauchy, expected);
			assertComplexSeqClose(resSpectral, expected, 1e-12, 'spectral');
		});

		it('computes full convolution of unequal-length complex sequences', () => {
			const a = [c(1, 0), c(0, 1), c(-1, 2)];
			const b = [c(2, -1), c(3, 1)];
			// c0 = (1)(2-i) = 2 - i
			// c1 = (1)(3+i) + (i)(2-i) = (3+i) + (1+2i) = 4 + 3i
			// c2 = (i)(3+i) + (-1+2i)(2-i) = (-1+3i) + (0+5i) = -1 + 8i
			// c3 = (-1+2i)(3+i) = -5 + 5i
			const expected = [c(2, -1), c(4, 3), c(-1, 8), c(-5, 5)];

			assert.deepStrictEqual(convolutionComplexSeries(a, b), expected);
			assertComplexSeqClose(
				convolutionComplexSeries(a, b, { method: 'spectral' }),
				expected,
				1e-12
			);
		});

		it('supports mode="same" centered on first sequence length', () => {
			const a = [c(1, 1), c(2, -1), c(3, 2), c(4, 0)];
			const delta = [c(0, 0), c(1, 0), c(0, 0)];
			assert.deepStrictEqual(
				convolutionComplexSeries(a, delta, { mode: 'same' }),
				a
			);

			// Also test when b is longer than a
			const shortA = [c(1, 2), c(3, -1)];
			const longB = [c(1, 0), c(0, 1), c(2, 0), c(0, -1), c(1, 1)];
			const full = convolutionComplexSeries(shortA, longB, { mode: 'full' });
			const same = convolutionComplexSeries(shortA, longB, { mode: 'same' });
			const start = Math.floor((longB.length - 1) / 2);
			assert.deepStrictEqual(same, full.slice(start, start + shortA.length));
		});

		it('supports mode="valid" with no zero-padding overlap', () => {
			const a = [c(1, 1), c(2, 0), c(0, 3), c(-1, 2)];
			const b = [c(2, -1), c(1, 2)];
			const full = convolutionComplexSeries(a, b, { mode: 'full' });
			const valid = convolutionComplexSeries(a, b, { mode: 'valid' });
			assert.equal(valid.length, Math.abs(a.length - b.length) + 1);
			assert.deepStrictEqual(valid, full.slice(1, 4));

			// Equal-length sequences produce 1 valid element
			const eqValid = convolutionComplexSeries(b, b, { mode: 'valid' });
			assert.equal(eqValid.length, 1);
			assert.deepStrictEqual(eqValid[0], cAdd(cMul(b[0], b[1]), cMul(b[1], b[0])));
		});

		it('supports mode="circular" for both power-of-two and non-power-of-two lengths', () => {
			// Power-of-two length (L = 4)
			const a4 = [c(1, 2), c(-1, 0), c(3, -1), c(0, 4)];
			const b4 = [c(2, -1), c(1, 1)];
			const circ4Cauchy = convolutionComplexSeries(a4, b4, { mode: 'circular', method: 'cauchy' });
			const circ4Spectral = convolutionComplexSeries(a4, b4, { mode: 'circular', method: 'spectral' });
			assert.equal(circ4Cauchy.length, 4);
			assertComplexSeqClose(circ4Spectral, circ4Cauchy, 1e-11, 'circular L=4');

			// Non-power-of-two length (L = 5)
			const a5 = [c(1, 0), c(2, -1), c(0, 3), c(-2, 1), c(4, -2)];
			const b5 = [c(0, 1), c(-1, 2), c(3, 0)];
			const circ5Cauchy = convolutionComplexSeries(a5, b5, { mode: 'circular', method: 'cauchy' });
			const circ5Spectral = convolutionComplexSeries(a5, b5, { mode: 'circular', method: 'spectral' });
			assert.equal(circ5Cauchy.length, 5);
			assertComplexSeqClose(circ5Spectral, circ5Cauchy, 1e-11, 'circular L=5');
		});

		it('switches seamlessly to spectral method above threshold in auto mode', () => {
			const m = 24;
			const n = 20; // m * n = 480 > 256
			const a = Array.from({ length: m }, (_, k) =>
				c(Math.sin(k * 0.7), Math.cos(k * 0.3))
			);
			const b = Array.from({ length: n }, (_, k) =>
				c(Math.cos(k * 0.5), -Math.sin(k * 0.9))
			);

			const resAuto = convolutionComplexSeries(a, b);
			const resCauchy = convolutionComplexSeries(a, b, { method: 'cauchy' });
			const resSpectral = convolutionComplexSeries(a, b, { method: 'spectral' });

			assertComplexSeqClose(resAuto, resCauchy, 1e-11, 'auto vs cauchy');
			assertComplexSeqClose(resAuto, resSpectral, 1e-14, 'auto vs spectral');
		});
	});

	describe('edge cases', () => {
		it('handles single-element sequences across all modes and methods', () => {
			const a = [c(3, -4)];
			const b = [c(-2, 5)];
			const expected = [c(14, 23)];

			for (const mode of ['full', 'same', 'valid', 'circular']) {
				for (const method of ['auto', 'cauchy', 'spectral']) {
					const res = convolutionComplexSeries(a, b, { mode, method });
					assertComplexSeqClose(res, expected, 1e-12, `${mode}/${method}`);
				}
			}
		});

		it('handles all-zero sequences without producing -0', () => {
			const zeros = [c(0, 0), c(-0, 0), c(0, -0)];
			const b = [c(1, -2), c(-3, 4)];
			for (const method of ['cauchy', 'spectral']) {
				const res = convolutionComplexSeries(zeros, b, { method });
				assert.equal(res.length, 4);
				for (const z of res) {
					assert.ok(Object.is(z.re, 0) || Math.abs(z.re) < 1e-15);
					assert.ok(Object.is(z.im, 0) || Math.abs(z.im) < 1e-15);
					assert.ok(!Object.is(z.re, -0), 'real part should not be -0');
					assert.ok(!Object.is(z.im, -0), 'imag part should not be -0');
				}
			}
		});

		it('does not mutate input arrays or complex number objects', () => {
			const a = [c(1, 2), c(3, 4)];
			const b = [c(5, -6), c(-7, 8)];
			const aSnap = structuredClone(a);
			const bSnap = structuredClone(b);

			convolutionComplexSeries(a, b, { method: 'cauchy' });
			convolutionComplexSeries(a, b, { method: 'spectral' });

			assert.deepStrictEqual(a, aSnap);
			assert.deepStrictEqual(b, bSnap);
		});

		it('satisfies algebraic laws: commutativity, associativity, distributivity, conjugation', () => {
			const a = [c(1, -2), c(0.5, 1.5), c(-3, 0.25)];
			const b = [c(-1, 3), c(2, -0.5)];
			const d = [c(0.25, 0.75), c(-2, 1)];

			// Commutativity: a * b == b * a
			assertComplexSeqClose(
				convolutionComplexSeries(a, b),
				convolutionComplexSeries(b, a),
				1e-12,
				'commutativity'
			);

			// Associativity: (a * b) * d == a * (b * d)
			const lhsAssoc = convolutionComplexSeries(convolutionComplexSeries(a, b), d);
			const rhsAssoc = convolutionComplexSeries(a, convolutionComplexSeries(b, d));
			assertComplexSeqClose(lhsAssoc, rhsAssoc, 1e-12, 'associativity');

			// Distributivity: a * (b + d) == a * b + a * d
			const bPlusD = b.map((z, i) => cAdd(z, d[i]));
			const lhsDist = convolutionComplexSeries(a, bPlusD);
			const ab = convolutionComplexSeries(a, b);
			const ad = convolutionComplexSeries(a, d);
			const rhsDist = ab.map((z, i) => cAdd(z, ad[i]));
			assertComplexSeqClose(lhsDist, rhsDist, 1e-12, 'distributivity');

			// Conjugation symmetry: conj(a * b) == conj(a) * conj(b)
			const conjConv = convolutionComplexSeries(a, b).map(cConj);
			const convConj = convolutionComplexSeries(a.map(cConj), b.map(cConj));
			assertComplexSeqClose(conjConv, convConj, 1e-12, 'conjugation');
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies closed-form complex geometric series convolution identities', () => {
			// Identity 1 (distinct complex ratios r != s):
			// If a_k = r^k, b_k = s^k for 0 <= k < N, then:
			//   for 0 <= n < N:      (a * b)[n] = (r^(n+1) - s^(n+1)) / (r - s)
			//   for N <= n <= 2N-2:  (a * b)[n] = (r^N * s^(n-N+1) - r^(n-N+1) * s^N) / (r - s)
			const N = 12;
			const r = c(0.6, 0.4);
			const s = c(-0.3, 0.7);
			const a = Array.from({ length: N }, (_, k) => cPow(r, k));
			const b = Array.from({ length: N }, (_, k) => cPow(s, k));

			const expected = Array.from({ length: 2 * N - 1 }, (_, n) => {
				if (n < N) {
					return cDiv(cSub(cPow(r, n + 1), cPow(s, n + 1)), cSub(r, s));
				}
				const term1 = cMul(cPow(r, N), cPow(s, n - N + 1));
				const term2 = cMul(cPow(r, n - N + 1), cPow(s, N));
				return cDiv(cSub(term1, term2), cSub(r, s));
			});

			assertComplexSeqClose(
				convolutionComplexSeries(a, b, { method: 'cauchy' }),
				expected,
				1e-11,
				'geometric distinct (cauchy)'
			);
			assertComplexSeqClose(
				convolutionComplexSeries(a, b, { method: 'spectral' }),
				expected,
				1e-11,
				'geometric distinct (spectral)'
			);

			// Identity 2 (equal complex ratio r == s):
			//   (a * a)[n] = (n + 1) * r^n            for 0 <= n < N
			//   (a * a)[n] = (2N - 1 - n) * r^n       for N <= n <= 2N - 2
			const expectedSelf = Array.from({ length: 2 * N - 1 }, (_, n) => {
				const weight = n < N ? n + 1 : 2 * N - 1 - n;
				const rn = cPow(r, n);
				return c(weight * rn.re, weight * rn.im);
			});

			assertComplexSeqClose(
				convolutionComplexSeries(a, a, { method: 'spectral' }),
				expectedSelf,
				1e-11,
				'geometric self-convolution'
			);
		});

		it('satisfies generating-polynomial evaluation identity P_{a*b}(z) = P_a(z) * P_b(z)', () => {
			const a = Array.from({ length: 19 }, (_, k) =>
				c(Math.cos(k * 1.1) * 0.5, Math.sin(k * 0.7) * 0.5)
			);
			const b = Array.from({ length: 17 }, (_, k) =>
				c(Math.sin(k * 0.4) * 0.5, -Math.cos(k * 1.3) * 0.5)
			);

			const convCauchy = convolutionComplexSeries(a, b, { method: 'cauchy' });
			const convSpectral = convolutionComplexSeries(a, b, { method: 'spectral' });

			const probePoints = [
				c(1, 0),
				c(-1, 0),
				c(0, 1),
				c(0, -1),
				c(0.7, -0.4),
				c(-0.5, 0.6),
				c(Math.cos((2 * Math.PI) / 7), Math.sin((2 * Math.PI) / 7)),
			];

			for (const z of probePoints) {
				const expectedVal = cMul(evalPoly(a, z), evalPoly(b, z));
				assertComplexClose(evalPoly(convCauchy, z), expectedVal, 1e-10, `cauchy at z=(${z.re},${z.im})`);
				assertComplexClose(evalPoly(convSpectral, z), expectedVal, 1e-10, `spectral at z=(${z.re},${z.im})`);
			}
		});

		it('matches independent O(L^2) naive DFT circular convolution theorem for prime length', () => {
			const L = 11; // prime length
			const a = Array.from({ length: L }, (_, k) => c(k - 5, Math.sin(k)));
			const b = Array.from({ length: 7 }, (_, k) => c(Math.cos(k), 3 - k));

			// Pad b to L and compute IDFT(DFT(a) .* DFT(b)) via independent naive DFT
			const bPadded = [...b, ...Array.from({ length: L - b.length }, () => c(0, 0))];
			const A = naiveDft(a, false);
			const B = naiveDft(bPadded, false);
			const C = A.map((ak, k) => cMul(ak, B[k]));
			const expected = naiveDft(C, true);

			assertComplexSeqClose(
				convolutionComplexSeries(a, b, { mode: 'circular', method: 'cauchy' }),
				expected,
				1e-10,
				'naive DFT vs cauchy'
			);
			assertComplexSeqClose(
				convolutionComplexSeries(a, b, { mode: 'circular', method: 'spectral' }),
				expected,
				1e-10,
				'naive DFT vs spectral'
			);
		});
	});

	describe('invalid inputs', () => {
		it('rejects non-array sequences with TypeError', () => {
			assert.throws(() => convolutionComplexSeries(null, [c(1, 0)]), TypeError);
			assert.throws(() => convolutionComplexSeries([c(1, 0)], 'abc'), TypeError);
			assert.throws(() => convolutionComplexSeries(123, [c(1, 0)]), TypeError);
			assert.throws(() => convolutionComplexSeries([c(1, 0)], { re: 1, im: 0 }), TypeError);
		});

		it('rejects empty sequences with RangeError', () => {
			assert.throws(() => convolutionComplexSeries([], [c(1, 0)]), RangeError);
			assert.throws(() => convolutionComplexSeries([c(1, 0)], []), RangeError);
			assert.throws(() => convolutionComplexSeries([], []), RangeError);
		});

		it('rejects malformed complex elements with TypeError', () => {
			assert.throws(() => convolutionComplexSeries([null], [c(1, 0)]), TypeError);
			assert.throws(() => convolutionComplexSeries([[1, 2]], [c(1, 0)]), TypeError);
			assert.throws(() => convolutionComplexSeries([{ re: 1 }], [c(1, 0)]), TypeError);
			assert.throws(() => convolutionComplexSeries([c(1, 0)], [{ re: '1', im: 0 }]), TypeError);
		});

		it('rejects non-finite complex components with RangeError', () => {
			assert.throws(() => convolutionComplexSeries([c(NaN, 0)], [c(1, 0)]), RangeError);
			assert.throws(() => convolutionComplexSeries([c(1, Infinity)], [c(1, 0)]), RangeError);
			assert.throws(() => convolutionComplexSeries([c(1, 0)], [c(-Infinity, 0)]), RangeError);
		});

		it('rejects invalid options with TypeError or RangeError', () => {
			const a = [c(1, 0)];
			const b = [c(1, 0)];

			assert.throws(() => convolutionComplexSeries(a, b, null), TypeError);
			assert.throws(() => convolutionComplexSeries(a, b, []), TypeError);
			assert.throws(() => convolutionComplexSeries(a, b, 'full'), TypeError);
			assert.throws(() => convolutionComplexSeries(a, b, { mode: 42 }), TypeError);
			assert.throws(() => convolutionComplexSeries(a, b, { mode: 'unknown' }), RangeError);
			assert.throws(() => convolutionComplexSeries(a, b, { method: 42 }), TypeError);
			assert.throws(() => convolutionComplexSeries(a, b, { method: 'fft' }), RangeError);
		});
	});
});
