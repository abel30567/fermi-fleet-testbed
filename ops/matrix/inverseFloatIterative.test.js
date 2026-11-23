import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseFloatIterative } from './inverseFloatIterative.js';

function matMul(A, B) {
	const n = A.length;
	const m = B[0].length;
	const kLen = B.length;
	const C = Array.from({ length: n }, () => new Array(m).fill(0));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			let sum = 0;
			for (let k = 0; k < kLen; k++) {
				sum += A[i][k] * B[k][j];
			}
			C[i][j] = sum;
		}
	}
	return C;
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
	);
}

function assertMatrixClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length, 'row count mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j]);
			assert.ok(
				diff <= eps,
				`entry [${i}][${j}] expected ${expected[i][j]}, got ${actual[i][j]} (diff=${diff} > ${eps})`
			);
		}
	}
}

describe('inverseFloatIterative', () => {
	it('inverts 1x1 matrices', () => {
		assertMatrixClose(inverseFloatIterative([[4]]), [[0.25]]);
		assertMatrixClose(inverseFloatIterative([[-2.5]]), [[-0.4]]);
	});

	it('inverts identity matrices of various sizes', () => {
		for (const n of [1, 2, 3, 5]) {
			const I = identity(n);
			assert.deepStrictEqual(inverseFloatIterative(I), I);
		}
	});

	it('inverts a 2x2 matrix matching the closed-form formula', () => {
		const A = [
			[4, 7],
			[2, 6],
		];
		// det = 24 - 14 = 10 -> inv = [[0.6, -0.7], [-0.2, 0.4]]
		const expected = [
			[0.6, -0.7],
			[-0.2, 0.4],
		];
		const inv = inverseFloatIterative(A);
		assertMatrixClose(inv, expected, 1e-12);
		assertMatrixClose(matMul(A, inv), identity(2), 1e-12);
		assertMatrixClose(matMul(inv, A), identity(2), 1e-12);
	});

	it('inverts a 3x3 matrix requiring partial pivoting (zero on diagonal)', () => {
		const A = [
			[0, 2, 1],
			[1, -2, -3],
			[-1, 1, 2],
		];
		const inv = inverseFloatIterative(A);
		assertMatrixClose(matMul(A, inv), identity(3), 1e-12);
		assertMatrixClose(matMul(inv, A), identity(3), 1e-12);
	});

	it('inverts permutation and orthogonal rotation matrices (R^-1 == R^T)', () => {
		const P = [
			[0, 0, 1],
			[1, 0, 0],
			[0, 1, 0],
		];
		const PInv = inverseFloatIterative(P);
		assert.deepStrictEqual(PInv, [
			[0, 1, 0],
			[0, 0, 1],
			[1, 0, 0],
		]);

		const theta = 1.2345;
		const c = Math.cos(theta);
		const s = Math.sin(theta);
		const R = [
			[c, -s],
			[s, c],
		];
		const RT = [
			[c, s],
			[-s, c],
		];
		assertMatrixClose(inverseFloatIterative(R), RT, 1e-12);
	});

	it('inverts diagonal and triangular matrices accurately', () => {
		const D = [
			[2, 0, 0],
			[0, -4, 0],
			[0, 0, 0.5],
		];
		assertMatrixClose(inverseFloatIterative(D), [
			[0.5, 0, 0],
			[0, -0.25, 0],
			[0, 0, 2],
		], 1e-12);

		const U = [
			[2, 3, -1, 4],
			[0, -5, 2, 1],
			[0, 0, 3, -2],
			[0, 0, 0, 0.5],
		];
		const UInv = inverseFloatIterative(U);
		assertMatrixClose(matMul(U, UInv), identity(4), 1e-12);
		assertMatrixClose(matMul(UInv, U), identity(4), 1e-12);
	});

	it('satisfies cross-checks A*inv(A)=I, inv(inv(A))=A, and inv(A*B)=inv(B)*inv(A) on larger matrices', () => {
		// Deterministic 6x6 diagonally dominant matrix
		const n = 6;
		const A = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) =>
				i === j ? 10 + i : Math.sin(i * 3 + j + 1) * 0.7
			)
		);
		const B = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) =>
				i === j ? 8 + j : Math.cos(i + j * 2 + 1) * 0.5
			)
		);

		const AInv = inverseFloatIterative(A);
		const BInv = inverseFloatIterative(B);

		assertMatrixClose(matMul(A, AInv), identity(n), 1e-11);
		assertMatrixClose(matMul(AInv, A), identity(n), 1e-11);
		assertMatrixClose(inverseFloatIterative(AInv), A, 1e-11);

		const ABInv = inverseFloatIterative(matMul(A, B));
		const BInvAInv = matMul(BInv, AInv);
		assertMatrixClose(ABInv, BInvAInv, 1e-11);
	});

	it('handles uniformly small and uniformly large matrix scales', () => {
		const small = [
			[1e-20, 0],
			[0, 2e-20],
		];
		const smallInv = inverseFloatIterative(small);
		assertMatrixClose(matMul(small, smallInv), identity(2), 1e-12);

		const large = [
			[1e20, 2e20],
			[3e20, 4e20],
		];
		const largeInv = inverseFloatIterative(large);
		assertMatrixClose(matMul(large, largeInv), identity(2), 1e-12);
	});

	it('does not mutate the input matrix and normalizes -0 to 0', () => {
		const A = [
			[1, 0],
			[0, -1],
		];
		const copy = A.map((row) => [...row]);
		const inv = inverseFloatIterative(A);
		assert.deepStrictEqual(A, copy);
		for (const row of inv) {
			for (const val of row) {
				assert.ok(!Object.is(val, -0), 'expected no negative zero in output');
			}
		}
	});

	it('throws on singular and nearly singular matrices', () => {
		assert.throws(() => inverseFloatIterative([[0]]), /singular/i);
		assert.throws(
			() =>
				inverseFloatIterative([
					[0, 0],
					[0, 0],
				]),
			/singular/i
		);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2],
					[2, 4],
				]),
			/singular/i
		);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2, 3],
					[4, 5, 6],
					[7, 8, 9],
				]),
			/singular/i
		);
		// Nearly singular relative to default tolerance 1e-12
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 1],
					[1, 1 + 1e-14],
				]),
			/singular/i
		);
	});

	it('throws on float64 overflow during inversion', () => {
		assert.throws(() => inverseFloatIterative([[1e-315]]), RangeError);
	});

	it('validates invalid inputs and tolerance', () => {
		assert.throws(() => inverseFloatIterative(null), TypeError);
		assert.throws(() => inverseFloatIterative('matrix'), TypeError);
		assert.throws(() => inverseFloatIterative([]), RangeError);
		assert.throws(() => inverseFloatIterative([1, 2]), TypeError);
		assert.throws(() => inverseFloatIterative([[1, 2]]), RangeError);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2],
					[3],
				]),
			RangeError
		);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, '2'],
					[3, 4],
				]),
			TypeError
		);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, NaN],
					[0, 1],
				]),
			RangeError
		);
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, Infinity],
					[0, 1],
				]),
			RangeError
		);
		assert.throws(() => inverseFloatIterative([[1]], '1e-12'), TypeError);
		assert.throws(() => inverseFloatIterative([[1]], -1e-12), RangeError);
		assert.throws(() => inverseFloatIterative([[1]], NaN), RangeError);
	});
});
