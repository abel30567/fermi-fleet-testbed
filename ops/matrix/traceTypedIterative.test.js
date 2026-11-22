import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceTypedIterative } from './traceTypedIterative.js';

/**
 * Helper: naive row-major n×n matrix multiplication C = A * B.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = 0;
			for (let k = 0; k < n; k++) {
				acc += a[i * n + k] * b[k * n + j];
			}
			out[i * n + j] = acc;
		}
	}
	return out;
}

/**
 * Helper: row-major n×n matrix transpose.
 */
function transpose(a, n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			out[j * n + i] = a[i * n + j];
		}
	}
	return out;
}

/**
 * Helper: linear combination alpha * A + beta * B.
 */
function linearCombine(alpha, a, beta, b) {
	const out = new Float64Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = alpha * a[i] + beta * b[i];
	}
	return out;
}

/**
 * Helper: assert two floating-point numbers are within tolerance.
 */
function assertClose(actual, expected, eps = 1e-11) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`
	);
}

describe('traceTypedIterative', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			const m = new Float64Array([42.5]);
			assert.equal(traceTypedIterative(m), 42.5);
			assert.equal(traceTypedIterative(m, 1), 42.5);
		});

		it('computes trace of a 2x2 matrix ignoring off-diagonal elements', () => {
			const m = new Float64Array([
				3, 99,
				-77, 5,
			]);
			assert.equal(traceTypedIterative(m), 8);
			assert.equal(traceTypedIterative(m, 2), 8);
		});

		it('computes trace of a 3x3 matrix with mixed signed and fractional entries', () => {
			const m = new Float64Array([
				1.5, 2, 3,
				4, -0.25, 6,
				7, 8, 2.75,
			]);
			assertClose(traceTypedIterative(m), 4.0, 1e-15);
			assertClose(traceTypedIterative(m, 3), 4.0, 1e-15);
		});

		it('returns n for an n×n identity matrix', () => {
			for (const n of [1, 2, 5, 12]) {
				const eye = new Float64Array(n * n);
				for (let i = 0; i < n; i++) {
					eye[i * n + i] = 1;
				}
				assert.equal(traceTypedIterative(eye), n);
				assert.equal(traceTypedIterative(eye, n), n);
			}
		});

		it('returns 0 for zero and traceless matrices', () => {
			assert.equal(traceTypedIterative(new Float64Array(16)), 0);

			// Skew-symmetric 3x3 matrix has zero diagonal
			const skew = new Float64Array([
				0, 5, -2,
				-5, 0, 9,
				2, -9, 0,
			]);
			assert.equal(traceTypedIterative(skew), 0);

			// Non-zero diagonal summing to 0
			const traceless = new Float64Array([
				7, 1, 2,
				3, -10, 4,
				5, 6, 3,
			]);
			assert.equal(traceTypedIterative(traceless), 0);
		});

		it('computes trace of a larger 50x50 matrix matching closed-form sum', () => {
			const n = 50;
			const m = new Float64Array(n * n);
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n; j++) {
					m[i * n + j] = i === j ? i + 1 : (i - j) * 0.5;
				}
			}
			const expected = (n * (n + 1)) / 2;
			assert.equal(traceTypedIterative(m), expected);
			assert.equal(traceTypedIterative(m, n), expected);
		});

		it('works correctly on a Float64Array subarray view with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 888, 10, 1, 2, 20, 777]);
			const view = backing.subarray(2, 6); // 2x2: [[10, 1], [2, 20]]
			assert.equal(traceTypedIterative(view), 30);
			assert.equal(traceTypedIterative(view, 2), 30);
		});

		it('does not mutate the input Float64Array', () => {
			const m = new Float64Array([1, 2, 3, 4]);
			const copy = new Float64Array(m);
			traceTypedIterative(m, 2);
			assert.deepEqual(m, copy);
		});
	});

	describe('edge cases and input validation', () => {
		it('returns 0 for an empty 0x0 Float64Array', () => {
			const empty = new Float64Array(0);
			assert.equal(traceTypedIterative(empty), 0);
			assert.equal(traceTypedIterative(empty, 0), 0);
		});

		it('handles negative zero entries cleanly', () => {
			const m = new Float64Array([-0]);
			const res = traceTypedIterative(m);
			assert.equal(Object.is(res, 0), true);
		});

		it('throws TypeError when matrix is not a Float64Array', () => {
			const invalidMatrices = [
				null,
				undefined,
				[1, 0, 0, 1],
				new Float32Array([1, 0, 0, 1]),
				new Int32Array([1, 0, 0, 1]),
				{ length: 4, 0: 1, 1: 0, 2: 0, 3: 1 },
				42,
				'1001',
			];
			for (const bad of invalidMatrices) {
				assert.throws(() => traceTypedIterative(bad), TypeError);
			}
		});

		it('throws TypeError when n is provided and is not a number', () => {
			const m = new Float64Array([1, 0, 0, 1]);
			for (const badN of ['2', null, {}, true, 2n]) {
				assert.throws(() => traceTypedIterative(m, badN), TypeError);
			}
		});

		it('throws RangeError when n is negative, non-integer, non-finite, or unsafe integer', () => {
			const m = new Float64Array([1, 0, 0, 1]);
			for (const badN of [-1, -2, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => traceTypedIterative(m, badN), RangeError);
			}
		});

		it('throws RangeError when matrix length is not a perfect square and n is omitted', () => {
			for (const len of [2, 3, 5, 6, 7, 8, 10]) {
				assert.throws(() => traceTypedIterative(new Float64Array(len)), RangeError);
			}
		});

		it('throws RangeError when matrix length does not match n * n', () => {
			assert.throws(() => traceTypedIterative(new Float64Array(4), 3), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array(9), 2), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array(0), 1), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array(4), 0), RangeError);
		});

		it('throws RangeError when matrix contains NaN, Infinity, or -Infinity', () => {
			// On diagonal
			assert.throws(() => traceTypedIterative(new Float64Array([NaN, 0, 0, 1])), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array([1, 0, 0, Infinity])), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array([-Infinity, 0, 0, 1])), RangeError);

			// Off diagonal
			assert.throws(() => traceTypedIterative(new Float64Array([1, NaN, 0, 2])), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array([1, 0, Infinity, 2])), RangeError);
			assert.throws(() => traceTypedIterative(new Float64Array([1, -Infinity, 0, 2])), RangeError);
		});
	});

	describe('mathematical cross-checks against independent computations', () => {
		const n = 3;
		const A = new Float64Array([
			2.5, -1.0, 4.2,
			0.5, 3.1, -2.3,
			-1.7, 0.8, 5.4,
		]);
		const B = new Float64Array([
			-0.9, 2.2, 1.1,
			3.4, 1.5, -0.6,
			2.0, -4.1, 0.7,
		]);
		const C = new Float64Array([
			1.2, 0.3, -2.5,
			-1.4, 2.8, 1.9,
			0.6, -0.7, 3.3,
		]);

		it('satisfies linearity: tr(a*A + b*B) = a*tr(A) + b*tr(B)', () => {
			const a = 2.75;
			const b = -1.5;
			const combined = linearCombine(a, A, b, B);
			const lhs = traceTypedIterative(combined, n);
			const rhs = a * traceTypedIterative(A, n) + b * traceTypedIterative(B, n);
			assertClose(lhs, rhs);
		});

		it('satisfies transpose invariance: tr(A^T) = tr(A)', () => {
			const AT = transpose(A, n);
			assertClose(traceTypedIterative(AT, n), traceTypedIterative(A, n), 1e-15);
		});

		it('satisfies cyclic invariance: tr(A*B) = tr(B*A) and tr(A*B*C) = tr(B*C*A) = tr(C*A*B)', () => {
			const AB = matMul(A, B, n);
			const BA = matMul(B, A, n);
			assertClose(traceTypedIterative(AB, n), traceTypedIterative(BA, n));

			const ABC = matMul(AB, C, n);
			const BCA = matMul(matMul(B, C, n), A, n);
			const CAB = matMul(matMul(C, A, n), B, n);
			const trABC = traceTypedIterative(ABC, n);
			assertClose(trABC, traceTypedIterative(BCA, n));
			assertClose(trABC, traceTypedIterative(CAB, n));
		});

		it('satisfies orthogonal similarity invariance: tr(Q * A * Q^T) = tr(A)', () => {
			const theta = 0.73;
			const c = Math.cos(theta);
			const s = Math.sin(theta);
			// 3D rotation matrix around z-axis
			const Q = new Float64Array([
				c, -s, 0,
				s, c, 0,
				0, 0, 1,
			]);
			const QT = transpose(Q, n);
			const similar = matMul(matMul(Q, A, n), QT, n);
			assertClose(traceTypedIterative(similar, n), traceTypedIterative(A, n));
		});

		it('satisfies Frobenius inner product identity: tr(A^T * B) = sum_{i,j} A[i,j] * B[i,j]', () => {
			const ATB = matMul(transpose(A, n), B, n);
			let directInnerProduct = 0;
			for (let k = 0; k < A.length; k++) {
				directInnerProduct += A[k] * B[k];
			}
			assertClose(traceTypedIterative(ATB, n), directInnerProduct);
		});

		it('equals the sum of eigenvalues for a symmetric 2x2 matrix', () => {
			const a = 4.2;
			const b = -1.7;
			const d = -0.8;
			const sym = new Float64Array([
				a, b,
				b, d,
			]);
			const disc = Math.sqrt((a - d) ** 2 + 4 * b * b);
			const lambda1 = (a + d + disc) / 2;
			const lambda2 = (a + d - disc) / 2;
			assertClose(traceTypedIterative(sym, 2), lambda1 + lambda2);
		});
	});
});
