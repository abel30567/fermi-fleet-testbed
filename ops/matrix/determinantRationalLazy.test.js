import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantRationalLazy } from './determinantRationalLazy.js';

/**
 * Helper to construct a Rational object.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) };
}

/**
 * Independent rational arithmetic helpers for cross-checks.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function normQ(num, den) {
	if (num === 0n) return { num: 0n, den: 1n };
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

function addQ(a, b) {
	return normQ(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subQ(a, b) {
	return normQ(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulQ(a, b) {
	return normQ(a.num * b.num, a.den * b.den);
}

/**
 * Independent Laplace (cofactor) expansion determinant for cross-checking.
 * @param {{ num: bigint, den: bigint }[][]} mat
 */
function detByCofactor(mat) {
	const n = mat.length;
	if (n === 1) return normQ(mat[0][0].num, mat[0][0].den);
	if (n === 2) {
		return subQ(mulQ(mat[0][0], mat[1][1]), mulQ(mat[0][1], mat[1][0]));
	}
	let total = { num: 0n, den: 1n };
	for (let col = 0; col < n; col += 1) {
		const entry = mat[0][col];
		if (entry.num === 0n) continue;
		const minor = [];
		for (let r = 1; r < n; r += 1) {
			const row = [];
			for (let c = 0; c < n; c += 1) {
				if (c !== col) row.push(mat[r][c]);
			}
			minor.push(row);
		}
		const term = mulQ(entry, detByCofactor(minor));
		total = col % 2 === 0 ? addQ(total, term) : subQ(total, term);
	}
	return total;
}

/**
 * Independent matrix multiplication for det(AB) = det(A)det(B) cross-check.
 */
function matMulQ(A, B) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = { num: 0n, den: 1n };
			for (let k = 0; k < n; k += 1) {
				sum = addQ(sum, mulQ(A[i][k], B[k][j]));
			}
			return sum;
		})
	);
}

function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	);
}

