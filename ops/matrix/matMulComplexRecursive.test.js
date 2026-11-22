import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulComplexRecursive } from './matMulComplexRecursive.js';

const c = (re, im = 0) => ({ re, im });

/**
 * Independent direct triple-loop complex matrix multiplication reference.
 */
function naiveMatMulComplex(a, b) {
	const m = a.length;
	const k = a[0].length;
	const n = b[0].length;
	const out = Array.from({ length: m }, () =>
		Array.from({ length: n }, () => ({ re: 0, im: 0 })),
	);
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let re = 0;
			let im = 0;
			for (let p = 0; p < k; p++) {
				const x = a[i][p];
				const y = b[p][j];
				re += x.re * y.re - x.im * y.im;
				im += x.re * y.im + x.im * y.re;
			}
			out[i][j] = { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
		}
	}
	return out;
}

function addMatrices(a, b) {
	return a.map((row, i) =>
		row.map((val, j) => ({
			re: val.re + b[i][j].re,
			im: val.im + b[i][j].im,
		})),
	);
}

function conjugateTranspose(a) {
	const rows = a.length;
	const cols = a[0].length;
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => ({
			re: a[i][j].re,
			im: -a[i][j].im,
		})),
	);
}

function assertMatrixClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			const a = actual[i][j];
			const e = expected[i][j];
			assert.ok(
				Math.abs(a.re - e.re) <= tol,
				`re mismatch at [${i}][${j}]: got ${a.re}, expected ${e.re}`,
			);
			assert.ok(
				Math.abs(a.im - e.im) <= tol,
				`im mismatch at [${i}][${j}]: got ${a.im}, expected ${e.im}`,
			);
		}
	}
}

/**
 * Deterministic LCG PRNG for reproducible complex test matrices.
 */
function makeComplexMatrix(rows, cols, seed = 1) {
	let state = seed >>> 0;
	const next = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0xffffffff) * 20 - 10;
	};
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => ({ re: next(), im: next() })),
	);
}

