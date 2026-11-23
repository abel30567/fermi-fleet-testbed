import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceTypedIterative } from './traceTypedIterative.js';

/**
 * Helper: multiply two n x n row-major Float64Array matrices.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} n
 * @returns {Float64Array}
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
 * Helper: transpose an n x n row-major Float64Array matrix.
 * @param {Float64Array} a
 * @param {number} n
 * @returns {Float64Array}
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
 * Deterministic LCG PRNG for reproducible tests.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0x100000000) * 20 - 10;
	};
}

describe('traceTypedIterative', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			assert.equal(traceTypedIterative(new Float64Array([42.5])), 42.5);
		});

		it('computes trace of a 2x2 matrix', () => {
			const m = new Float64Array([1, 2, 3, 4]);
			assert.equal(traceTypedIterative(m), 5);
		});

		it('computes trace of a 3x3 matrix with positive and negative values', () => {
			const m = new Float64Array([
				3.5, -1, 2,
				4, -2.25, 0,
				7, 8, 1.75,
			]);
			assert.equal(traceTypedIterative(m), 3.0);
		});

		it('computes trace of an n x n identity matrix', () => {
			const n = 5;
			const id = new Float64Array(n * n);
			for (let i = 0; i < n; i++) {
				id[i * n + i] = 1;
			}
			assert.equal(traceTypedIterative(id), n);
		});

		it('accepts an explicit matching size argument', () => {
			const m = new Float64Array([2, 9, 8, 5]);
			assert.equal(traceTypedIterative(m, 2), 7);
		});

		it('works on a subarray view of a larger Float64Array', () => {
			const backing = new Float64Array([99, 10, 1, 2, 20, 88]);
			const view = backing.subarray(1, 5);
			assert.equal(traceTypedIterative(view), 30);
		});
	});

	describe('edge cases', () => {
		it('returns 0 for an empty 0x0 matrix', () => {
			assert.equal(traceTypedIterative(new Float64Array(0)), 0);
			assert.equal(traceTypedIterative(new Float64Array(0), 0), 0);
		});

		it('returns 0 for an all-zero matrix', () => {
			assert.equal(traceTypedIterative(new Float64Array(16)), 0);
		});

		it('ignores off-diagonal NaN and Infinity values', () => {
			const m = new Float64Array([
				1.5, Number.NaN, Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY, 2.5, Number.NaN,
				Number.NaN, Number.POSITIVE_INFINITY, 3.0,
			]);
			assert.equal(traceTypedIterative(m), 7.0);
		});

		it('propagates NaN on the main diagonal', () => {
			const m = new Float64Array([1, 2, 3, Number.NaN]);
			assert.ok(Number.isNaN(traceTypedIterative(m)));
		});

		it('handles Infinity on the main diagonal', () => {
			const pos = new Float64Array([Number.POSITIVE_INFINITY, 0, 0, 5]);
			assert.equal(traceTypedIterative(pos), Number.POSITIVE_INFINITY);

			const cancel = new Float64Array([
				Number.POSITIVE_INFINITY, 0,
				0, Number.NEGATIVE_INFINITY,
			]);
			assert.ok(Number.isNaN(traceTypedIterative(cancel)));
		});

		it('handles large matrices without stack overflow', () => {
			const n = 200;
			const m = new Float64Array(n * n);
			for (let i = 0; i < n; i++) {
				m[i * n + i] = i + 1;
			}
			// Arithmetic series 1 + 2 + ... + n = n*(n+1)/2
			assert.equal(traceTypedIterative(m), (n * (n + 1)) / 2);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			for (const bad of [
				null,
				undefined,
				[1, 2, 3, 4],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				'1234',
				42,
				{},
			]) {
				assert.throws(() => traceTypedIterative(bad), TypeError);
			}
		});

		it('throws RangeError when matrix length is not a perfect square', () => {
			for (const len of [2, 3, 5, 6, 7, 8, 10]) {
				assert.throws(
					() => traceTypedIterative(new Float64Array(len)),
					RangeError,
				);
			}
		});

		it('throws RangeError for invalid or mismatched size argument', () => {
			const m = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => traceTypedIterative(m, 3), RangeError);
			assert.throws(() => traceTypedIterative(m, -2), RangeError);
			assert.throws(() => traceTypedIterative(m, 2.5), RangeError);
			assert.throws(() => traceTypedIterative(m, Number.NaN), RangeError);
			assert.throws(() => traceTypedIterative(m, Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => traceTypedIterative(m, '2'), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches an independent 2D array reconstruction reference across sizes 1..15', () => {
			const rand = makeRng(12345);
			for (let n = 1; n <= 15; n++) {
				const flat = new Float64Array(n * n);
				const rows = [];
				for (let r = 0; r < n; r++) {
					const row = [];
					for (let c = 0; c < n; c++) {
						const v = rand();
						flat[r * n + c] = v;
						row.push(v);
					}
					rows.push(row);
				}
				const expected = rows.reduce((acc, row, idx) => acc + row[idx], 0);
				const actual = traceTypedIterative(flat);
				assert.ok(
					Math.abs(actual - expected) <= 1e-12,
					`n=${n}: expected ${expected}, got ${actual}`,
				);
			}
		});

		it('satisfies algebraic identities: linearity, transpose invariance, and tr(AB) = tr(BA)', () => {
			const rand = makeRng(67890);
			const n = 6;
			const A = new Float64Array(n * n);
			const B = new Float64Array(n * n);
			for (let i = 0; i < n * n; i++) {
				A[i] = rand();
				B[i] = rand();
			}

			// Linearity: tr(alpha * A + beta * B) == alpha * tr(A) + beta * tr(B)
			const alpha = 2.75;
			const beta = -1.25;
			const combo = new Float64Array(n * n);
			for (let i = 0; i < n * n; i++) {
				combo[i] = alpha * A[i] + beta * B[i];
			}
			const lhsLinear = traceTypedIterative(combo);
			const rhsLinear = alpha * traceTypedIterative(A) + beta * traceTypedIterative(B);
			assert.ok(Math.abs(lhsLinear - rhsLinear) <= 1e-11);

			// Transpose invariance: tr(A^T) == tr(A)
			assert.equal(traceTypedIterative(transpose(A, n)), traceTypedIterative(A));

			// Cyclic property: tr(AB) == tr(BA)
			const trAB = traceTypedIterative(matMul(A, B, n));
			const trBA = traceTypedIterative(matMul(B, A, n));
			assert.ok(
				Math.abs(trAB - trBA) <= 1e-10,
				`tr(AB)=${trAB}, tr(BA)=${trBA}`,
			);
		});
	});
});
