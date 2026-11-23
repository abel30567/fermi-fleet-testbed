import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductTypedRecursive } from './tensorProductTypedRecursive.js';

/**
 * Independent iterative reference implementation of the row-major tensor product.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceTensorProduct(a, b) {
	const out = new Float64Array(a.length * b.length);
	for (let i = 0; i < a.length; i++) {
		const rowOffset = i * b.length;
		const ai = a[i];
		for (let j = 0; j < b.length; j++) {
			out[rowOffset + j] = ai * b[j];
		}
	}
	return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Asserts two Float64Arrays are element-wise close within tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [eps=1e-12]
 */
function assertCloseArray(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(actual[i]), Math.abs(expected[i]));
		assert.ok(
			diff <= eps * scale,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff}`
		);
	}
}

describe('tensorProductTypedRecursive', () => {
	describe('normal cases', () => {
		it('computes row-major tensor product of small integer Float64Arrays', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5]);
			const res = tensorProductTypedRecursive(a, b);

			assert.ok(res instanceof Float64Array);
			assert.deepEqual(res, new Float64Array([4, 5, 8, 10, 12, 15]));
		});

		it('handles negative and fractional floating-point values', () => {
			const a = new Float64Array([-1.5, 0.25, 2.0]);
			const b = new Float64Array([4.0, -2.0, 0.5]);
			const res = tensorProductTypedRecursive(a, b);

			assert.deepEqual(
				res,
				new Float64Array([-6, 3, -0.75, 1, -0.5, 0.125, 8, -4, 1])
			);
		});

		it('handles asymmetric rectangular dimensions (tall and wide)', () => {
			const a = new Float64Array([2, -3, 5, 7, 11]);
			const b = new Float64Array([0.5, -1]);
			const res = tensorProductTypedRecursive(a, b);

			assert.deepEqual(
				res,
				new Float64Array([1, -2, -1.5, 3, 2.5, -5, 3.5, -7, 5.5, -11])
			);

			const swapped = tensorProductTypedRecursive(b, a);
			assert.deepEqual(
				swapped,
				new Float64Array([1, -1.5, 2.5, 3.5, 5.5, -2, 3, -5, -7, -11])
			);
		});

		it('handles 1x1, 1xN, and Nx1 vectors', () => {
			assert.deepEqual(
				tensorProductTypedRecursive(new Float64Array([3.5]), new Float64Array([2])),
				new Float64Array([7])
			);
			assert.deepEqual(
				tensorProductTypedRecursive(new Float64Array([2]), new Float64Array([1, 2, 3, 4])),
				new Float64Array([2, 4, 6, 8])
			);
			assert.deepEqual(
				tensorProductTypedRecursive(new Float64Array([1, 2, 3, 4]), new Float64Array([2])),
				new Float64Array([2, 4, 6, 8])
			);
		});
	});

	describe('edge cases', () => {
		it('returns an empty Float64Array when either or both inputs are empty', () => {
			const empty = new Float64Array(0);
			const nonEmpty = new Float64Array([1, 2, 3]);

			const r1 = tensorProductTypedRecursive(empty, nonEmpty);
			const r2 = tensorProductTypedRecursive(nonEmpty, empty);
			const r3 = tensorProductTypedRecursive(empty, empty);

			for (const r of [r1, r2, r3]) {
				assert.ok(r instanceof Float64Array);
				assert.equal(r.length, 0);
			}
		});

		it('handles aliased input (a === b) without mutating inputs', () => {
			const a = new Float64Array([2, -4, 6]);
			const snapshot = new Float64Array(a);
			const res = tensorProductTypedRecursive(a, a);

			assert.deepEqual(a, snapshot);
			assert.deepEqual(
				res,
				new Float64Array([4, -8, 12, -8, 16, -24, 12, -24, 36])
			);
		});

		it('does not mutate distinct input Float64Arrays', () => {
			const a = new Float64Array([1.25, 2.5]);
			const b = new Float64Array([3.5, 4.75]);
			const aCopy = new Float64Array(a);
			const bCopy = new Float64Array(b);

			tensorProductTypedRecursive(a, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});

		it('works properly with subarray views having non-zero byteOffset', () => {
			const backing = new Float64Array([99, 1, 2, 3, 88, 10, 20, 77]);
			const a = backing.subarray(1, 4); // [1, 2, 3]
			const b = backing.subarray(5, 7); // [10, 20]

			const res = tensorProductTypedRecursive(a, b);
			assert.deepEqual(res, new Float64Array([10, 20, 20, 40, 30, 60]));
		});

		it('handles zeros and extreme finite magnitudes', () => {
			const a = new Float64Array([0, 1e-100, 1e100]);
			const b = new Float64Array([0, 1e100, 1e-100]);
			const res = tensorProductTypedRecursive(a, b);

			assert.deepEqual(
				res,
				new Float64Array([0, 0, 0, 0, 1, 1e-200, 0, 1e200, 1])
			);
		});

		it('handles larger arrays cleanly within O(log m + log n) recursion depth', () => {
			const a = new Float64Array(100);
			const b = new Float64Array(75);
			for (let i = 0; i < a.length; i++) a[i] = i - 50;
			for (let j = 0; j < b.length; j++) b[j] = (j + 1) * 0.5;

			const res = tensorProductTypedRecursive(a, b);
			const expected = referenceTensorProduct(a, b);
			assert.equal(res.length, 7500);
			assert.deepEqual(res, expected);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when arguments are missing, null, or non-Float64Array', () => {
			const valid = new Float64Array([1, 2]);
			const invalidInputs = [
				undefined,
				null,
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				42,
				'1,2',
				{ length: 2, 0: 1, 1: 2 },
			];

			for (const bad of invalidInputs) {
				assert.throws(
					() => tensorProductTypedRecursive(bad, valid),
					{ name: 'TypeError' }
				);
				assert.throws(
					() => tensorProductTypedRecursive(valid, bad),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws RangeError when either input contains NaN or Infinity', () => {
			const valid = new Float64Array([1, 2, 3]);
			const badArrays = [
				new Float64Array([NaN]),
				new Float64Array([1, 2, NaN, 4]),
				new Float64Array([Infinity, 1]),
				new Float64Array([1, -Infinity, 3]),
				new Float64Array([1, 2, 3, 4, 5, 6, 7, Infinity]),
			];

			for (const bad of badArrays) {
				assert.throws(
					() => tensorProductTypedRecursive(bad, valid),
					{ name: 'RangeError' }
				);
				assert.throws(
					() => tensorProductTypedRecursive(valid, bad),
					{ name: 'RangeError' }
				);
			}
		});

		it('rejects non-finite elements even when the other array is empty', () => {
			assert.throws(
				() => tensorProductTypedRecursive(new Float64Array([NaN]), new Float64Array(0)),
				{ name: 'RangeError' }
			);
			assert.throws(
				() => tensorProductTypedRecursive(new Float64Array(0), new Float64Array([Infinity])),
				{ name: 'RangeError' }
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches iterative reference across varied sizes and pseudo-random inputs', () => {
			const rng = makeRng(20261123);
			const sizes = [
				[1, 1],
				[2, 3],
				[3, 2],
				[7, 13],
				[16, 16],
				[17, 31],
				[64, 33],
			];

			for (const [m, n] of sizes) {
				const a = new Float64Array(m);
				const b = new Float64Array(n);
				for (let i = 0; i < m; i++) a[i] = (rng() - 0.5) * 20;
				for (let j = 0; j < n; j++) b[j] = (rng() - 0.5) * 20;

				const actual = tensorProductTypedRecursive(a, b);
				const expected = referenceTensorProduct(a, b);
				assert.deepEqual(actual, expected);
			}
		});

		it('satisfies bilinearity, norm multiplicativity, sum factorization, and associativity', () => {
			const rng = makeRng(987654321);
			const randVec = (len) => {
				const v = new Float64Array(len);
				for (let i = 0; i < len; i++) v[i] = (rng() - 0.5) * 10;
				return v;
			};

			const a1 = randVec(9);
			const a2 = randVec(9);
			const b = randVec(7);
			const c = randVec(5);
			const alpha = -2.75;

			// 1. Additivity in first argument: (a1 + a2) ⊗ b === (a1 ⊗ b) + (a2 ⊗ b)
			const aSum = new Float64Array(a1.length);
			for (let i = 0; i < a1.length; i++) aSum[i] = a1[i] + a2[i];
			const lhsAdd = tensorProductTypedRecursive(aSum, b);
			const p1 = tensorProductTypedRecursive(a1, b);
			const p2 = tensorProductTypedRecursive(a2, b);
			const rhsAdd = new Float64Array(p1.length);
			for (let i = 0; i < p1.length; i++) rhsAdd[i] = p1[i] + p2[i];
			assertCloseArray(lhsAdd, rhsAdd);

			// 2. Scalar homogeneity: (alpha * a1) ⊗ b === a1 ⊗ (alpha * b) === alpha * (a1 ⊗ b)
			const scaledA = a1.map((x) => x * alpha);
			const scaledB = b.map((x) => x * alpha);
			const scaledP = p1.map((x) => x * alpha);
			assertCloseArray(tensorProductTypedRecursive(scaledA, b), scaledP);
			assertCloseArray(tensorProductTypedRecursive(a1, scaledB), scaledP);

			// 3. L2 norm multiplicativity: ||a1 ⊗ b||_2 === ||a1||_2 * ||b||_2
			const l2 = (v) => Math.hypot(...v);
			assert.ok(Math.abs(l2(p1) - l2(a1) * l2(b)) < 1e-11 * l2(a1) * l2(b));

			// 4. Sum factorization: sum(a1 ⊗ b) === sum(a1) * sum(b)
			const sum = (v) => v.reduce((acc, x) => acc + x, 0);
			const sumProd = sum(p1);
			const prodSums = sum(a1) * sum(b);
			assert.ok(Math.abs(sumProd - prodSums) < 1e-11 * Math.max(1, Math.abs(prodSums)));

			// 5. Associativity: (a1 ⊗ b) ⊗ c === a1 ⊗ (b ⊗ c)
			const leftAssoc = tensorProductTypedRecursive(
				tensorProductTypedRecursive(a1, b),
				c
			);
			const rightAssoc = tensorProductTypedRecursive(
				a1,
				tensorProductTypedRecursive(b, c)
			);
			assertCloseArray(leftAssoc, rightAssoc);

			// 6. Transpose / commutation relation: (b ⊗ a1)[j*m + i] === (a1 ⊗ b)[i*n + j]
			const comm = tensorProductTypedRecursive(b, a1);
			for (let i = 0; i < a1.length; i++) {
				for (let j = 0; j < b.length; j++) {
					assert.equal(comm[j * a1.length + i], p1[i * b.length + j]);
				}
			}
		});
	});
});
