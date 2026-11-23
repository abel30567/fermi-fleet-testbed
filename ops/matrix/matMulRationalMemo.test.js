import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulRationalMemo } from './matMulRationalMemo.js';

/** Helper to construct a rational `{ num: bigint, den: bigint }`. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Helper to build a rational matrix from pairs `[num, den]` or integers. */
const mat = (rows) =>
	rows.map((row) =>
		row.map((cell) => (Array.isArray(cell) ? q(cell[0], cell[1]) : q(cell, 1n))),
	);

/** Helper to verify every rational cell is in lowest terms with den > 0n. */
function assertCanonicalMatrix(M) {
	const gcd = (a, b) => {
		let x = a < 0n ? -a : a;
		let y = b < 0n ? -b : b;
		while (y !== 0n) {
			[x, y] = [y, x % y];
		}
		return x;
	};
	for (const row of M) {
		for (const { num, den } of row) {
			assert.equal(typeof num, 'bigint');
			assert.equal(typeof den, 'bigint');
			assert.ok(den > 0n, `Expected positive denominator, got ${den}`);
			if (num === 0n) {
				assert.equal(den, 1n, `Zero rational must have den === 1n, got ${den}`);
			} else {
				assert.equal(gcd(num, den), 1n, `${num}/${den} is not in lowest terms`);
			}
		}
	}
}

