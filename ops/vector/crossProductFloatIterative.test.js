import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductFloatIterative } from './crossProductFloatIterative.js';

/**
 * Independent helper: 3D dot product.
 * @param {number[]} u
 * @param {number[]} v
 * @returns {number}
 */
function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

/**
 * Independent helper: squared Euclidean norm.
 * @param {number[]} u
 * @returns {number}
 */
function normSq(u) {
	return dot(u, u);
}

/**
 * Asserts two 3D vectors are equal within a given absolute tolerance.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertVectorClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`Component ${i}: expected ${actual[i]} to be within ${eps} of ${expected[i]}`
		);
	}
}

describe('crossProductFloatIterative', () => {
	describe('normal cases', () => {
		it('computes right-handed basis vector products (i×j=k, j×k=i, k×i=j)', () => {
			const i = [1, 0, 0];
			const j = [0, 1, 0];
			const k = [0, 0, 1];

			assert.deepStrictEqual(crossProductFloatIterative(i, j), [0, 0, 1]);
			assert.deepStrictEqual(crossProductFloatIterative(j, k), [1, 0, 0]);
			assert.deepStrictEqual(crossProductFloatIterative(k, i), [0, 1, 0]);

			assert.deepStrictEqual(crossProductFloatIterative(j, i), [0, 0, -1]);
			assert.deepStrictEqual(crossProductFloatIterative(k, j), [-1, 0, 0]);
			assert.deepStrictEqual(crossProductFloatIterative(i, k), [0, -1, 0]);
		});

		it('computes general 3D vector cross products', () => {
			assert.deepStrictEqual(
				crossProductFloatIterative([2, 3, 4], [5, 6, 7]),
				[-3, 6, -3]
			);
			assert.deepStrictEqual(
				crossProductFloatIterative([1, 2, 3], [4, 5, 6]),
				[-3, 6, -3]
			);
			assertVectorClose(
				crossProductFloatIterative([1.5, -2.5, 3.25], [-4.0, 0.5, 2.0]),
				[-6.625, -16.0, -9.25]
			);
		});

		it('satisfies anti-commutativity: a × b === -(b × a)', () => {
			const pairs = [
				[[3, -4, 5], [1, 2, -6]],
				[[0.25, 7.5, -1.125], [-3.5, 2.0, 4.75]],
				[[100, -200, 300], [-10, 50, 25]],
			];
			for (const [a, b] of pairs) {
				const ab = crossProductFloatIterative(a, b);
				const ba = crossProductFloatIterative(b, a);
				assertVectorClose(ab, [-ba[0], -ba[1], -ba[2]], 0);
			}
		});

		it('returns the zero vector for parallel and anti-parallel vectors', () => {
			assertVectorClose(crossProductFloatIterative([1, 2, 3], [1, 2, 3]), [0, 0, 0], 0);
			assertVectorClose(crossProductFloatIterative([2, -4, 6], [4, -8, 12]), [0, 0, 0], 0);
			assertVectorClose(crossProductFloatIterative([3, 6, -9], [-1, -2, 3]), [0, 0, 0], 0);
		});

		it('does not mutate input arrays', () => {
			const a = [2, 3, 4];
			const b = [5, 6, 7];
			const result = crossProductFloatIterative(a, b);
			assert.deepStrictEqual(a, [2, 3, 4]);
			assert.deepStrictEqual(b, [5, 6, 7]);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
		});
	});

	describe('edge cases', () => {
		it('handles zero vectors', () => {
			const zero = [0, 0, 0];
			const v = [3.5, -7.2, 1.1];
			assertVectorClose(crossProductFloatIterative(zero, zero), [0, 0, 0], 0);
			assertVectorClose(crossProductFloatIterative(zero, v), [0, 0, 0], 0);
			assertVectorClose(crossProductFloatIterative(v, zero), [0, 0, 0], 0);
		});

		it('handles negative components', () => {
			assert.deepStrictEqual(
				crossProductFloatIterative([-2, -3, -4], [-5, -6, -7]),
				[-3, 6, -3]
			);
			assert.deepStrictEqual(
				crossProductFloatIterative([-1, 0, 0], [0, -1, 0]),
				[0, 0, 1]
			);
		});

		it('propagates NaN according to IEEE-754 semantics', () => {
			const res = crossProductFloatIterative([NaN, 1, 2], [3, 4, 5]);
			assert.equal(res[0], 1 * 5 - 2 * 4);
			assert.ok(Number.isNaN(res[1]));
			assert.ok(Number.isNaN(res[2]));

			const allNaN = crossProductFloatIterative([NaN, NaN, NaN], [1, 2, 3]);
			assert.ok(allNaN.every(Number.isNaN));
		});

		it('propagates Infinity and -Infinity according to IEEE-754 semantics', () => {
			// [Infinity, 0, 0] × [0, 1, 0] = [0*0 - 0*1, 0*0 - Inf*0, Inf*1 - 0*0] = [0, NaN, Infinity]
			const res = crossProductFloatIterative([Infinity, 0, 0], [0, 1, 0]);
			assert.equal(res[0], 0);
			assert.ok(Number.isNaN(res[1]));
			assert.equal(res[2], Infinity);

			// [-Infinity, 1, 2] × [3, 4, 5] = [1*5-2*4, 2*3-(-Inf)*5, (-Inf)*4-1*3] = [-3, Infinity, -Infinity]
			const res2 = crossProductFloatIterative([-Infinity, 1, 2], [3, 4, 5]);
			assert.equal(res2[0], -3);
			assert.equal(res2[1], Infinity);
			assert.equal(res2[2], -Infinity);
		});

		it('throws RangeError for wrong vector lengths', () => {
			const badLengths = [[], [1], [1, 2], [1, 2, 3, 4]];
			for (const bad of badLengths) {
				assert.throws(
					() => crossProductFloatIterative(bad, [1, 2, 3]),
					{ name: 'RangeError' }
				);
				assert.throws(
					() => crossProductFloatIterative([1, 2, 3], bad),
					{ name: 'RangeError' }
				);
			}
		});

		it('throws TypeError for non-array inputs', () => {
			const nonArrays = [
				null,
				undefined,
				42,
				'123',
				true,
				{ 0: 1, 1: 2, 2: 3, length: 3 },
				new Float64Array([1, 2, 3]),
			];
			for (const bad of nonArrays) {
				assert.throws(
					() => crossProductFloatIterative(bad, [1, 2, 3]),
					{ name: 'TypeError' }
				);
				assert.throws(
					() => crossProductFloatIterative([1, 2, 3], bad),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws TypeError for non-number elements and sparse arrays', () => {
			const sparse = new Array(3);
			sparse[0] = 1;
			sparse[2] = 3;

			const badVectors = [
				['1', 2, 3],
				[1, null, 3],
				[1, 2, undefined],
				[1, true, 3],
				[1n, 2, 3],
				[1, {}, 3],
				sparse,
			];
			for (const bad of badVectors) {
				assert.throws(
					() => crossProductFloatIterative(bad, [1, 2, 3]),
					{ name: 'TypeError' }
				);
				assert.throws(
					() => crossProductFloatIterative([1, 2, 3], bad),
					{ name: 'TypeError' }
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		const testVectors = [
			[[1, 2, 3], [4, 5, 6]],
			[[-3.5, 2.25, 7.125], [4.75, -1.5, 0.5]],
			[[Math.PI, Math.E, -Math.SQRT2], [Math.LN2, -Math.SQRT1_2, 1.6180339887]],
			[[1e-6, -2e-6, 3e-6], [4e6, 5e6, -6e6]],
			[[17, -23, 31], [-13, 19, -29]],
		];

		it('produces a vector orthogonal to both inputs: dot(a×b, a) ≈ 0 and dot(a×b, b) ≈ 0', () => {
			for (const [a, b] of testVectors) {
				const c = crossProductFloatIterative(a, b);
				const scale = Math.sqrt(normSq(a) * normSq(b)) || 1;
				assert.ok(
					Math.abs(dot(c, a)) <= 1e-12 * scale * Math.sqrt(normSq(a)),
					`Expected dot(a×b, a) ≈ 0, got ${dot(c, a)}`
				);
				assert.ok(
					Math.abs(dot(c, b)) <= 1e-12 * scale * Math.sqrt(normSq(b)),
					`Expected dot(a×b, b) ≈ 0, got ${dot(c, b)}`
				);
			}
		});

		it("satisfies Lagrange's identity: |a×b|² = |a|²|b|² - (a·b)²", () => {
			for (const [a, b] of testVectors) {
				const c = crossProductFloatIterative(a, b);
				const lhs = normSq(c);
				const abDot = dot(a, b);
				const rhs = normSq(a) * normSq(b) - abDot * abDot;
				const scale = Math.max(1, Math.abs(rhs));
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-12 * scale,
					`Lagrange identity mismatch: lhs=${lhs}, rhs=${rhs}`
				);
			}
		});

		it('satisfies the Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const a = [1.5, -2.3, 4.1];
			const b = [-0.7, 3.2, -1.8];
			const c = [2.9, 0.4, -3.6];

			const t1 = crossProductFloatIterative(a, crossProductFloatIterative(b, c));
			const t2 = crossProductFloatIterative(b, crossProductFloatIterative(c, a));
			const t3 = crossProductFloatIterative(c, crossProductFloatIterative(a, b));
			const sum = [t1[0] + t2[0] + t3[0], t1[1] + t2[1] + t3[1], t1[2] + t2[2] + t3[2]];

			assertVectorClose(sum, [0, 0, 0], 1e-12);
		});

		it('matches direct closed-form determinant expansion', () => {
			for (const [a, b] of testVectors) {
				const actual = crossProductFloatIterative(a, b);
				const direct = [
					a[1] * b[2] - a[2] * b[1],
					a[2] * b[0] - a[0] * b[2],
					a[0] * b[1] - a[1] * b[0],
				];
				assert.deepStrictEqual(actual, direct);
			}
		});
	});
});
