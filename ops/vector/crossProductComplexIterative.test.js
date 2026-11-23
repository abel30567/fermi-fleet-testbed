import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductComplexIterative } from './crossProductComplexIterative.js';

const c = (re, im = 0) => ({ re, im });

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i++) {
		assertComplexClose(actual[i], expected[i], eps);
	}
}

// Independent helpers for cross-checks
function cAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im };
}
function cMul(x, y) {
	return { re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re };
}
function cScaleVec(s, v) {
	return v.map((el) => cMul(s, el));
}
function vAdd(u, v) {
	return [cAdd(u[0], v[0]), cAdd(u[1], v[1]), cAdd(u[2], v[2])];
}
function bilinearDot(u, v) {
	return u.reduce((acc, ui, idx) => cAdd(acc, cMul(ui, v[idx])), c(0, 0));
}

/**
 * Independent reference implementation via explicit Levi-Civita tensor summation:
 * (a x b)_k = sum_{i=0..2} sum_{j=0..2} eps_{ijk} * a_i * b_j
 */
function crossProductLeviCivita(a, b) {
	const leviCivita = (i, j, k) => {
		if (i === j || j === k || i === k) return 0;
		if ((i === 0 && j === 1 && k === 2) || (i === 1 && j === 2 && k === 0) || (i === 2 && j === 0 && k === 1)) {
			return 1;
		}
		return -1;
	};
	const out = [c(0, 0), c(0, 0), c(0, 0)];
	for (let k = 0; k < 3; k++) {
		let sum = c(0, 0);
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				const sign = leviCivita(i, j, k);
				if (sign !== 0) {
					const prod = cMul(a[i], b[j]);
					sum = cAdd(sum, { re: sign * prod.re, im: sign * prod.im });
				}
			}
		}
		out[k] = sum;
	}
	return out;
}