describe('matMulRationalMemo', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 integer-valued rational matrices', () => {
			const A = mat([
				[1, 2],
				[3, 4],
			]);
			const B = mat([
				[5, 6],
				[7, 8],
			]);
			const expected = mat([
				[19, 22],
				[43, 50],
			]);
			const actual = matMulRationalMemo(A, B);
			assertCanonicalMatrix(actual);
			assert.deepEqual(actual, expected);
		});

		it('multiplies 2x2 fractional matrices and reduces to lowest terms', () => {
			const A = mat([
				[[1, 2], [2, 3]],
				[[-3, 4], [5, 6]],
			]);
			const B = mat([
				[[3, 5], [-1, 2]],
				[[3, 4], [2, 5]],
			]);
			// (0,0): 1/2*3/5 + 2/3*3/4 = 3/10 + 1/2 = 4/5
			// (0,1): 1/2*(-1/2) + 2/3*2/5 = -1/4 + 4/15 = 1/60
			// (1,0): -3/4*3/5 + 5/6*3/4 = -9/20 + 5/8 = 7/40
			// (1,1): -3/4*(-1/2) + 5/6*2/5 = 3/8 + 1/3 = 17/24
			const expected = mat([
				[[4, 5], [1, 60]],
				[[7, 40], [17, 24]],
			]);
			const actual = matMulRationalMemo(A, B);
			assertCanonicalMatrix(actual);
			assert.deepEqual(actual, expected);
		});

		it('multiplies rectangular matrices (2x3) * (3x2) -> (2x2)', () => {
			const A = mat([
				[[1, 2], [-1, 3], [2, 5]],
				[[3, 7], [0, 1], [-5, 6]],
			]);
			const B = mat([
				[[2, 1], [1, 4]],
				[[3, 2], [-3, 5]],
				[[5, 4], [1, 2]],
			]);
			// (0,0): 1 + (-1/2) + 1/2 = 1
			// (0,1): 1/8 + 1/5 + 1/5 = 21/40
			// (1,0): 6/7 + 0 - 25/24 = (144 - 175)/168 = -31/168
			// (1,1): 3/28 + 0 - 5/12 = (9 - 35)/84 = -26/84 = -13/42
			const expected = mat([
				[[1, 1], [21, 40]],
				[[-31, 168], [-13, 42]],
			]);
			const actual = matMulRationalMemo(A, B);
			assertCanonicalMatrix(actual);
			assert.deepEqual(actual, expected);
		});

		it('multiplies row vector (1x3) by column vector (3x1) and outer product (3x1)*(1x3)', () => {
			const row = mat([[[1, 2], [1, 3], [1, 6]]]);
			const col = mat([[[2, 1]], [[3, 1]], [[6, 1]]]);

			const inner = matMulRationalMemo(row, col);
			assertCanonicalMatrix(inner);
			assert.deepEqual(inner, mat([[3]]));

			const outer = matMulRationalMemo(col, row);
			assertCanonicalMatrix(outer);
			assert.deepEqual(
				outer,
				mat([
					[[1, 1], [2, 3], [1, 3]],
					[[3, 2], [1, 1], [1, 2]],
					[[3, 1], [2, 1], [1, 1]],
				]),
			);
		});

		it('normalizes unreduced inputs and negative denominators', () => {
			const A = mat([
				[[4, -6], [0, -9]],
				[[-6, -8], [10, 15]],
			]);
			const B = mat([
				[[-9, -12], [6, -9]],
				[[14, -21], [-5, -10]],
			]);
			// A = [[-2/3, 0], [3/4, 2/3]], B = [[3/4, -2/3], [-2/3, 1/2]]
			// (0,0): -1/2, (0,1): 4/9
			// (1,0): 9/16 - 4/9 = (81-64)/144 = 17/144
			// (1,1): -1/2 + 1/3 = -1/6
			const expected = mat([
				[[-1, 2], [4, 9]],
				[[17, 144], [-1, 6]],
			]);
			const actual = matMulRationalMemo(A, B);
			assertCanonicalMatrix(actual);
			assert.deepEqual(actual, expected);
		});

		it('preserves exact precision with large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 30n + 7n;
			const big2 = 10n ** 30n + 9n;
			const A = [[{ num: big1, den: 3n }, { num: 1n, den: big2 }]];
			const B = [[{ num: 3n, den: big1 }], [{ num: big2, den: 1n }]];
			const actual = matMulRationalMemo(A, B);
			assertCanonicalMatrix(actual);
			assert.deepEqual(actual, [[{ num: 2n, den: 1n }]]);
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 matrices', () => {
			assert.deepEqual(
				matMulRationalMemo(mat([[[-6, 9]]]), mat([[[15, 10]]])),
				mat([[[-1, 1]]]),
			);
			assert.deepEqual(
				matMulRationalMemo(mat([[[0, 7]]]), mat([[[99, 13]]])),
				mat([[[0, 1]]]),
			);
		});

		it('satisfies identity matrix laws A * I = A and I * A = A', () => {
			const I3 = mat([
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			]);
			const A = mat([
				[[1, 7], [-2, 3], [5, 11]],
				[[0, 1], [4, 9], [-1, 2]],
				[[8, 15], [-3, 4], [7, 13]],
			]);
			assert.deepEqual(matMulRationalMemo(A, I3), A);
			assert.deepEqual(matMulRationalMemo(I3, A), A);
		});

		it('satisfies zero matrix laws A * 0 = 0 and 0 * A = 0', () => {
			const A = mat([
				[[3, 5], [-7, 11], [2, 13]],
				[[5, 6], [1, 8], [-9, 10]],
			]);
			const Z32 = mat([
				[0, 0],
				[0, 0],
				[0, 0],
			]);
			const Z22 = mat([
				[0, 0],
				[0, 0],
			]);
			const Z33 = mat([
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0],
			]);
			const right = matMulRationalMemo(A, Z32);
			const left = matMulRationalMemo(Z32, A);
			assertCanonicalMatrix(right);
			assertCanonicalMatrix(left);
			assert.deepEqual(right, Z22);
			assert.deepEqual(left, Z33);
		});

		it('throws RangeError on dimension mismatch', () => {
			const A = mat([
				[1, 2, 3],
				[4, 5, 6],
			]);
			const B = mat([
				[1, 2],
				[3, 4],
			]);
			assert.throws(() => matMulRationalMemo(A, B), RangeError);
		});

		it('throws RangeError on jagged arrays', () => {
			const jaggedA = [
				[q(1), q(2)],
				[q(3)],
			];
			const validB = mat([
				[1, 0],
				[0, 1],
			]);
			assert.throws(() => matMulRationalMemo(jaggedA, validB), RangeError);
			assert.throws(() => matMulRationalMemo(validB, jaggedA), RangeError);
		});

		it('throws RangeError on empty matrices or empty rows', () => {
			const valid = mat([[1]]);
			assert.throws(() => matMulRationalMemo([], valid), RangeError);
			assert.throws(() => matMulRationalMemo(valid, []), RangeError);
			assert.throws(() => matMulRationalMemo([[]], valid), RangeError);
			assert.throws(() => matMulRationalMemo(valid, [[]]), RangeError);
		});

		it('throws TypeError or RangeError on invalid inputs', () => {
			const valid = mat([[1]]);
			assert.throws(() => matMulRationalMemo(null, valid), TypeError);
			assert.throws(() => matMulRationalMemo(valid, undefined), TypeError);
			assert.throws(() => matMulRationalMemo('not a matrix', valid), TypeError);
			assert.throws(() => matMulRationalMemo([123], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[null]], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[{ num: 1, den: 2n }]], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[{ num: 1n, den: 2 }]], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[{ num: 1n }]], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[[1n, 2n]]], valid), TypeError);
			assert.throws(() => matMulRationalMemo([[{ num: 1n, den: 0n }]], valid), RangeError);
			assert.throws(() => matMulRationalMemo(valid, [[{ num: 0n, den: 0n }]]), RangeError);
		});

		it('maintains memoization hit consistency and immutability across calls', () => {
			const A = mat([
				[[1, 2], [1, 3]],
				[[1, 4], [1, 5]],
			]);
			const B = mat([
				[[2, 3], [3, 4]],
				[[4, 5], [5, 6]],
			]);

			const first = matMulRationalMemo(A, B);
			const expectedCopy = structuredClone(first);

			// Mutate returned matrix aggressively; cached result must remain uncorrupted.
			first[0][0].num = 999999n;
			first[0][0].den = 7n;
			first[1] = [q(0), q(0)];

			// Second call with identical matrices (memoization hit)
			const second = matMulRationalMemo(A, B);
			assert.deepEqual(second, expectedCopy);
			assert.notEqual(second, first);

			// Call with semantically equivalent unreduced representations (canonical cache hit)
			const Aequiv = mat([
				[[2, 4], [-3, -9]],
				[[5, 20], [-2, -10]],
			]);
			const Bequiv = mat([
				[[-4, -6], [6, 8]],
				[[8, 10], [-10, -12]],
			]);
			const third = matMulRationalMemo(Aequiv, Bequiv);
			assert.deepEqual(third, expectedCopy);

			// Mutating input A in-place must NOT return a stale cached result
			A[0][0] = q(10, 1);
			const afterMutation = matMulRationalMemo(A, B);
			assert.notDeepEqual(afterMutation, expectedCopy);
			// (0,0) = 10*(2/3) + (1/3)*(4/5) = 20/3 + 4/15 = 104/15
			assert.deepEqual(afterMutation[0][0], q(104, 15));
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies associativity (A * B) * C === A * (B * C)', () => {
			const A = mat([
				[[1, 3], [-2, 5], [7, 11]],
				[[4, 9], [0, 1], [-5, 13]],
			]); // 2x3
			const B = mat([
				[[-3, 7], [2, 3], [1, 2], [-4, 5]],
				[[5, 6], [-1, 4], [3, 8], [7, 9]],
				[[2, 11], [9, 10], [-7, 12], [1, 6]],
			]); // 3x4
			const C = mat([
				[[3, 4], [-5, 8]],
				[[7, 12], [1, 3]],
				[[-2, 9], [4, 7]],
				[[5, 11], [-3, 10]],
			]); // 4x2

			const lhs = matMulRationalMemo(matMulRationalMemo(A, B), C);
			const rhs = matMulRationalMemo(A, matMulRationalMemo(B, C));
			assertCanonicalMatrix(lhs);
			assertCanonicalMatrix(rhs);
			assert.deepEqual(lhs, rhs);
		});

		it('matches independent floating-point matrix multiplication within epsilon', () => {
			const A = mat([
				[[1, 7], [-3, 11], [5, 13], [2, 9]],
				[[4, 5], [7, 8], [-1, 6], [3, 10]],
				[[-2, 3], [5, 12], [11, 14], [-7, 15]],
			]); // 3x4
			const B = mat([
				[[3, 4], [-5, 9], [1, 6]],
				[[7, 10], [2, 11], [-4, 7]],
				[[-1, 8], [9, 13], [5, 12]],
				[[6, 17], [-3, 5], [8, 9]],
			]); // 4x3

			const exact = matMulRationalMemo(A, B);
			assertCanonicalMatrix(exact);

			const toFloat = (M) => M.map((row) => row.map((c) => Number(c.num) / Number(c.den)));
			const Af = toFloat(A);
			const Bf = toFloat(B);

			for (let i = 0; i < Af.length; i++) {
				for (let j = 0; j < Bf[0].length; j++) {
					let sum = 0;
					for (let k = 0; k < Bf.length; k++) {
						sum += Af[i][k] * Bf[k][j];
					}
					const exactAsFloat = Number(exact[i][j].num) / Number(exact[i][j].den);
					assert.ok(
						Math.abs(exactAsFloat - sum) < 1e-12,
						`Mismatch at (${i},${j}): exact=${exactAsFloat}, float=${sum}`,
					);
				}
			}
		});

		it('recovers exact identity for 3x3 Hilbert matrix times its exact inverse', () => {
			const H3 = mat([
				[[1, 1], [1, 2], [1, 3]],
				[[1, 2], [1, 3], [1, 4]],
				[[1, 3], [1, 4], [1, 5]],
			]);
			const H3Inv = mat([
				[9, -36, 30],
				[-36, 192, -180],
				[30, -180, 180],
			]);
			const I3 = mat([
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			]);
			assert.deepEqual(matMulRationalMemo(H3, H3Inv), I3);
			assert.deepEqual(matMulRationalMemo(H3Inv, H3), I3);
		});
	});
});
