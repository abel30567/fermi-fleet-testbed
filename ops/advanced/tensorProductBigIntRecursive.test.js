import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductBigIntRecursive } from './tensorProductBigIntRecursive.js';

/**
 * Independent helper: sums all BigInt leaves in a tensor.
 */
function sumTensor(t) {
	if (typeof t === 'bigint') return t;
	let total = 0n;
	for (const el of t) {
		total += sumTensor(el);
	}
	return total;
}

/**
 * Independent helper: extracts the shape of a rectangular tensor.
 */
function shapeOf(t) {
	const shape = [];
	let cur = t;
	while (Array.isArray(cur)) {
		shape.push(cur.length);
		cur = cur[0];
	}
	return shape;
}

/**
 * Independent helper: element-wise addition of two identically shaped tensors.
 */
function addTensors(x, y) {
	if (typeof x === 'bigint' && typeof y === 'bigint') {
		return x + y;
	}
	assert.equal(x.length, y.length);
	return x.map((el, i) => addTensors(el, y[i]));
}

/**
 * Independent direct nested-loop reference for vector ⊗ vector.
 */
function directVectorOuter(u, v) {
	const res = [];
	for (let i = 0; i < u.length; i++) {
		const row = [];
		for (let j = 0; j < v.length; j++) {
			row.push(u[i] * v[j]);
		}
		res.push(row);
	}
	return res;
}

/**
 * Independent direct nested-loop reference for matrix ⊗ matrix -> rank-4 tensor.
 */
function directMatrixTensorProduct(A, B) {
	const res = [];
	for (let i = 0; i < A.length; i++) {
		const sliceI = [];
		for (let j = 0; j < A[i].length; j++) {
			const block = [];
			for (let k = 0; k < B.length; k++) {
				const row = [];
				for (let l = 0; l < B[k].length; l++) {
					row.push(A[i][j] * B[k][l]);
				}
				block.push(row);
			}
			sliceI.push(block);
		}
		res.push(sliceI);
	}
	return res;
}

/**
 * Independent iterative flat-index reference for arbitrary-rank tensor product.
 */
function directGeneralTensorProduct(a, b) {
	const flatten = (t) => {
		if (typeof t === 'bigint') return [t];
		const out = [];
		const stack = [t];
		while (stack.length > 0) {
			const cur = stack.pop();
			if (typeof cur === 'bigint') {
				out.push(cur);
			} else {
				for (let i = cur.length - 1; i >= 0; i--) {
					stack.push(cur[i]);
				}
			}
		}
		return out;
	};

	const shapeA = shapeOf(a);
	const shapeB = shapeOf(b);
	const flatA = flatten(a);
	const flatB = flatten(b);
	const flatOut = [];
	for (let i = 0; i < flatA.length; i++) {
		for (let j = 0; j < flatB.length; j++) {
			flatOut.push(flatA[i] * flatB[j]);
		}
	}

	const outShape = [...shapeA, ...shapeB];
	if (outShape.length === 0) return flatOut[0];

	let cursor = 0;
	const reshape = (dim) => {
		const size = outShape[dim];
		const arr = new Array(size);
		if (dim === outShape.length - 1) {
			for (let i = 0; i < size; i++) {
				arr[i] = flatOut[cursor++];
			}
		} else {
			for (let i = 0; i < size; i++) {
				arr[i] = reshape(dim + 1);
			}
		}
		return arr;
	};
	return reshape(0);
}