describe('matMulComplexRecursive', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 complex matrices with nonzero real and imaginary parts', () => {
			const a = [
				[c(1, 2), c(3, -1)],
				[c(-2, 4), c(0, 5)],
			];
			const b = [
				[c(2, -3), c(1, 1)],
				[c(4, 2), c(-1, 2)],
			];
			// [0][0] = (1+2i)(2-3i) + (3-i)(4+2i) = (8+i) + (14+2i) = 22+3i
			// [0][1] = (1+2i)(1+i) + (3-i)(-1+2i) = (-1+3i) + (-1+7i) = -2+10i
			// [1][0] = (-2+4i)(2-3i) + (5i)(4+2i) = (8+14i) + (-10+20i) = -2+34i
			// [1][1] = (-2+4i)(1+i) + (5i)(-1+2i) = (-6+2i) + (-10-5i) = -16-3i
			const expected = [
				[c(22, 3), c(-2, 10)],
				[c(-2, 34), c(-16, -3)],
			];
			assert.deepEqual(matMulComplexRecursive(a, b), expected);
		});

		it('multiplies rectangular complex matrices (2x3 by 3x2)', () => {
			const a = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(3, -2), c(-1, 4), c(2, 1)],
			];
			const b = [
				[c(1, 0), c(0, 2)],
				[c(2, -1), c(1, 1)],
				[c(-1, 3), c(2, -2)],
			];
			const actual = matMulComplexRecursive(a, b);
			const expected = naiveMatMulComplex(a, b);
			assertMatrixClose(actual, expected);
			assert.equal(actual.length, 2);
			assert.equal(actual[0].length, 2);
		});

		it('handles inner product (1x4 by 4x1) and outer product (3x1 by 1x4)', () => {
			const row = [[c(1, 2), c(3, -1), c(-2, 5), c(4, 0)]];
			const col = [[c(2, -1)], [c(0, 3)], [c(1, 1)], [c(-1, 2)]];
			const inner = matMulComplexRecursive(row, col);
			assertMatrixClose(inner, naiveMatMulComplex(row, col));
			assert.equal(inner.length, 1);
			assert.equal(inner[0].length, 1);

			const outer = matMulComplexRecursive(col.slice(0, 3), row);
			assertMatrixClose(outer, naiveMatMulComplex(col.slice(0, 3), row));
			assert.equal(outer.length, 3);
			assert.equal(outer[0].length, 4);
		});

		it('does not mutate input matrices', () => {
			const a = [
				[c(1, 2), c(3, 4)],
				[c(5, 6), c(7, 8)],
			];
			const b = [
				[c(-1, 2), c(0, -3)],
				[c(4, 1), c(2, -2)],
			];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);
			matMulComplexRecursive(a, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe('edge cases', () => {
		it('multiplies 1x1 matrices (pure real, pure imaginary, general complex)', () => {
			assert.deepEqual(matMulComplexRecursive([[c(3, 0)]], [[c(-4, 0)]]), [[c(-12, 0)]]);
			assert.deepEqual(matMulComplexRecursive([[c(0, 1)]], [[c(0, 1)]]), [[c(-1, 0)]]);
			assert.deepEqual(matMulComplexRecursive([[c(3, 4)]], [[c(3, -4)]]), [[c(25, 0)]]);
		});

		it('handles zero matrices and identity matrices', () => {
			const a = [
				[c(2, -3), c(0, 5), c(-1, 1)],
				[c(4, 1), c(-2, 0), c(3, -4)],
				[c(0, 0), c(1, 2), c(-5, -2)],
			];
			const zero = Array.from({ length: 3 }, () =>
				Array.from({ length: 3 }, () => c(0, 0)),
			);
			const id = [
				[c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0)],
			];

			assert.deepEqual(matMulComplexRecursive(a, zero), zero);
			assert.deepEqual(matMulComplexRecursive(zero, a), zero);
			assert.deepEqual(matMulComplexRecursive(a, id), a);
			assert.deepEqual(matMulComplexRecursive(id, a), a);
		});

		it('normalizes -0 to +0 in output components', () => {
			const a = [[c(-0, 0), c(0, -0)]];
			const b = [[c(-1, 0)], [c(0, 1)]];
			const res = matMulComplexRecursive(a, b);
			assert.ok(Object.is(res[0][0].re, 0), 'expected +0 for re');
			assert.ok(Object.is(res[0][0].im, 0), 'expected +0 for im');

			const negZeroProd = matMulComplexRecursive([[c(0, -0)]], [[c(-5, -0)]]);
			assert.ok(Object.is(negZeroProd[0][0].re, 0));
			assert.ok(Object.is(negZeroProd[0][0].im, 0));
		});

		it('handles pure real and pure imaginary matrices', () => {
			const realA = [
				[c(1, 0), c(-2, 0)],
				[c(3, 0), c(4, 0)],
			];
			const realB = [
				[c(5, 0), c(6, 0)],
				[c(-7, 0), c(8, 0)],
			];
			assert.deepEqual(matMulComplexRecursive(realA, realB), [
				[c(19, 0), c(-10, 0)],
				[c(-13, 0), c(50, 0)],
			]);

			const imagA = [
				[c(0, 2), c(0, -3)],
				[c(0, 1), c(0, 4)],
			];
			const imagB = [
				[c(0, 5), c(0, 1)],
				[c(0, -2), c(0, 3)],
			];
			// (i*x)(i*y) = -xy -> pure real result
			assert.deepEqual(matMulComplexRecursive(imagA, imagB), [
				[c(-16, 0), c(7, 0)],
				[c(3, 0), c(-13, 0)],
			]);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrices or rows', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive(null, valid), TypeError);
			assert.throws(() => matMulComplexRecursive(valid, undefined), TypeError);
			assert.throws(() => matMulComplexRecursive('not-a-matrix', valid), TypeError);
			assert.throws(() => matMulComplexRecursive(42, valid), TypeError);
			assert.throws(() => matMulComplexRecursive([c(1, 0)], valid), TypeError);
			assert.throws(() => matMulComplexRecursive(valid, [null]), TypeError);
		});

		it('throws TypeError for invalid complex entry objects or non-numeric components', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive([[null]], valid), TypeError);
			assert.throws(() => matMulComplexRecursive([[1]], valid), TypeError);
			assert.throws(() => matMulComplexRecursive([[{ re: 1 }]], valid), TypeError);
			assert.throws(() => matMulComplexRecursive([[{ re: '1', im: 0 }]], valid), TypeError);
			assert.throws(() => matMulComplexRecursive(valid, [[{ re: 1, im: null }]]), TypeError);
		});

		it('throws RangeError for empty or ragged matrices', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive([], valid), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, []), RangeError);
			assert.throws(() => matMulComplexRecursive([[]], valid), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, [[]]), RangeError);
			assert.throws(
				() => matMulComplexRecursive([[c(1, 0)], [c(1, 0), c(2, 0)]], [[c(1, 0)]]),
				RangeError,
			);
			assert.throws(
				() => matMulComplexRecursive([[c(1, 0), c(2, 0)]], [[c(1, 0)], [c(1, 0), c(2, 0)]]),
				RangeError,
			);
		});

		it('throws RangeError for non-finite complex components', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive([[c(NaN, 0)]], valid), RangeError);
			assert.throws(() => matMulComplexRecursive([[c(0, Infinity)]], valid), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, [[c(-Infinity, 1)]]), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, [[c(1, NaN)]]), RangeError);
		});

		it('throws RangeError for incompatible inner dimensions', () => {
			const a = [
				[c(1, 0), c(2, 0), c(3, 0)],
				[c(4, 0), c(5, 0), c(6, 0)],
			];
			const b = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
			];
			assert.throws(() => matMulComplexRecursive(a, b), RangeError);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches independent naive iterative reference across varied shapes', () => {
			const shapes = [
				[1, 1, 1],
				[1, 9, 1],
				[7, 1, 5],
				[3, 5, 4],
				[4, 4, 4],
				[5, 5, 5],
				[8, 8, 8],
				[13, 11, 17],
				[16, 16, 16],
				[2, 33, 3],
			];
			for (let idx = 0; idx < shapes.length; idx++) {
				const [m, k, n] = shapes[idx];
				const a = makeComplexMatrix(m, k, 100 + idx * 2);
				const b = makeComplexMatrix(k, n, 200 + idx * 2);
				const actual = matMulComplexRecursive(a, b);
				const expected = naiveMatMulComplex(a, b);
				assertMatrixClose(actual, expected, 1e-10);
			}
		});

		it('satisfies associativity (A*B)*C = A*(B*C) and distributivity A*(B+C) = A*B + A*C', () => {
			const a = makeComplexMatrix(5, 7, 11);
			const b = makeComplexMatrix(7, 6, 22);
			const d = makeComplexMatrix(6, 4, 33);

			const leftAssoc = matMulComplexRecursive(matMulComplexRecursive(a, b), d);
			const rightAssoc = matMulComplexRecursive(a, matMulComplexRecursive(b, d));
			assertMatrixClose(leftAssoc, rightAssoc, 1e-9);

			const b2 = makeComplexMatrix(7, 6, 44);
			const lhsDist = matMulComplexRecursive(a, addMatrices(b, b2));
			const rhsDist = addMatrices(
				matMulComplexRecursive(a, b),
				matMulComplexRecursive(a, b2),
			);
			assertMatrixClose(lhsDist, rhsDist, 1e-10);
		});

		it('satisfies conjugate transpose reversal (A*B)^H = B^H * A^H', () => {
			const a = makeComplexMatrix(6, 9, 55);
			const b = makeComplexMatrix(9, 5, 66);

			const lhs = conjugateTranspose(matMulComplexRecursive(a, b));
			const rhs = matMulComplexRecursive(conjugateTranspose(b), conjugateTranspose(a));
			assertMatrixClose(lhs, rhs, 1e-10);
		});

		it('verifies unitarity of the normalized complex DFT matrix: F * F^H = I', () => {
			const N = 7;
			const scale = 1 / Math.sqrt(N);
			const F = Array.from({ length: N }, (_, j) =>
				Array.from({ length: N }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / N;
					return { re: scale * Math.cos(angle), im: scale * Math.sin(angle) };
				}),
			);
			const FH = conjugateTranspose(F);
			const prod = matMulComplexRecursive(F, FH);
			const identity = Array.from({ length: N }, (_, i) =>
				Array.from({ length: N }, (_, j) => c(i === j ? 1 : 0, 0)),
			);
			assertMatrixClose(prod, identity, 1e-12);
		});

		it('satisfies Pauli matrix algebra over C', () => {
			const I = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1, 0)],
			];
			const sx = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)],
			];
			const sy = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)],
			];
			const sz = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(-1, 0)],
			];

			assert.deepEqual(matMulComplexRecursive(sx, sx), I);
			assert.deepEqual(matMulComplexRecursive(sy, sy), I);
			assert.deepEqual(matMulComplexRecursive(sz, sz), I);
			// sx * sy = i * sz
			assert.deepEqual(matMulComplexRecursive(sx, sy), [
				[c(0, 1), c(0, 0)],
				[c(0, 0), c(0, -1)],
			]);
			// sy * sx = -i * sz (non-commutativity)
			assert.deepEqual(matMulComplexRecursive(sy, sx), [
				[c(0, -1), c(0, 0)],
				[c(0, 0), c(0, 1)],
			]);
		});
	});
});