describe('crossProductComplexIterative', () => {
	describe('normal cases', () => {
		it('computes standard real basis vector cross products embedded in C^3', () => {
			const e1 = [c(1), c(0), c(0)];
			const e2 = [c(0), c(1), c(0)];
			const e3 = [c(0), c(0), c(1)];

			assert.deepStrictEqual(crossProductComplexIterative(e1, e2), e3);
			assert.deepStrictEqual(crossProductComplexIterative(e2, e3), e1);
			assert.deepStrictEqual(crossProductComplexIterative(e3, e1), e2);
			assert.deepStrictEqual(crossProductComplexIterative(e2, e1), [c(0), c(0), c(-1)]);
		});

		it('computes cross product of purely imaginary vectors', () => {
			const a = [c(0, 1), c(0, 0), c(0, 0)];
			const b = [c(0, 0), c(0, 1), c(0, 0)];
			assert.deepStrictEqual(crossProductComplexIterative(a, b), [c(0, 0), c(0, 0), c(-1, 0)]);
		});

		it('computes exact cross product of general complex integer vectors', () => {
			const a = [c(1, 2), c(3, -1), c(-2, 4)];
			const b = [c(2, -3), c(-1, 5), c(4, 1)];
			const expected = [c(31, 13), c(6, 5), c(-14, 14)];

			assert.deepStrictEqual(crossProductComplexIterative(a, b), expected);
		});

		it('handles floating-point complex components accurately', () => {
			const a = [c(0.5, -1.25), c(2.5, 0.75), c(-1.5, 3.0)];
			const b = [c(-0.75, 2.0), c(1.25, -0.5), c(0.25, 1.5)];
			const expected = crossProductLeviCivita(a, b);

			assertVecClose(crossProductComplexIterative(a, b), expected, 1e-12);
		});
	});

	describe('edge cases', () => {
		it('returns zero vector when either operand is the zero vector', () => {
			const zero = [c(0, 0), c(0, 0), c(0, 0)];
			const v = [c(3, -4), c(5, 6), c(-7, 8)];

			assert.deepStrictEqual(crossProductComplexIterative(zero, v), zero);
			assert.deepStrictEqual(crossProductComplexIterative(v, zero), zero);
		});

		it('returns zero vector for self cross product and complex-collinear vectors', () => {
			const zero = [c(0, 0), c(0, 0), c(0, 0)];
			const v = [c(2, -3), c(-1, 4), c(5, 2)];
			const lambda = c(-3, 7);
			const scaled = cScaleVec(lambda, v);

			assert.deepStrictEqual(crossProductComplexIterative(v, v), zero);
			assert.deepStrictEqual(crossProductComplexIterative(v, scaled), zero);
		});

		it('normalizes negative zero outputs to +0', () => {
			const a = [c(-0, -0), c(-0, -0), c(-0, -0)];
			const b = [c(1, -1), c(-2, 3), c(4, -5)];
			const res = crossProductComplexIterative(a, b);

			for (const entry of res) {
				assert.ok(Object.is(entry.re, 0), `expected +0 for re, got ${entry.re}`);
				assert.ok(Object.is(entry.im, 0), `expected +0 for im, got ${entry.im}`);
			}
		});

		it('does not mutate input vectors or their elements', () => {
			const a = [c(1, 2), c(3, 4), c(5, 6)];
			const b = [c(7, 8), c(9, 10), c(11, 12)];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);

			const res = crossProductComplexIterative(a, b);
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array vector arguments', () => {
			const valid = [c(1, 0), c(0, 1), c(1, 1)];
			for (const bad of [null, undefined, 42, 'abc', {}, new Float64Array(3)]) {
				assert.throws(() => crossProductComplexIterative(bad, valid), TypeError);
				assert.throws(() => crossProductComplexIterative(valid, bad), TypeError);
			}
		});

		it('throws RangeError for vectors whose length is not 3', () => {
			const valid = [c(1, 0), c(0, 1), c(1, 1)];
			for (const bad of [[], [c(1, 0)], [c(1, 0), c(2, 0)], [c(1, 0), c(2, 0), c(3, 0), c(4, 0)]]) {
				assert.throws(() => crossProductComplexIterative(bad, valid), RangeError);
				assert.throws(() => crossProductComplexIterative(valid, bad), RangeError);
			}
		});

		it('throws TypeError for invalid complex element structures or sparse arrays', () => {
			const valid = [c(1, 0), c(0, 1), c(1, 1)];
			const sparse = new Array(3);
			assert.throws(() => crossProductComplexIterative(sparse, valid), TypeError);

			const badElements = [
				null,
				undefined,
				1,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			];
			for (const badEl of badElements) {
				assert.throws(() => crossProductComplexIterative([badEl, c(0), c(0)], valid), TypeError);
				assert.throws(() => crossProductComplexIterative(valid, [c(0), badEl, c(0)]), TypeError);
			}
		});

		it('throws RangeError for non-finite real or imaginary components', () => {
			const valid = [c(1, 0), c(0, 1), c(1, 1)];
			const badComplex = [
				c(NaN, 0),
				c(0, NaN),
				c(Infinity, 1),
				c(1, -Infinity),
			];
			for (const bad of badComplex) {
				assert.throws(() => crossProductComplexIterative([c(0), c(0), bad], valid), RangeError);
				assert.throws(() => crossProductComplexIterative(valid, [bad, c(0), c(0)]), RangeError);
			}
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		const vectors = [
			[c(1.5, -2.25), c(-3.1, 0.4), c(2.7, 4.8)],
			[c(-0.9, 3.3), c(4.2, -1.7), c(-2.6, 0.5)],
			[c(2.1, 1.4), c(-0.8, -3.5), c(1.9, -2.2)],
		];

		it('matches independent Levi-Civita tensor summation across multiple vector pairs', () => {
			for (const a of vectors) {
				for (const b of vectors) {
					const actual = crossProductComplexIterative(a, b);
					const ref = crossProductLeviCivita(a, b);
					assertVecClose(actual, ref, 1e-12);
				}
			}
		});

		it('satisfies anti-symmetry: a × b = -(b × a)', () => {
			const [a, b] = vectors;
			const ab = crossProductComplexIterative(a, b);
			const ba = crossProductComplexIterative(b, a);
			const negBa = cScaleVec(c(-1, 0), ba);
			assertVecClose(ab, negBa, 1e-12);
		});

		it('satisfies complex bilinearity: (αa + βb) × c = α(a × c) + β(b × c)', () => {
			const [a, b, v] = vectors;
			const alpha = c(2.5, -1.5);
			const beta = c(-0.75, 3.25);

			const lhs = crossProductComplexIterative(vAdd(cScaleVec(alpha, a), cScaleVec(beta, b)), v);
			const rhs = vAdd(
				cScaleVec(alpha, crossProductComplexIterative(a, v)),
				cScaleVec(beta, crossProductComplexIterative(b, v))
			);
			assertVecClose(lhs, rhs, 1e-11);
		});

		it('satisfies bilinear orthogonality: (a × b) · a = 0 and (a × b) · b = 0', () => {
			const [a, b] = vectors;
			const ab = crossProductComplexIterative(a, b);
			assertComplexClose(bilinearDot(ab, a), c(0, 0), 1e-11);
			assertComplexClose(bilinearDot(ab, b), c(0, 0), 1e-11);
		});

		it('satisfies Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const [a, b, v] = vectors;
			const t1 = crossProductComplexIterative(a, crossProductComplexIterative(b, v));
			const t2 = crossProductComplexIterative(b, crossProductComplexIterative(v, a));
			const t3 = crossProductComplexIterative(v, crossProductComplexIterative(a, b));
			const sum = vAdd(vAdd(t1, t2), t3);
			assertVecClose(sum, [c(0, 0), c(0, 0), c(0, 0)], 1e-10);
		});

		it('satisfies BAC-CAB identity: a×(b×c) = (a·c)b - (a·b)c', () => {
			const [a, b, v] = vectors;
			const lhs = crossProductComplexIterative(a, crossProductComplexIterative(b, v));
			const ac = bilinearDot(a, v);
			const ab = bilinearDot(a, b);
			const rhs = vAdd(cScaleVec(ac, b), cScaleVec(c(-ab.re, -ab.im), v));
			assertVecClose(lhs, rhs, 1e-10);
		});
	});
});