describe('determinantRationalLazy', () => {
	describe('1x1, 2x2, 3x3, and 4x4 matrices', () => {
		it('computes 1x1 determinants and normalizes output', () => {
			assert.deepEqual(determinantRationalLazy([[q(5, 3)]]), q(5, 3));
			assert.deepEqual(determinantRationalLazy([[q(-6, -4)]]), q(3, 2));
			assert.deepEqual(determinantRationalLazy([[q(6, -4)]]), q(-3, 2));
			assert.deepEqual(determinantRationalLazy([[q(0, -7)]]), q(0, 1));
		});

		it('computes 2x2 determinants over exact rationals and large BigInts', () => {
			const m1 = [
				[q(1, 2), q(1, 3)],
				[q(1, 4), q(1, 5)],
			];
			// 1/10 - 1/12 = 1/60
			assert.deepEqual(determinantRationalLazy(m1), q(1, 60));

			const big = 10n ** 30n;
			const m2 = [
				[{ num: big + 1n, den: 1n }, { num: big, den: 1n }],
				[{ num: big, den: 1n }, { num: big - 1n, den: 1n }],
			];
			// (big + 1)(big - 1) - big^2 = -1
			assert.deepEqual(determinantRationalLazy(m2), q(-1, 1));
		});

		it('computes 3x3 determinants accurately', () => {
			const m = [
				[q(2, 1), q(-1, 3), q(4, 5)],
				[q(1, 2), q(3, 4), q(-2, 1)],
				[q(-3, 7), q(5, 2), q(1, 6)],
			];
			assert.deepEqual(determinantRationalLazy(m), detByCofactor(m));
		});

		it('computes 4x4 Hilbert matrix determinant exactly', () => {
			const hilbert4 = Array.from({ length: 4 }, (_, i) =>
				Array.from({ length: 4 }, (_, j) => q(1, i + j + 1))
			);
			// Exact determinant of H_4 is 1 / 6048000
			assert.deepEqual(determinantRationalLazy(hilbert4), q(1, 6048000));
		});
	});

	describe('pivoting with zero diagonal', () => {
		it('handles anti-diagonal matrices with all-zero main diagonals', () => {
			const anti2 = [
				[q(0), q(3, 2)],
				[q(4, 5), q(0)],
			];
			assert.deepEqual(determinantRationalLazy(anti2), q(-6, 5));

			const anti3 = [
				[q(0), q(0), q(2, 3)],
				[q(0), q(3, 5), q(0)],
				[q(5, 7), q(0), q(0)],
			];
			// sign of reversal permutation of length 3 is (-1)^(3*2/2) = -1
			assert.deepEqual(determinantRationalLazy(anti3), q(-2, 7));

			const anti4 = [
				[q(0), q(0), q(0), q(2)],
				[q(0), q(0), q(3), q(0)],
				[q(0), q(5), q(0), q(0)],
				[q(7), q(0), q(0), q(0)],
			];
			// sign of reversal permutation of length 4 is (-1)^(4*3/2) = +1
			assert.deepEqual(determinantRationalLazy(anti4), q(210, 1));
		});

		it('handles cyclic shift permutation matrices (even and odd parity)', () => {
			const cycle3 = [
				[q(0), q(1), q(0)],
				[q(0), q(0), q(1)],
				[q(1), q(0), q(0)],
			];
			assert.deepEqual(determinantRationalLazy(cycle3), q(1, 1));

			const cycle4 = [
				[q(0), q(1), q(0), q(0)],
				[q(0), q(0), q(1), q(0)],
				[q(0), q(0), q(0), q(1)],
				[q(1), q(0), q(0), q(0)],
			];
			assert.deepEqual(determinantRationalLazy(cycle4), q(-1, 1));
		});

		it('handles zero diagonal emerging mid-elimination', () => {
			// Row 1 - Row 0 cancels the (1,1) entry to 0, forcing pivot column shift
			const m = [
				[q(1), q(2), q(3), q(4)],
				[q(1), q(2), q(5), q(7)],
				[q(0), q(3), q(1), q(2)],
				[q(2), q(1), q(0), q(1)],
			];
			assert.deepEqual(determinantRationalLazy(m), detByCofactor(m));
		});
	});

	describe('singular matrices', () => {
		it('returns { num: 0n, den: 1n } for zero rows, duplicate rows, and linear dependence', () => {
			const zeroFirstRow = [
				[q(0), q(0), q(0)],
				[q(1, 2), q(3, 4), q(5, 6)],
				[q(7, 8), q(9, 10), q(11, 12)],
			];
			assert.deepEqual(determinantRationalLazy(zeroFirstRow), q(0, 1));

			const duplicateRows = [
				[q(1, 3), q(2, 5), q(-7, 2)],
				[q(4, 1), q(-1, 2), q(3, 7)],
				[q(1, 3), q(2, 5), q(-7, 2)],
			];
			assert.deepEqual(determinantRationalLazy(duplicateRows), q(0, 1));

			// Row 3 = (1/2)*Row0 - (3/5)*Row1 + Row2
			const dependent4 = [
				[q(2), q(4), q(6), q(8)],
				[q(5), q(0), q(-10), q(15)],
				[q(1, 3), q(1, 2), q(1, 7), q(1, 11)],
				[
					q(1 - 3, 1), // wait: compute exact combo cleanly below
					q(0),
					q(0),
					q(0),
				],
			];
			dependent4[3] = dependent4[0].map((_, j) =>
				addQ(
					subQ(
						mulQ(q(1, 2), dependent4[0][j]),
						mulQ(q(3, 5), dependent4[1][j])
					),
					dependent4[2][j]
				)
			);
			assert.deepEqual(determinantRationalLazy(dependent4), q(0, 1));
		});

		it('still validates shape and entries after detecting singularity', () => {
			const singularNonSquare = [
				[q(0), q(0)],
				[q(1), q(2)],
				[q(3), q(4)],
			];
			assert.throws(() => determinantRationalLazy(singularNonSquare), RangeError);

			const singularRagged = [
				[q(0), q(0), q(0)],
				[q(1), q(2), q(3)],
				[q(4), q(5)],
			];
			assert.throws(() => determinantRationalLazy(singularRagged), RangeError);

			const singularBadDen = [
				[q(0), q(0)],
				[q(1), { num: 1n, den: 0n }],
			];
			assert.throws(() => determinantRationalLazy(singularBadDen), RangeError);
		});
	});

	describe('lazy iterable consumption', () => {
		it('consumes one-shot generators for both outer matrix and inner rows', () => {
			const data = [
				[q(3, 2), q(-1, 4), q(2, 3)],
				[q(0, 1), q(5, 6), q(-1, 2)],
				[q(1, 5), q(2, 7), q(4, 9)],
			];

			let rowsYielded = 0;
			let entriesYielded = 0;

			function* genRow(arr) {
				for (const item of arr) {
					entriesYielded += 1;
					yield item;
				}
			}

			function* genMatrix() {
				for (const row of data) {
					rowsYielded += 1;
					yield genRow(row);
				}
			}

			const result = determinantRationalLazy(genMatrix());
			assert.deepEqual(result, detByCofactor(data));
			assert.equal(rowsYielded, 3);
			assert.equal(entriesYielded, 9);
		});

		it('accepts custom non-array iterables and Sets without mutating inputs', () => {
			const r00 = q(4, -2);
			const r01 = q(3, 1);
			const r10 = q(1, 2);
			const r11 = q(5, 4);

			const customIterable = {
				*[Symbol.iterator]() {
					yield new Set([r00, r01]);
					yield new Map([
						['a', r10],
						['b', r11],
					]).values();
				},
			};

			// (-2)*(5/4) - (3)*(1/2) = -5/2 - 3/2 = -4
			assert.deepEqual(determinantRationalLazy(customIterable), q(-4, 1));
			// Ensure original input objects were not mutated
			assert.deepEqual(r00, { num: 4n, den: -2n });
		});

		it('stops lazily on infinite row/matrix iterables and runs generator cleanup', () => {
			let rowsPulled = 0;
			let outerClosed = false;

			function* infiniteRows() {
				try {
					while (true) {
						rowsPulled += 1;
						yield [q(1), q(2)];
					}
				} finally {
					outerClosed = true;
				}
			}

			assert.throws(() => determinantRationalLazy(infiniteRows()), RangeError);
			// Only 3 rows should be pulled for a 2-column matrix before failing fast
			assert.equal(rowsPulled, 3);
			assert.equal(outerClosed, true);

			let row1ItemsPulled = 0;
			let row1Closed = false;

			function* infiniteSecondRow() {
				try {
					while (true) {
						row1ItemsPulled += 1;
						yield q(1);
					}
				} finally {
					row1Closed = true;
				}
			}

			function* matrixWithInfiniteRow() {
				yield [q(1), q(2)];
				yield infiniteSecondRow();
			}

			assert.throws(
				() => determinantRationalLazy(matrixWithInfiniteRow()),
				RangeError
			);
			// Only 3 entries should be pulled from row 1 before detecting > 2 columns
			assert.equal(row1ItemsPulled, 3);
			assert.equal(row1Closed, true);
		});

		it('does not consume remaining rows after an early entry validation error', () => {
			let rowsPulled = 0;
			function* rowsWithEarlyError() {
				rowsPulled += 1;
				yield [q(1), { num: 1n, den: 0n }, q(3)];
				rowsPulled += 1;
				yield [q(4), q(5), q(6)];
			}

			assert.throws(
				() => determinantRationalLazy(rowsWithEarlyError()),
				RangeError
			);
			assert.equal(rowsPulled, 1);
		});
	});

	describe('strict input validation', () => {
		it('rejects non-iterable matrices and strings', () => {
			for (const bad of [null, undefined, 42, true, {}, '123', 10n]) {
				assert.throws(() => determinantRationalLazy(bad), TypeError);
			}
		});

		it('rejects empty matrices and empty rows', () => {
			assert.throws(() => determinantRationalLazy([]), RangeError);
			assert.throws(() => determinantRationalLazy([[]]), RangeError);
		});

		it('rejects non-square matrices', () => {
			assert.throws(
				() => determinantRationalLazy([[q(1), q(2)]]),
				RangeError
			);
			assert.throws(
				() => determinantRationalLazy([[q(1)], [q(2)]]),
				RangeError
			);
			assert.throws(
				() =>
					determinantRationalLazy([
						[q(1), q(2), q(3)],
						[q(4), q(5), q(6)],
					]),
				RangeError
			);
			assert.throws(
				() =>
					determinantRationalLazy([
						[q(1), q(2)],
						[q(3), q(4)],
						[q(5), q(6)],
					]),
				RangeError
			);
		});

		it('rejects ragged rows', () => {
			assert.throws(
				() =>
					determinantRationalLazy([
						[q(1), q(2)],
						[q(3)],
					]),
				RangeError
			);
			assert.throws(
				() =>
					determinantRationalLazy([
						[q(1), q(2)],
						[q(3), q(4), q(5)],
					]),
				RangeError
			);
		});

		it('rejects invalid row containers and malformed rational entries', () => {
			assert.throws(() => determinantRationalLazy([null]), TypeError);
			assert.throws(() => determinantRationalLazy(['ab']), TypeError);
			assert.throws(() => determinantRationalLazy([[123]]), TypeError);
			assert.throws(
				() => determinantRationalLazy([[{ num: 1, den: 2 }]]),
				TypeError
			);
			assert.throws(
				() => determinantRationalLazy([[{ num: 1n }]]),
				TypeError
			);
			assert.throws(
				() => determinantRationalLazy([[{ num: 1n, den: 0n }]]),
				RangeError
			);
			assert.throws(
				() => determinantRationalLazy([[{ num: 0n, den: 0n }]]),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches cofactor expansion across diverse 4x4 and 5x5 rational matrices', () => {
			const m4 = [
				[q(0, 1), q(2, 3), q(-1, 5), q(4, 7)],
				[q(3, 4), q(0, 1), q(5, 2), q(-1, 3)],
				[q(-2, 5), q(7, 6), q(0, 1), q(1, 2)],
				[q(1, 7), q(-3, 8), q(2, 9), q(5, 11)],
			];
			assert.deepEqual(determinantRationalLazy(m4), detByCofactor(m4));

			const m5 = [
				[q(0), q(1, 2), q(-1, 3), q(0), q(2, 5)],
				[q(3, 4), q(0), q(2, 7), q(-1, 2), q(0)],
				[q(0), q(-3, 5), q(1, 4), q(4, 3), q(-1, 7)],
				[q(2, 3), q(1, 6), q(0), q(-2, 5), q(3, 8)],
				[q(-1, 5), q(0), q(5, 6), q(1, 7), q(0)],
			];
			assert.deepEqual(determinantRationalLazy(m5), detByCofactor(m5));
		});

		it('satisfies det(A * B) = det(A) * det(B) and det(A^T) = det(A)', () => {
			const A = [
				[q(0, 1), q(3, 2), q(-1, 4), q(2, 5)],
				[q(1, 3), q(0, 1), q(4, 7), q(-3, 2)],
				[q(5, 6), q(-2, 3), q(1, 2), q(0, 1)],
				[q(-1, 5), q(2, 7), q(0, 1), q(3, 4)],
			];
			const B = [
				[q(2, 3), q(-1, 5), q(0, 1), q(4, 9)],
				[q(0, 1), q(5, 4), q(-2, 7), q(1, 3)],
				[q(3, 8), q(1, 2), q(0, 1), q(-5, 6)],
				[q(-4, 5), q(0, 1), q(7, 3), q(1, 2)],
			];

			const detA = determinantRationalLazy(A);
			const detB = determinantRationalLazy(B);
			const detAB = determinantRationalLazy(matMulQ(A, B));
			const detAT = determinantRationalLazy(transpose(A));

			assert.deepEqual(detAB, mulQ(detA, detB));
			assert.deepEqual(detAT, detA);
			// Cross-check detA against cofactor expansion as well
			assert.deepEqual(detA, detByCofactor(A));
		});

		it('satisfies row-swap negation and row-scaling linearity', () => {
			const A = [
				[q(1, 2), q(-2, 3), q(3, 4)],
				[q(4, 5), q(0, 1), q(-5, 6)],
				[q(-6, 7), q(7, 8), q(1, 9)],
			];
			const detA = determinantRationalLazy(A);

			const swapped = [A[2], A[1], A[0]];
			assert.deepEqual(
				determinantRationalLazy(swapped),
				normQ(-detA.num, detA.den)
			);

			const scalar = q(-7, 13);
			const scaled = [A[0], A[1].map((x) => mulQ(x, scalar)), A[2]];
			assert.deepEqual(determinantRationalLazy(scaled), mulQ(detA, scalar));
		});
	});
});
