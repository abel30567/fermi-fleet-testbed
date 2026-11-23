import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { convolutionComplexIterative } from './convolutionComplexIterative.js';

const c = (re, im = 0) => ({ re, im });

function assertComplexArrayClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`);
	for (let i = 0; i < expected.length; i++) {
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

function complexMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	};
}

function complexAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im };
}

function evalPoly(coeffs, z) {
	let acc = c(0, 0);
	let zPow = c(1, 0);
	for (const coeff of coeffs) {
		acc = complexAdd(acc, complexMul(coeff, zPow));
		zPow = complexMul(zPow, z);
	}
	return acc;
}

function dft(seq, inverse = false) {
	const N = seq.length;
	const sign = inverse ? 1 : -1;
	const out = new Array(N);
	for (let k = 0; k < N; k++) {
		let sumRe = 0;
		let sumIm = 0;
		for (let n = 0; n < N; n++) {
			const angle = (sign * 2 * Math.PI * k * n) / N;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			sumRe += seq[n].re * cos - seq[n].im * sin;
			sumIm += seq[n].re * sin + seq[n].im * cos;
		}
		out[k] = inverse ? { re: sumRe / N, im: sumIm / N } : { re: sumRe, im: sumIm };
	}
	return out;
}

describe('convolutionComplexIterative', () => {
	describe('normal cases', () => {
		it('convolves purely real sequences', () => {
			const a = [c(1, 0), c(2, 0), c(3, 0)];
			const b = [c(4, 0), c(5, 0)];
			const expected = [c(4, 0), c(13, 0), c(22, 0), c(15, 0)];
			assert.deepStrictEqual(convolutionComplexIterative(a, b), expected);
		});

		it('convolves purely imaginary sequences', () => {
			const a = [c(0, 1), c(0, 2)];
			const b = [c(0, 3), c(0, 4)];
			// (i + 2i*x)(3i + 4i*x) = -3 + (-4 - 6)x - 8x^2 = -3 - 10x - 8x^2
			const expected = [c(-3, 0), c(-10, 0), c(-8, 0)];
			assert.deepStrictEqual(convolutionComplexIterative(a, b), expected);
		});

		it('convolves general complex sequences of unequal lengths', () => {
			const a = [c(1, 2), c(3, -1), c(0, 4)];
			const b = [c(2, -3), c(-1, 1)];
			// k=0: (1+2i)(2-3i) = 8 + i
			// k=1: (1+2i)(-1+i) + (3-i)(2-3i) = (-3 - i) + (3 - 11i) = 0 - 12i
			// k=2: (3-i)(-1+i) + (4i)(2-3i) = (-2 + 4i) + (12 + 8i) = 10 + 12i
			// k=3: (4i)(-1+i) = -4 - 4i
			const expected = [c(8, 1), c(0, -12), c(10, 12), c(-4, -4)];
			assert.deepStrictEqual(convolutionComplexIterative(a, b), expected);
		});

		it('handles fractional and negative floating-point values', () => {
			const a = [c(0.5, -0.25), c(-1.5, 0.75)];
			const b = [c(0.2, 0.4), c(-0.8, -0.1)];
			const expected = [
				complexMul(a[0], b[0]),
				complexAdd(complexMul(a[0], b[1]), complexMul(a[1], b[0])),
				complexMul(a[1], b[1]),
			];
			assertComplexArrayClose(convolutionComplexIterative(a, b), expected, 1e-12);
		});

		it('does not mutate inputs and returns fresh objects', () => {
			const a = [c(1, 2), c(3, 4)];
			const b = [c(1, 0)];
			const aSnap = structuredClone(a);
			const bSnap = structuredClone(b);

			const out = convolutionComplexIterative(a, b);
			assert.deepStrictEqual(a, aSnap);
			assert.deepStrictEqual(b, bSnap);
			assert.notEqual(out[0], a[0]);
			assert.notEqual(out[1], a[1]);
		});
	});

	describe('edge cases', () => {
		it('returns an empty array when either or both inputs are empty', () => {
			assert.deepStrictEqual(convolutionComplexIterative([], []), []);
			assert.deepStrictEqual(convolutionComplexIterative([], [c(1, 2)]), []);
			assert.deepStrictEqual(convolutionComplexIterative([c(1, 2)], []), []);
		});

		it('handles single-element sequences', () => {
			assert.deepStrictEqual(
				convolutionComplexIterative([c(3, 4)], [c(3, -4)]),
				[c(25, 0)],
			);
		});

		it('preserves a sequence when convolved with unit impulse', () => {
			const seq = [c(2, -1), c(0, 5), c(-3, 4)];
			assert.deepStrictEqual(convolutionComplexIterative(seq, [c(1, 0)]), seq);
			assert.deepStrictEqual(convolutionComplexIterative([c(1, 0)], seq), seq);
		});

		it('shifts a sequence when convolved with a delayed impulse', () => {
			const seq = [c(1, -1), c(2, 3)];
			const delay2 = [c(0, 0), c(0, 0), c(1, 0)];
			assert.deepStrictEqual(
				convolutionComplexIterative(seq, delay2),
				[c(0, 0), c(0, 0), c(1, -1), c(2, 3)],
			);
		});

		it('normalizes negative zero to positive zero', () => {
			const out = convolutionComplexIterative([c(-0, 0), c(0, -0)], [c(0, 1)]);
			assert.deepStrictEqual(out, [c(0, 0), c(0, 0)]);
			for (const z of out) {
				assert.ok(!Object.is(z.re, -0));
				assert.ok(!Object.is(z.im, -0));
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 0 }]) {
				assert.throws(() => convolutionComplexIterative(bad, [c(1, 0)]), TypeError);
				assert.throws(() => convolutionComplexIterative([c(1, 0)], bad), TypeError);
			}
		});

		it('throws TypeError for malformed complex elements', () => {
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
			];
			for (const bad of badElements) {
				assert.throws(() => convolutionComplexIterative([bad], [c(1, 0)]), TypeError);
				assert.throws(() => convolutionComplexIterative([c(1, 0)], [bad]), TypeError);
			}
		});

		it('throws RangeError for non-finite complex components', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFinite) {
				assert.throws(() => convolutionComplexIterative([bad], [c(1, 0)]), RangeError);
				assert.throws(() => convolutionComplexIterative([c(1, 0)], [bad]), RangeError);
			}
		});

		it('still validates the non-empty input when the other input is empty', () => {
			assert.throws(() => convolutionComplexIterative([], [{ re: Number.NaN, im: 0 }]), RangeError);
			assert.throws(() => convolutionComplexIterative(['bad'], []), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = [c(1, -2), c(0.5, 3), c(-4, 1.5)];
			const b = [c(-2, 1), c(3, 0.25)];
			const d = [c(0, -1), c(2, 2), c(-1, 0.5), c(1, -3)];

			// Commutativity: a * b == b * a
			assertComplexArrayClose(
				convolutionComplexIterative(a, b),
				convolutionComplexIterative(b, a),
			);

			// Associativity: (a * b) * d == a * (b * d)
			const leftAssoc = convolutionComplexIterative(convolutionComplexIterative(a, b), d);
			const rightAssoc = convolutionComplexIterative(a, convolutionComplexIterative(b, d));
			assertComplexArrayClose(leftAssoc, rightAssoc);

			// Distributivity: a * (b + b2) == (a * b) + (a * b2)
			const b2 = [c(1.5, -0.5), c(-1, 4)];
			const bSum = b.map((z, i) => complexAdd(z, b2[i]));
			const lhs = convolutionComplexIterative(a, bSum);
			const ab = convolutionComplexIterative(a, b);
			const ab2 = convolutionComplexIterative(a, b2);
			const rhs = ab.map((z, i) => complexAdd(z, ab2[i]));
			assertComplexArrayClose(lhs, rhs);
		});

		it('matches polynomial multiplication at arbitrary complex evaluation points', () => {
			const a = [c(2, -1), c(-0.5, 3), c(1.25, 0.75), c(-2, -1.5)];
			const b = [c(-1, 2), c(0.5, -0.5), c(3, 1)];
			const conv = convolutionComplexIterative(a, b);

			const evalPoints = [
				c(0, 0),
				c(1, 0),
				c(-1, 0),
				c(0, 1),
				c(0.5, -0.75),
				c(-1.2, 0.9),
			];
			for (const z of evalPoints) {
				const lhs = evalPoly(conv, z);
				const rhs = complexMul(evalPoly(a, z), evalPoly(b, z));
				assertComplexArrayClose([lhs], [rhs], 1e-9);
			}
		});

		it('matches the DFT convolution theorem', () => {
			const a = [c(1.2, -0.7), c(-2.3, 1.4), c(0.5, 2.8), c(-1.1, -0.9), c(3.0, 0.2)];
			const b = [c(-0.6, 1.5), c(2.1, -1.8), c(-1.4, -0.3), c(0.8, 2.2)];

			const expectedLen = a.length + b.length - 1;
			const aPad = [...a, ...Array.from({ length: expectedLen - a.length }, () => c(0, 0))];
			const bPad = [...b, ...Array.from({ length: expectedLen - b.length }, () => c(0, 0))];

			const A = dft(aPad);
			const B = dft(bPad);
			const C = A.map((z, k) => complexMul(z, B[k]));
			const dftConv = dft(C, true);

			const iterConv = convolutionComplexIterative(a, b);
			assertComplexArrayClose(iterConv, dftConv, 1e-9);
		});
	});
});
