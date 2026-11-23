import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { traceTypedMemo } from './traceTypedMemo.js';

/**
 * Helper: build an n x n identity matrix as a Float64Array.
 * @param {number} n
 * @returns {Float64Array}
 */
function eye(n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		out[i * n + i] = 1;
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
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			out[c * n + r] = a[r * n + c];
		}
	}
	return out;
}

/**
 * Helper: multiply two n x n row-major Float64Array matrices.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} n
 * @returns {Float64Array}
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			let acc = 0;
			for (let k = 0; k < n; k++) {
				acc += a[r * n + k] * b[k * n + c];
			}
			out[r * n + c] = acc;
		}
	}
	return out;
}

/**
 * Helper: element-wise matrix addition a + b.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function matAdd(a, b) {
	const out = new Float64Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] + b[i];
	}
	return out;
}

/**
 * Helper: scalar multiplication c * a.
 * @param {number} c
 * @param {Float64Array} a
 * @returns {Float64Array}
 */
function matScale(c, a) {
	const out = new Float64Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = c * a[i];
	}
	return out;
}

describe('traceTypedMemo', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			const m = new Float64Array([42.5]);
			assert.equal(traceTypedMemo(m), 42.5);
			assert.equal(traceTypedMemo(m, 1), 42.5);
		});

		it('computes trace of a 2x2 matrix', () => {
			const m = new Float64Array([
				3, -7,
				2, 8.25,
			]);
			assert.equal(traceTypedMemo(m), 11.25);
			assert.equal(traceTypedMemo(m, 2), 11.25);
		});

		it('computes trace of a 3x3 matrix', () => {
			const m = new Float64Array([
				1, 2, 3,
				4, -5, 6,
				7, 8, 9,
			]);
			assert.equal(traceTypedMemo(m), 5);
			assert.equal(traceTypedMemo(m, 3), 5);
		});

		it('computes trace of a 4x4 matrix', () => {
			const m = new Float64Array([
				10, 1, 2, 3,
				4, -2.5, 5, 6,
				7, 8, 0.5, 9,
				11, 12, 13, 4,
			]);
			assert.equal(traceTypedMemo(m), 12);
			assert.equal(traceTypedMemo(m, 4), 12);
		});

		it('handles dimensions above the precomputed table threshold (e.g. 20x20)', () => {
			const n = 20;
			const m = new Float64Array(n * n);
			let expected = 0;
			for (let i = 0; i < n; i++) {
				m[i * n + i] = i + 1;
				expected += i + 1;
			}
			assert.equal(traceTypedMemo(m), expected);
			assert.equal(traceTypedMemo(m, n), expected);
		});
	});

	describe('edge cases', () => {
		it('returns 0 for zero matrices of various sizes', () => {
			for (const n of [1, 2, 3, 4, 16, 18]) {
				assert.equal(traceTypedMemo(new Float64Array(n * n)), 0);
				assert.equal(traceTypedMemo(new Float64Array(n * n), n), 0);
			}
		});

		it('returns n for n x n identity matrices', () => {
			for (const n of [1, 2, 3, 4, 10, 16, 25]) {
				assert.equal(traceTypedMemo(eye(n)), n);
				assert.equal(traceTypedMemo(eye(n), n), n);
			}
		});

		it('supports Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 99, 2, 10, 20, 5, 99]);
			const view = backing.subarray(2, 6);
			assert.equal(traceTypedMemo(view), 7);
		});

		it('preserves IEEE-754 special values (-0, Infinity, NaN)', () => {
			assert.equal(Object.is(traceTypedMemo(new Float64Array([-0])), -0), true);
			assert.equal(Object.is(traceTypedMemo(new Float64Array([0])), 0), true);
			assert.equal(traceTypedMemo(new Float64Array([Infinity, 0, 0, 1])), Infinity);
			assert.equal(Number.isNaN(traceTypedMemo(new Float64Array([NaN, 1, 2, 3]))), true);
		});

		it('throws TypeError for non-Float64Array matrix inputs', () => {
			const invalid = [
				null,
				undefined,
				[1, 2, 3, 4],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				new Uint8Array([1, 2, 3, 4]),
				'1234',
				42,
				{},
			];
			for (const input of invalid) {
				assert.throws(() => traceTypedMemo(input), TypeError);
			}
		});

		it('throws RangeError for empty or non-square matrices', () => {
			assert.throws(() => traceTypedMemo(new Float64Array(0)), RangeError);
			assert.throws(() => traceTypedMemo(new Float64Array([1, 2])), RangeError);
			assert.throws(() => traceTypedMemo(new Float64Array([1, 2, 3])), RangeError);
			assert.throws(() => traceTypedMemo(new Float64Array([1, 2, 3, 4, 5])), RangeError);
			assert.throws(() => traceTypedMemo(new Float64Array(6)), RangeError);
		});

		it('validates explicit dimension parameter n strictly', () => {
			const m2 = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => traceTypedMemo(m2, '2'), TypeError);
			assert.throws(() => traceTypedMemo(m2, null), TypeError);
			assert.throws(() => traceTypedMemo(m2, 0), RangeError);
			assert.throws(() => traceTypedMemo(m2, -2), RangeError);
			assert.throws(() => traceTypedMemo(m2, 2.5), RangeError);
			assert.throws(() => traceTypedMemo(m2, NaN), RangeError);
			assert.throws(() => traceTypedMemo(m2, Infinity), RangeError);
			assert.throws(() => traceTypedMemo(m2, 3), RangeError);
			assert.throws(() => traceTypedMemo(m2, 1), RangeError);
		});

		it('memoizes repeated calls accurately and stays safe under in-place mutation and eviction', () => {
			const a = new Float64Array([
				1.5, 9, 8,
				7, 2.5, 6,
				5, 4, 3.0,
			]);
			const b = new Float64Array([
				1.5, -1, -2,
				-3, 2.5, -4,
				-5, -6, 3.0,
			]);

			// Repeated identical call (cache hit) and distinct instance with identical diagonal
			assert.equal(traceTypedMemo(a), 7);
			assert.equal(traceTypedMemo(a), 7);
			assert.equal(traceTypedMemo(b), 7);

			// Mutate diagonal in place: must reflect updated value, not stale cache
			a[4] = 12.5;
			assert.equal(traceTypedMemo(a), 17);
			assert.equal(traceTypedMemo(a, 3), 17);

			// Fill beyond cache capacity (1024) to exercise LRU eviction cleanly
			for (let k = 0; k < 1100; k++) {
				const m = new Float64Array([k, 1, 2, k * 2]);
				assert.equal(traceTypedMemo(m), k * 3);
			}
			// Re-query after eviction
			assert.equal(traceTypedMemo(a), 17);
		});
	});

	describe('mathematical cross-checks', () => {
		it('satisfies linearity: tr(A + B) === tr(A) + tr(B) and tr(c * A) === c * tr(A)', () => {
			const a = new Float64Array([
				2, -3, 5,
				7, 11, -13,
				17, -19, 23,
			]);
			const b = new Float64Array([
				-4, 6, 1,
				2, -8, 9,
				-3, 5, 12,
			]);

			assert.equal(
				traceTypedMemo(matAdd(a, b)),
				traceTypedMemo(a) + traceTypedMemo(b),
			);

			const scalar = -3.5;
			assert.equal(
				traceTypedMemo(matScale(scalar, a)),
				scalar * traceTypedMemo(a),
			);
		});

		it('satisfies transpose invariance: tr(A^T) === tr(A)', () => {
			const a = new Float64Array([
				1.25, 2, 3, 4,
				5, -6.5, 7, 8,
				9, 10, 11.75, 12,
				13, 14, 15, -16,
			]);
			assert.equal(traceTypedMemo(transpose(a, 4)), traceTypedMemo(a));
		});

		it('satisfies cyclic property: tr(AB) === tr(BA) for non-commuting matrices', () => {
			const a = new Float64Array([
				1, 2, 3,
				0, -4, 5,
				6, 7, -8,
			]);
			const b = new Float64Array([
				9, -1, 2,
				3, 4, -5,
				-6, 7, 8,
			]);

			const ab = matMul(a, b, 3);
			const ba = matMul(b, a, 3);

			// Verify A and B do not commute, making the cyclic trace check non-trivial
			assert.notDeepEqual(ab, ba);
			assert.equal(traceTypedMemo(ab), traceTypedMemo(ba));
		});
	});
});