describe('tensorProductBigIntRecursive', () => {
	describe('normal cases', () => {
		it('computes outer product of 1D vectors', () => {
			const u = [1n, 2n, 3n];
			const v = [4n, 5n];
			assert.deepEqual(tensorProductBigIntRecursive(u, v), [
				[4n, 5n],
				[8n, 10n],
				[12n, 15n],
			]);
		});

		it('computes rank-4 tensor product of 2D matrices', () => {
			const A = [
				[1n, 2n],
				[3n, 4n],
			];
			const B = [
				[5n, 6n, 7n],
				[8n, 9n, 10n],
			];
			const result = tensorProductBigIntRecursive(A, B);
			assert.deepEqual(shapeOf(result), [2, 2, 2, 3]);
			assert.deepEqual(result, [
				[
					[
						[5n, 6n, 7n],
						[8n, 9n, 10n],
					],
					[
						[10n, 12n, 14n],
						[16n, 18n, 20n],
					],
				],
				[
					[
						[15n, 18n, 21n],
						[24n, 27n, 30n],
					],
					[
						[20n, 24n, 28n],
						[32n, 36n, 40n],
					],
				],
			]);
		});

		it('computes mixed-rank tensor products (1D ⊗ 2D, 2D ⊗ 1D, 3D ⊗ 1D)', () => {
			const vec = [2n, -3n, 5n];
			const mat = [
				[1n, 4n],
				[-2n, 7n],
			];

			const vecMat = tensorProductBigIntRecursive(vec, mat);
			assert.deepEqual(shapeOf(vecMat), [3, 2, 2]);
			assert.deepEqual(vecMat, [
				[
					[2n, 8n],
					[-4n, 14n],
				],
				[
					[-3n, -12n],
					[6n, -21n],
				],
				[
					[5n, 20n],
					[-10n, 35n],
				],
			]);

			const matVec = tensorProductBigIntRecursive(mat, vec);
			assert.deepEqual(shapeOf(matVec), [2, 2, 3]);
			assert.deepEqual(matVec, [
				[
					[2n, -3n, 5n],
					[8n, -12n, 20n],
				],
				[
					[-4n, 6n, -10n],
					[14n, -21n, 35n],
				],
			]);

			const rank3 = [
				[
					[1n, 2n],
					[3n, 4n],
				],
			];
			const rank4 = tensorProductBigIntRecursive(rank3, [10n, 20n, 30n]);
			assert.deepEqual(shapeOf(rank4), [1, 2, 2, 3]);
			assert.deepEqual(rank4, directGeneralTensorProduct(rank3, [10n, 20n, 30n]));
		});

		it('handles scalar ⊗ tensor and tensor ⊗ scalar without mutating inputs', () => {
			const mat = [
				[2n, -3n],
				[4n, 5n],
			];
			const leftScaled = tensorProductBigIntRecursive(10n, mat);
			const rightScaled = tensorProductBigIntRecursive(mat, 10n);

			assert.deepEqual(leftScaled, [
				[20n, -30n],
				[40n, 50n],
			]);
			assert.deepEqual(rightScaled, leftScaled);
			assert.notEqual(leftScaled, mat);
			assert.notEqual(leftScaled[0], mat[0]);
			assert.deepEqual(mat, [
				[2n, -3n],
				[4n, 5n],
			]);
		});
	});

	describe('edge cases', () => {
		it('handles scalar ⊗ scalar including zero and negative values', () => {
			assert.equal(tensorProductBigIntRecursive(6n, 7n), 42n);
			assert.equal(tensorProductBigIntRecursive(-6n, 7n), -42n);
			assert.equal(tensorProductBigIntRecursive(-6n, -7n), 42n);
			assert.equal(tensorProductBigIntRecursive(0n, -999n), 0n);
			assert.equal(tensorProductBigIntRecursive(999n, 0n), 0n);
		});

		it('handles single-element tensors and odd/prime dimension lengths', () => {
			assert.deepEqual(tensorProductBigIntRecursive([7n], [[11n]]), [[[77n]]]);
			const u = [1n, -2n, 3n, -4n, 5n, -6n, 7n];
			const v = [11n, 13n, 17n, 19n, 23n];
			assert.deepEqual(tensorProductBigIntRecursive(u, v), directVectorOuter(u, v));
		});

		it('preserves exact precision for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = (1n << 256n) - 1n;
			const big2 = 10n ** 80n + 12345678901234567890123456789n;
			const negBig = -(10n ** 100n + 7n);

			const res = tensorProductBigIntRecursive([big1, negBig], [big2, -big1]);
			assert.deepEqual(res, [
				[big1 * big2, big1 * -big1],
				[negBig * big2, negBig * -big1],
			]);
			assert.equal(sumTensor(res), (big1 + negBig) * (big2 - big1));
		});

		it('throws RangeError for empty arrays', () => {
			assert.throws(() => tensorProductBigIntRecursive([], [1n]), RangeError);
			assert.throws(() => tensorProductBigIntRecursive([1n], []), RangeError);
			assert.throws(() => tensorProductBigIntRecursive([[]], [1n]), RangeError);
			assert.throws(() => tensorProductBigIntRecursive([[1n], []], [2n]), RangeError);
		});

		it('throws RangeError for ragged / non-rectangular arrays', () => {
			assert.throws(
				() => tensorProductBigIntRecursive([[1n, 2n], [3n]], [1n]),
				RangeError
			);
			assert.throws(
				() => tensorProductBigIntRecursive([1n], [[1n], [2n, 3n]]),
				RangeError
			);
			assert.throws(
				() => tensorProductBigIntRecursive([1n, [2n]], [3n]),
				RangeError
			);
			assert.throws(
				() =>
					tensorProductBigIntRecursive(
						[
							[
								[1n, 2n],
								[3n, 4n],
							],
							[[5n, 6n]],
						],
						[1n]
					),
				RangeError
			);
		});

		it('throws TypeError for non-BigInt values, sparse arrays, and circular references', () => {
			for (const bad of [
				1,
				3.14,
				NaN,
				Infinity,
				'1',
				true,
				null,
				undefined,
				{},
				[1n, 2],
				[[1n, '2']],
				[1n, null],
			]) {
				assert.throws(() => tensorProductBigIntRecursive(bad, [1n]), TypeError);
				assert.throws(() => tensorProductBigIntRecursive([1n], bad), TypeError);
			}

			// Sparse array with hole
			const sparse = new Array(3);
			sparse[0] = 1n;
			sparse[2] = 3n;
			assert.throws(() => tensorProductBigIntRecursive(sparse, [1n]), TypeError);

			// Circular array reference
			const cyclic = [];
			cyclic.push(cyclic);
			assert.throws(() => tensorProductBigIntRecursive(cyclic, [1n]), TypeError);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches independent direct nested-loop computation for larger matrices and higher ranks', () => {
			const A = [
				[1n, -2n, 3n, -4n],
				[5n, 0n, -7n, 8n],
				[-9n, 10n, 11n, -12n],
				[13n, -14n, 15n, 16n],
				[-17n, 18n, -19n, 20n],
			];
			const B = [
				[2n, -3n, 5n, -7n, 11n, -13n],
				[17n, 0n, -19n, 23n, -29n, 31n],
				[-37n, 41n, -43n, 47n, -53n, 59n],
			];

			const actual = tensorProductBigIntRecursive(A, B);
			const expected = directMatrixTensorProduct(A, B);
			assert.deepEqual(actual, expected);
			assert.deepEqual(shapeOf(actual), [5, 4, 3, 6]);

			const C = [
				[
					[1n, -2n, 3n],
					[4n, 5n, -6n],
				],
				[
					[-7n, 8n, 9n],
					[10n, -11n, 12n],
				],
			];
			const D = [
				[100n, -200n],
				[300n, 400n],
				[-500n, 600n],
			];
			assert.deepEqual(
				tensorProductBigIntRecursive(C, D),
				directGeneralTensorProduct(C, D)
			);
		});

		it('satisfies sum-of-entries identity: sum(A ⊗ B) === sum(A) * sum(B)', () => {
			const pairs = [
				[12345678901234567890n, -9876543210987654321n],
				[
					[1n, -2n, 3n, -4n, 5n],
					[10n, 20n, -30n, 40n],
				],
				[
					[
						[3n, -7n, 11n],
						[-13n, 17n, -19n],
					],
					[
						[23n, -29n],
						[31n, -37n],
						[41n, 43n],
					],
				],
				[
					[
						[
							[1n << 100n, -(1n << 99n)],
							[3n, -5n],
						],
						[
							[7n, 11n],
							[-(1n << 101n), 13n],
						],
					],
					[10n ** 40n, -(10n ** 39n), 17n],
				],
			];

			for (const [A, B] of pairs) {
				const prod = tensorProductBigIntRecursive(A, B);
				assert.equal(sumTensor(prod), sumTensor(A) * sumTensor(B));
			}
		});

		it('satisfies bilinearity (additivity in both arguments and scalar homogeneity)', () => {
			const A1 = [
				[1n, -2n, 3n],
				[4n, 5n, -6n],
			];
			const A2 = [
				[-7n, 8n, -9n],
				[10n, -11n, 12n],
			];
			const B1 = [
				[2n, 3n],
				[-5n, 7n],
			];
			const B2 = [
				[11n, -13n],
				[17n, -19n],
			];

			// (A1 + A2) ⊗ B1 === (A1 ⊗ B1) + (A2 ⊗ B1)
			assert.deepEqual(
				tensorProductBigIntRecursive(addTensors(A1, A2), B1),
				addTensors(
					tensorProductBigIntRecursive(A1, B1),
					tensorProductBigIntRecursive(A2, B1)
				)
			);

			// A1 ⊗ (B1 + B2) === (A1 ⊗ B1) + (A1 ⊗ B2)
			assert.deepEqual(
				tensorProductBigIntRecursive(A1, addTensors(B1, B2)),
				addTensors(
					tensorProductBigIntRecursive(A1, B1),
					tensorProductBigIntRecursive(A1, B2)
				)
			);

			// (k * A1) ⊗ B1 === A1 ⊗ (k * B1) === k * (A1 ⊗ B1)
			const k = -1000000000000000000000007n;
			const kA1 = tensorProductBigIntRecursive(k, A1);
			const kB1 = tensorProductBigIntRecursive(k, B1);
			const kProd = tensorProductBigIntRecursive(
				k,
				tensorProductBigIntRecursive(A1, B1)
			);
			assert.deepEqual(tensorProductBigIntRecursive(kA1, B1), kProd);
			assert.deepEqual(tensorProductBigIntRecursive(A1, kB1), kProd);
		});

		it('satisfies associativity: (A ⊗ B) ⊗ C === A ⊗ (B ⊗ C)', () => {
			const A = [2n, -3n, 5n];
			const B = [
				[7n, -11n],
				[13n, 17n],
			];
			const C = [-19n, 23n, -29n, 31n];

			const left = tensorProductBigIntRecursive(
				tensorProductBigIntRecursive(A, B),
				C
			);
			const right = tensorProductBigIntRecursive(
				A,
				tensorProductBigIntRecursive(B, C)
			);
			assert.deepEqual(left, right);
			assert.deepEqual(shapeOf(left), [3, 2, 2, 4]);
		});
	});
});
