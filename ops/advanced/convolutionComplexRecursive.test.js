import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionComplexRecursive } from './convolutionComplexRecursive.js';

/**
 * Helper to construct a complex number `{ re, im }`.
 */
function c(re, im = 0) {
	return { re, im };
}

/**
 * Independent O(M * N) direct iterative reference implementation of
 * discrete linear convolution over complex numbers.
 */
function naiveConvolutionComplex(a, b) {
	if (a.length === 0 || b.length === 0) {
		return [];
	}
	const outLen = a.length + b.length - 1;
	const out = Array.from({ length: outLen }, () => ({ re: 0, im: 0 }));
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j].re += a[i].re * b[j].re - a[i].im * b[j].im;
			out[i + j].im += a[i].re * b[j].im + a[i].im * b[j].re;
		}
	}
	return out;
}

/**
 * Asserts two complex sequences are element-wise equal within tolerance
 * and contain no `-0` values.
 */
function assertComplexSeqClose(actual, expected, eps = 1e-9) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} vs ${expected.length}`);
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			!Object.is(actual[i].re, -0),
			`index ${i}: real part must not be -0`,
		);
		assert.ok(
			!Object.is(actual[i].im, -0),
			`index ${i}: imaginary part must not be -0`,
		);
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= eps,
			`index ${i} re: expected ${expected[i].re}, got ${actual[i].re}`,
		);
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= eps,
			`index ${i} im: expected ${expected[i].im}, got ${actual[i].im}`,
		);
	}
}

/**
 * Evaluates a complex polynomial `coeffs` at complex point `z` via Horner's method.
 */
function evalPolyComplex(coeffs, z) {
	let accRe = 0;
	let accIm = 0;
	for (let i = coeffs.length - 1; i >= 0; i--) {
		const nextRe = accRe * z.re - accIm * z.im + coeffs[i].re;
		const nextIm = accRe * z.im + accIm * z.re + coeffs[i].im;
		accRe = nextRe;
		accIm = nextIm;
	}
	return { re: accRe, im: accIm };
}

/**
 * Deterministic LCG pseudo-random generator for reproducible tests.
 */
function createPrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0x100000000) * 20 - 10;
	};
}

describe('convolutionComplexRecursive', () => {
	describe('normal cases', () => {
		it('convolves real-valued complex sequences', () => {
			const a = [c(1), c(2), c(3)];
			const b = [c(4), c(5)];
			const result = convolutionComplexRecursive(a, b);
			assertComplexSeqClose(result, [c(4), c(13), c(22), c(15)]);
		});

		it('convolves purely imaginary sequences', () => {
			const a = [c(0, 1), c(0, 2)];
			const b = [c(0, 3), c(0, 4)];
			// (i + 2ix)(3i + 4ix) = -3 - 10x - 8x^2
			const result = convolutionComplexRecursive(a, b);
			assertComplexSeqClose(result, [c(-3, 0), c(-10, 0), c(-8, 0)]);
		});

		it('convolves general complex sequences', () => {
			const a = [c(1, 2), c(3, -1)];
			const b = [c(2, 1), c(-1, 4)];
			// k=0: (1+2i)(2+i) = 0 + 5i
			// k=1: (1+2i)(-1+4i) + (3-i)(2+i) = (-9+2i) + (7+i) = -2 + 3i
			// k=2: (3-i)(-1+4i) = 1 + 13i
			const result = convolutionComplexRecursive(a, b);
			assertComplexSeqClose(result, [c(0, 5), c(-2, 3), c(1, 13)]);
		});

		it('handles unequal lengths and fractional negative values', () => {
			const a = [c(-1.5, 0.25), c(2.75, -3.5), c(0, 4.125), c(-0.5, -0.5), c(3.25, 1.75)];
			const b = [c(0.5, -1.25), c(-2.0, 0.75)];
			const result = convolutionComplexRecursive(a, b);
			assertComplexSeqClose(result, naiveConvolutionComplex(a, b));
		});
	});

	describe('edge cases', () => {
		it('returns empty array when either or both inputs are empty', () => {
			assert.deepEqual(convolutionComplexRecursive([], []), []);
			assert.deepEqual(convolutionComplexRecursive([], [c(1, 2)]), []);
			assert.deepEqual(convolutionComplexRecursive([c(1, 2)], []), []);
		});

		it('handles single-element sequences', () => {
			const result = convolutionComplexRecursive([c(3, 4)], [c(1, -2)]);
			// (3+4i)(1-2i) = 11 - 2i
			assertComplexSeqClose(result, [c(11, -2)]);
		});

		it('preserves a sequence when convolved with the unit impulse', () => {
			const x = [c(1, -1), c(2, 3), c(-4, 0.5), c(0, -2), c(5, 5)];
			const delta = [c(1, 0)];
			assertComplexSeqClose(convolutionComplexRecursive(x, delta), x);
			assertComplexSeqClose(convolutionComplexRecursive(delta, x), x);
		});

		it('shifts a sequence when convolved with a delayed impulse', () => {
			const x = [c(2, 1), c(-3, 4), c(0, -5)];
			const delayedDelta = [c(0, 0), c(0, 0), c(1, 0)];
			assertComplexSeqClose(convolutionComplexRecursive(x, delayedDelta), [
				c(0, 0),
				c(0, 0),
				c(2, 1),
				c(-3, 4),
				c(0, -5),
			]);
		});

		it('returns all zeros when convolving with an all-zero sequence', () => {
			const a = [c(1, 2), c(3, 4), c(5, 6)];
			const zeros = [c(0, 0), c(0, 0)];
			const result = convolutionComplexRecursive(a, zeros);
			assertComplexSeqClose(result, [c(0, 0), c(0, 0), c(0, 0), c(0, 0)]);
		});

		it('normalizes -0 to +0 in output components', () => {
			const result = convolutionComplexRecursive([c(-0, -0)], [c(1, -0)]);
			assert.equal(result.length, 1);
			assert.ok(Object.is(result[0].re, 0));
			assert.ok(Object.is(result[0].im, 0));

			const result2 = convolutionComplexRecursive([c(0, 0), c(-0, 0)], [c(-1, 0), c(0, -0)]);
			for (const el of result2) {
				assert.ok(!Object.is(el.re, -0));
				assert.ok(!Object.is(el.im, -0));
			}
		});

		it('handles power-of-two and non-power-of-two output lengths', () => {
			const rand = createPrng(42);
			const pairs = [
				[1, 1],   // outLen = 1 (2^0)
				[1, 2],   // outLen = 2 (2^1)
				[2, 2],   // outLen = 3
				[2, 3],   // outLen = 4 (2^2)
				[3, 3],   // outLen = 5
				[4, 5],   // outLen = 8 (2^3)
				[5, 5],   // outLen = 9
				[8, 9],   // outLen = 16 (2^4)
				[9, 9],   // outLen = 17
			];
			for (const [m, n] of pairs) {
				const a = Array.from({ length: m }, () => c(rand(), rand()));
				const b = Array.from({ length: n }, () => c(rand(), rand()));
				const actual = convolutionComplexRecursive(a, b);
				const expected = naiveConvolutionComplex(a, b);
				assertComplexSeqClose(actual, expected, 1e-8);
			}
		});

		it('does not mutate input arrays or input complex objects', () => {
			const a = [c(1, 2), c(3, 4)];
			const b = [c(5, 6), c(7, 8)];
			const aSnapshot = structuredClone(a);
			const bSnapshot = structuredClone(b);

			const result = convolutionComplexRecursive(a, b);

			assert.deepEqual(a, aSnapshot);
			assert.deepEqual(b, bSnapshot);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
			for (const el of result) {
				assert.ok(!a.includes(el));
				assert.ok(!b.includes(el));
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			const badInputs = [null, undefined, 42, 'abc', { re: 1, im: 0 }, new Float64Array([1, 2])];
			for (const bad of badInputs) {
				assert.throws(() => convolutionComplexRecursive(bad, [c(1, 0)]), TypeError);
				assert.throws(() => convolutionComplexRecursive([c(1, 0)], bad), TypeError);
				assert.throws(() => convolutionComplexRecursive(bad, []), TypeError);
				assert.throws(() => convolutionComplexRecursive([], bad), TypeError);
			}
		});

		it('throws TypeError for invalid elements inside sequences', () => {
			const badElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
				{ re: 1n, im: 0 },
			];
			for (const badEl of badElements) {
				assert.throws(() => convolutionComplexRecursive([badEl], [c(1, 0)]), TypeError);
				assert.throws(() => convolutionComplexRecursive([c(1, 0)], [badEl]), TypeError);
				assert.throws(() => convolutionComplexRecursive([], [badEl]), TypeError);
			}
		});

		it('throws TypeError for sparse arrays', () => {
			const sparse = new Array(2);
			sparse[0] = c(1, 0);
			assert.throws(() => convolutionComplexRecursive(sparse, [c(1, 0)]), TypeError);
		});

		it('throws RangeError for non-finite re or im values', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			];
			for (const badEl of nonFinite) {
				assert.throws(() => convolutionComplexRecursive([badEl], [c(1, 0)]), RangeError);
				assert.throws(() => convolutionComplexRecursive([c(1, 0)], [badEl]), RangeError);
				assert.throws(() => convolutionComplexRecursive([], [badEl]), RangeError);
			}
		});
	});

	describe('cross-checks and mathematical identities', () => {
		it('matches direct O(M*N) naive convolution on larger pseudo-random sequences', () => {
			const rand = createPrng(1337);
			const a = Array.from({ length: 64 }, () => c(rand(), rand()));
			const b = Array.from({ length: 47 }, () => c(rand(), rand()));

			const actual = convolutionComplexRecursive(a, b);
			const expected = naiveConvolutionComplex(a, b);
			assertComplexSeqClose(actual, expected, 1e-7);
		});

		it('matches known analytical triangular window for boxcar * boxcar', () => {
			const n = 11;
			const ones = Array.from({ length: n }, () => c(1, 0));
			const expected = Array.from({ length: 2 * n - 1 }, (_, k) =>
				c(k < n ? k + 1 : 2 * n - 1 - k, 0),
			);
			const actual = convolutionComplexRecursive(ones, ones);
			assertComplexSeqClose(actual, expected, 1e-9);
		});

		it('satisfies commutativity, associativity, distributivity, and conjugate symmetry', () => {
			const rand = createPrng(2026);
			const a = Array.from({ length: 7 }, () => c(rand(), rand()));
			const b = Array.from({ length: 5 }, () => c(rand(), rand()));
			const d = Array.from({ length: 5 }, () => c(rand(), rand()));

			// Commutativity: a * b == b * a
			assertComplexSeqClose(
				convolutionComplexRecursive(a, b),
				convolutionComplexRecursive(b, a),
				1e-8,
			);

			// Associativity: (a * b) * d == a * (b * d)
			const lhsAssoc = convolutionComplexRecursive(convolutionComplexRecursive(a, b), d);
			const rhsAssoc = convolutionComplexRecursive(a, convolutionComplexRecursive(b, d));
			assertComplexSeqClose(lhsAssoc, rhsAssoc, 1e-6);

			// Distributivity: a * (b + d) == (a * b) + (a * d)
			const bPlusD = b.map((el, i) => c(el.re + d[i].re, el.im + d[i].im));
			const lhsDist = convolutionComplexRecursive(a, bPlusD);
			const ab = convolutionComplexRecursive(a, b);
			const ad = convolutionComplexRecursive(a, d);
			const rhsDist = ab.map((el, i) => c(el.re + ad[i].re, el.im + ad[i].im));
			assertComplexSeqClose(lhsDist, rhsDist, 1e-7);

			// Conjugate symmetry: conj(a * b) == conj(a) * conj(b)
			const conj = (seq) => seq.map((el) => c(el.re, -el.im));
			assertComplexSeqClose(
				conj(convolutionComplexRecursive(a, b)),
				convolutionComplexRecursive(conj(a), conj(b)),
				1e-8,
			);
		});

		it('satisfies the polynomial multiplication theorem P_{a*b}(z) = P_a(z) * P_b(z)', () => {
			const rand = createPrng(999);
			const a = Array.from({ length: 12 }, () => c(rand(), rand()));
			const b = Array.from({ length: 9 }, () => c(rand(), rand()));
			const conv = convolutionComplexRecursive(a, b);

			const evalPoints = [c(1, 0), c(-1, 0), c(0, 1), c(0.6, -0.8), c(-0.5, 0.5)];
			for (const z of evalPoints) {
				const pA = evalPolyComplex(a, z);
				const pB = evalPolyComplex(b, z);
				const prod = {
					re: pA.re * pB.re - pA.im * pB.im,
					im: pA.re * pB.im + pA.im * pB.re,
				};
				const pConv = evalPolyComplex(conv, z);
				assertComplexSeqClose([pConv], [prod], 1e-7);
			}
		});
	});
});
