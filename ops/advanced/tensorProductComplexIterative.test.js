import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductComplexIterative } from './tensorProductComplexIterative.js';

const c = (re, im = 0) => ({ re, im });
const EPS = 1e-10;

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cConj(z) {
	return { re: z.re, im: -z.im };
}

function cAbsSq(z) {
	return z.re * z.re + z.im * z.im;
}

function assertComplexClose(actual, expected, eps = EPS) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps && Math.abs(actual.im - expected.im) <= eps,
		`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
	);
}

function assertVectorClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps);
	}
}

function assertMatrixClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assertVectorClose(actual[i], expected[i], eps);
	}
}

function matScale(alpha, A) {
	return A.map((row) => row.map((z) => cMul(alpha, z)));
}

function matAdd(A, B) {
	return A.map((row, i) => row.map((z, j) => cAdd(z, B[i][j])));
}

function matMul(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const out = Array.from({ length: m }, () => new Array(n));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0);
			for (let t = 0; t < k; t++) {
				sum = cAdd(sum, cMul(A[i][t], B[t][j]));
			}
			out[i][j] = sum;
		}
	}
	return out;
}

function matVecMul(A, v) {
	return A.map((row) => row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, v[j])), c(0, 0)));
}

function matTrace(A) {
	let sum = c(0, 0);
	for (let i = 0; i < A.length; i++) {
		sum = cAdd(sum, A[i][i]);
	}
	return sum;
}

function matFrobeniusNorm(A) {
	let sum = 0;
	for (const row of A) {
		for (const z of row) {
			sum += cAbsSq(z);
		}
	}
	return Math.sqrt(sum);
}

function matDagger(A) {
	const m = A.length;
	const n = A[0].length;
	const out = Array.from({ length: n }, () => new Array(m));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			out[j][i] = cConj(A[i][j]);
		}
	}
	return out;
}

function vecScale(alpha, v) {
	return v.map((z) => cMul(alpha, z));
}

function vecAdd(u, v) {
	return u.map((z, i) => cAdd(z, v[i]));
}

function vecNorm(v) {
	return Math.sqrt(v.reduce((acc, z) => acc + cAbsSq(z), 0));
}

describe('tensorProductComplexIterative', () => {
	describe('normal cases', () => {
		it('computes Kronecker product of 2x2 complex matrices (Pauli X ⊗ Pauli Y)', () => {
			const X = [
				[c(0), c(1)],
				[c(1), c(0)],
			];
			const Y = [
				[c(0), c(0, -1)],
				[c(0, 1), c(0)],
			];

			const actual = tensorProductComplexIterative(X, Y);
			const expected = [
				[c(0), c(0), c(0), c(0, -1)],
				[c(0), c(0), c(0, 1), c(0)],
				[c(0), c(0, -1), c(0), c(0)],
				[c(0, 1), c(0), c(0), c(0)],
			];

			assert.deepStrictEqual(actual, expected);
		});

		it('computes Kronecker product of general rectangular complex matrices', () => {
			const A = [
				[c(1, 2), c(0, -1)],
				[c(3, 0), c(-1, 1)],
			];
			const B = [[c(2, -1), c(1, 1), c(0, 2)]];

			const actual = tensorProductComplexIterative(A, B);
			const expected = [
				[c(4, 3), c(-1, 3), c(-4, 2), c(-1, -2), c(1, -1), c(2, 0)],
				[c(6, -3), c(3, 3), c(0, 6), c(-1, 3), c(-2, 0), c(-2, -2)],
			];

			assert.deepStrictEqual(actual, expected);
		});

		it('computes Kronecker product of 1D complex vectors', () => {
			const u = [c(1, 1), c(0, -2)];
			const v = [c(3, 0), c(1, 2), c(-1, 1)];

			const actual = tensorProductComplexIterative(u, v);
			const expected = [
				c(3, 3),
				c(-1, 3),
				c(-2, 0),
				c(0, -6),
				c(4, -2),
				c(2, 2),
			];

			assert.deepStrictEqual(actual, expected);
		});

		it('handles purely imaginary entries (i * i = -1)', () => {
			const actual = tensorProductComplexIterative([[c(0, 1)]], [[c(0, 1)]]);
			assert.deepStrictEqual(actual, [[c(-1, 0)]]);
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 matrices and 1-element vectors', () => {
			assert.deepStrictEqual(
				tensorProductComplexIterative([[c(2, 3)]], [[c(4, -5)]]),
				[[c(23, 2)]],
			);
			assert.deepStrictEqual(
				tensorProductComplexIterative([c(2, 3)], [c(4, -5)]),
				[c(23, 2)],
			);
		});

		it('returns [] when either operand is empty []', () => {
			const vec = [c(1, 2)];
			const mat = [[c(1, 2)]];
			assert.deepStrictEqual(tensorProductComplexIterative([], []), []);
			assert.deepStrictEqual(tensorProductComplexIterative([], vec), []);
			assert.deepStrictEqual(tensorProductComplexIterative(vec, []), []);
			assert.deepStrictEqual(tensorProductComplexIterative([], mat), []);
			assert.deepStrictEqual(tensorProductComplexIterative(mat, []), []);
		});

		it('handles 2D matrices with zero columns', () => {
			const emptyCols = [[], []];
			const B = [[c(1, 0)], [c(0, 1)], [c(2, 2)]];
			assert.deepStrictEqual(tensorProductComplexIterative(emptyCols, B), [[], [], [], [], [], []]);
			assert.deepStrictEqual(tensorProductComplexIterative(B, emptyCols), [[], [], [], [], [], []]);
		});

		it('normalizes negative zero to positive zero', () => {
			const res = tensorProductComplexIterative([c(-1, 0)], [c(0, 0)]);
			assert.equal(Object.is(res[0].re, 0), true);
			assert.equal(Object.is(res[0].im, 0), true);
		});

		it('does not mutate inputs and allocates distinct output objects', () => {
			const a = [[c(1, 2), c(3, 4)]];
			const b = [[c(5, 6)]];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);

			const res = tensorProductComplexIterative(a, b);
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
			assert.notEqual(res[0][0], a[0][0]);
			assert.notEqual(res[0][0], b[0][0]);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array operands', () => {
			assert.throws(() => tensorProductComplexIterative(null, [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([c(1)], undefined), TypeError);
			assert.throws(() => tensorProductComplexIterative(42, [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([c(1)], { re: 1, im: 0 }), TypeError);
		});

		it('throws TypeError for invalid complex entries', () => {
			assert.throws(() => tensorProductComplexIterative([null], [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([1], [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([{ re: 1 }], [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([{ re: '1', im: 0 }], [c(1)]), TypeError);
			assert.throws(() => tensorProductComplexIterative([[c(1)]], [[{ re: 1, im: null }]]), TypeError);
		});

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => tensorProductComplexIterative([c(NaN, 0)], [c(1)]), RangeError);
			assert.throws(() => tensorProductComplexIterative([c(1)], [c(0, Infinity)]), RangeError);
			assert.throws(() => tensorProductComplexIterative([[c(-Infinity, 1)]], [[c(1)]]), RangeError);
		});

		it('throws RangeError for ragged 2D matrices', () => {
			const ragged = [[c(1), c(2)], [c(3)]];
			assert.throws(() => tensorProductComplexIterative(ragged, [[c(1)]]), RangeError);
			assert.throws(() => tensorProductComplexIterative([[c(1)]], ragged), RangeError);
		});

		it('throws TypeError for mixed row/scalar entries inside one operand', () => {
			assert.throws(() => tensorProductComplexIterative([[c(1)], c(2)], [[c(1)]]), TypeError);
			assert.throws(() => tensorProductComplexIterative([c(1), [c(2)]], [c(1)]), TypeError);
		});

		it('throws TypeError for rank mismatch between 1D vector and 2D matrix', () => {
			assert.throws(() => tensorProductComplexIterative([c(1)], [[c(1)]]), TypeError);
			assert.throws(() => tensorProductComplexIterative([[c(1)]], [c(1)]), TypeError);
		});

		it('still validates the non-empty operand when the other operand is []', () => {
			assert.throws(() => tensorProductComplexIterative([], [c(NaN)]), RangeError);
			assert.throws(() => tensorProductComplexIterative(['bad'], []), TypeError);
		});
	});

	describe('mathematical cross-checks', () => {
		const A = [
			[c(1, -2), c(0.5, 1.5), c(-1, 0)],
			[c(2, 1), c(-0.5, -1), c(1, 2)],
		];
		const B = [
			[c(-1, 1), c(2, -0.5), c(0, 3)],
			[c(1.5, 0.5), c(1, 1), c(-2, 1)],
		];
		const C = [
			[c(2, 1), c(-1, 2)],
			[c(0, -1), c(1.5, 0.5)],
			[c(-0.5, 1), c(2, -1)],
		];
		const D = [
			[c(1, 0.5), c(-2, 1)],
			[c(0.5, -1.5), c(1, 1)],
		];

		it('satisfies bilinearity in both arguments (matrices and vectors)', () => {
			const alpha = c(1.5, -0.5);
			const beta = c(-2, 1);

			// (alpha*A + beta*B) ⊗ D == alpha*(A ⊗ D) + beta*(B ⊗ D)
			const lhsLeft = tensorProductComplexIterative(
				matAdd(matScale(alpha, A), matScale(beta, B)),
				D,
			);
			const rhsLeft = matAdd(
				matScale(alpha, tensorProductComplexIterative(A, D)),
				matScale(beta, tensorProductComplexIterative(B, D)),
			);
			assertMatrixClose(lhsLeft, rhsLeft);

			// D ⊗ (alpha*A + beta*B) == alpha*(D ⊗ A) + beta*(D ⊗ B)
			const lhsRight = tensorProductComplexIterative(
				D,
				matAdd(matScale(alpha, A), matScale(beta, B)),
			);
			const rhsRight = matAdd(
				matScale(alpha, tensorProductComplexIterative(D, A)),
				matScale(beta, tensorProductComplexIterative(D, B)),
			);
			assertMatrixClose(lhsRight, rhsRight);

			// Vector bilinearity
			const u1 = [c(1, 2), c(-1, 0.5)];
			const u2 = [c(0, -1), c(2, 1)];
			const v = [c(1, -1), c(0.5, 2), c(-1, 1)];
			const vecLhs = tensorProductComplexIterative(
				vecAdd(vecScale(alpha, u1), vecScale(beta, u2)),
				v,
			);
			const vecRhs = vecAdd(
				vecScale(alpha, tensorProductComplexIterative(u1, v)),
				vecScale(beta, tensorProductComplexIterative(u2, v)),
			);
			assertVectorClose(vecLhs, vecRhs);
		});

		it('satisfies associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)', () => {
			const lhs = tensorProductComplexIterative(tensorProductComplexIterative(A, D), C);
			const rhs = tensorProductComplexIterative(A, tensorProductComplexIterative(D, C));
			assertMatrixClose(lhs, rhs);

			const u = [c(1, -1), c(2, 0.5)];
			const v = [c(0, 2), c(-1, 1)];
			const w = [c(1, 1), c(-0.5, 2), c(3, -1)];
			assertVectorClose(
				tensorProductComplexIterative(tensorProductComplexIterative(u, v), w),
				tensorProductComplexIterative(u, tensorProductComplexIterative(v, w)),
			);
		});

		it('satisfies trace multiplicativity: tr(S1 ⊗ S2) = tr(S1) * tr(S2)', () => {
			const S1 = [
				[c(1, 2), c(-1, 0), c(2, -1)],
				[c(0, 3), c(-2, 1), c(1, 1)],
				[c(1, -1), c(0.5, 2), c(3, -2)],
			];
			const S2 = D;

			const kron = tensorProductComplexIterative(S1, S2);
			assertComplexClose(matTrace(kron), cMul(matTrace(S1), matTrace(S2)));
		});

		it('satisfies Frobenius and Euclidean norm multiplicativity', () => {
			const kron = tensorProductComplexIterative(A, C);
			assert.ok(
				Math.abs(matFrobeniusNorm(kron) - matFrobeniusNorm(A) * matFrobeniusNorm(C)) <= EPS,
			);

			const u = [c(1, -2), c(3, 1), c(-0.5, 2)];
			const v = [c(2, 1), c(-1, 3)];
			const uv = tensorProductComplexIterative(u, v);
			assert.ok(Math.abs(vecNorm(uv) - vecNorm(u) * vecNorm(v)) <= EPS);
		});

		it('satisfies the mixed-product identity: (A ⊗ D)(C ⊗ B) = (AC) ⊗ (DB)', () => {
			// A is 2x3, C is 3x2 => AC is 2x2
			// D is 2x2, B is 2x3 => DB is 2x3
			const lhs = matMul(
				tensorProductComplexIterative(A, D),
				tensorProductComplexIterative(C, B),
			);
			const rhs = tensorProductComplexIterative(matMul(A, C), matMul(D, B));
			assertMatrixClose(lhs, rhs);
		});

		it('satisfies matrix-vector compatibility: (A ⊗ D)(u ⊗ v) = (Au) ⊗ (Dv)', () => {
			const u = [c(1, -1), c(2, 0.5), c(-1, 2)];
			const v = [c(0.5, 1), c(-2, 1.5)];

			const lhs = matVecMul(
				tensorProductComplexIterative(A, D),
				tensorProductComplexIterative(u, v),
			);
			const rhs = tensorProductComplexIterative(matVecMul(A, u), matVecMul(D, v));
			assertVectorClose(lhs, rhs);
		});

		it('satisfies Hermitian adjoint identity: (A ⊗ C)† = A† ⊗ C†', () => {
			const lhs = matDagger(tensorProductComplexIterative(A, C));
			const rhs = tensorProductComplexIterative(matDagger(A), matDagger(C));
			assertMatrixClose(lhs, rhs);
		});
	});
});
