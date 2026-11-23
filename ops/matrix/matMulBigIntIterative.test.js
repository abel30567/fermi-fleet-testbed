import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulBigIntIterative } from './matMulBigIntIterative.js';

function transpose(m) {
	const rows = m.length;
	const cols = m[0].length;
	const out = Array.from({ length: cols }, () => new Array(rows));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = m[i][j];
		}
	}
	return out;
}

function addMatrices(a, b) {
	return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

function makeIdentity(size) {
	return Array.from({ length: size }, (_, i) =>
		Array.from({ length: size }, (_, j) => (i === j ? 1n : 0n))
	);
}

describe('matMulBigIntIterative', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 matrices', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			];
			const b = [
				[5n, 6n],
				[7n, 8n],
			];
			assert.deepEqual(matMulBigIntIterative(a, b), [
				[19n, 22n],
				[43n, 50n],
			]);
		});

		it('multiplies rectangular matrices (2x3 * 3x2 and 3x2 * 2x4)', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			];
			const b = [
				[7n, 8n],
				[9n, 10n],
				[11n, 12n],
			];
			assert.deepEqual(matMulBigIntIterative(a, b), [
				[58n, 64n],
				[139n, 154n],
			]);

			const c = [
				[1n, 0n, -1n, 2n],
				[3n, 4n, 5n, -2n],
			];
			assert.deepEqual(matMulBigIntIterative(b, c), [
				[31n, 32n, 33n, -2n],
				[39n, 40n, 41n, -2n],
				[47n, 48n, 49n, -2n],
			]);
		});

		it('handles negative and mixed-sign entries accurately', () => {
			const a = [
				[-2n, 5n, -1n],
				[0n, -3n, 4n],
			];
			const b = [
				[6n, -2n],
				[-1n, 7n],
				[3n, -4n],
			];
			assert.deepEqual(matMulBigIntIterative(a, b), [
				[-20n, 43n],
				[15n, -37n],
			]);
		});

		it('preserves exact arbitrary-precision BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = (1n << 100n) + 1234567890123456789n;
			const big2 = (1n << 100n) - 9876543210987654321n;
			const a = [
				[big1, 1n],
				[0n, big2],
			];
			const b = [
				[big2, 1n],
				[1n, big1],
			];
			const expected = [
				[big1 * big2 + 1n, big1 + big1],
				[big2, big2 * big1],
			];
			assert.deepEqual(matMulBigIntIterative(a, b), expected);
		});
	});

	describe('edge cases', () => {
		it('multiplies 1x1 matrices', () => {
			assert.deepEqual(matMulBigIntIterative([[7n]], [[-9n]]), [[-63n]]);
			assert.deepEqual(matMulBigIntIterative([[0n]], [[123456789012345678901234567890n]]), [[0n]]);
		});

		it('computes dot product (1xN * Nx1 -> 1x1) and outer product (Mx1 * 1xN -> MxN)', () => {
			const rowVec = [[2n, -3n, 5n, 7n]];
			const colVec = [[11n], [13n], [17n], [19n]];
			// 2*11 - 3*13 + 5*17 + 7*19 = 22 - 39 + 85 + 133 = 201
			assert.deepEqual(matMulBigIntIterative(rowVec, colVec), [[201n]]);
			assert.deepEqual(matMulBigIntIterative(colVec, rowVec), [
				[22n, -33n, 55n, 77n],
				[26n, -39n, 65n, 91n],
				[34n, -51n, 85n, 119n],
				[38n, -57n, 95n, 133n],
			]);
		});

		it('satisfies left and right identity and zero matrix annihilation', () => {
			const a = [
				[10n, -20n, 30n],
				[40n, 50n, -60n],
			];
			assert.deepEqual(matMulBigIntIterative(makeIdentity(2), a), a);
			assert.deepEqual(matMulBigIntIterative(a, makeIdentity(3)), a);

			const zero3x2 = [
				[0n, 0n],
				[0n, 0n],
				[0n, 0n],
			];
			assert.deepEqual(matMulBigIntIterative(a, zero3x2), [
				[0n, 0n],
				[0n, 0n],
			]);
		});

		it('does not mutate input matrices', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			];
			const b = [
				[5n, 6n],
				[7n, 8n],
			];
			const aSnap = structuredClone(a);
			const bSnap = structuredClone(b);
			matMulBigIntIterative(a, b);
			assert.deepEqual(a, aSnap);
			assert.deepEqual(b, bSnap);
		});
	});

	describe('invalid inputs', () => {
		it('rejects non-array matrix arguments', () => {
			const valid = [[1n]];
			for (const bad of [null, undefined, 42, 42n, 'matrix', {}]) {
				assert.throws(() => matMulBigIntIterative(bad, valid), TypeError);
				assert.throws(() => matMulBigIntIterative(valid, bad), TypeError);
			}
		});

		it('rejects empty matrices and matrices with empty rows', () => {
			const valid = [[1n]];
			assert.throws(() => matMulBigIntIterative([], valid), RangeError);
			assert.throws(() => matMulBigIntIterative(valid, []), RangeError);
			assert.throws(() => matMulBigIntIterative([[]], valid), RangeError);
			assert.throws(() => matMulBigIntIterative(valid, [[]]), RangeError);
		});

		it('rejects 1D arrays and non-array rows', () => {
			const valid = [[1n]];
			assert.throws(() => matMulBigIntIterative([1n, 2n], valid), TypeError);
			assert.throws(() => matMulBigIntIterative(valid, [1n, 2n]), TypeError);
			assert.throws(() => matMulBigIntIterative([[1n], null], valid), TypeError);
		});

		it('rejects jagged matrices', () => {
			const valid = [
				[1n, 2n],
				[3n, 4n],
			];
			assert.throws(() => matMulBigIntIterative([[1n, 2n], [3n]], valid), RangeError);
			assert.throws(() => matMulBigIntIterative(valid, [[1n, 2n], [3n, 4n, 5n]]), RangeError);
		});

		it('rejects non-bigint elements including numbers, strings, and sparse holes', () => {
			const valid = [[1n]];
			assert.throws(() => matMulBigIntIterative([[1]], valid), TypeError);
			assert.throws(() => matMulBigIntIterative(valid, [['1']]), TypeError);
			assert.throws(() => matMulBigIntIterative([[null]], valid), TypeError);
			assert.throws(() => matMulBigIntIterative([[undefined]], valid), TypeError);
			assert.throws(() => matMulBigIntIterative([[Number.NaN]], valid), TypeError);

			const sparseRow = new Array(2);
			sparseRow[0] = 1n;
			assert.throws(() => matMulBigIntIterative([sparseRow], [[1n], [2n]]), TypeError);
		});

		it('rejects incompatible inner dimensions', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			];
			const b = [
				[1n, 2n],
				[3n, 4n],
			];
			assert.throws(() => matMulBigIntIterative(a, b), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('cross-checks against Fibonacci recurrence via Q-matrix exponentiation up to F(100)', () => {
			const Q = [
				[1n, 1n],
				[1n, 0n],
			];
			let power = makeIdentity(2);
			let fPrev = 0n;
			let fCurr = 1n;

			for (let n = 1; n <= 100; n++) {
				power = matMulBigIntIterative(power, Q);
				// Q^n = [[F(n+1), F(n)], [F(n), F(n-1)]]
				const fNext = fPrev + fCurr;
				assert.equal(power[0][1], fCurr, `F(${n}) mismatch`);
				assert.equal(power[1][0], fCurr, `F(${n}) symmetry mismatch`);
				assert.equal(power[1][1], fPrev, `F(${n - 1}) mismatch`);
				assert.equal(power[0][0], fNext, `F(${n + 1}) mismatch`);
				fPrev = fCurr;
				fCurr = fNext;
			}
			// Independent known constant check: F(100)
			assert.equal(power[0][1], 354224848179261915075n);
		});

		it('satisfies matrix algebra identities (associativity, distributivity, transpose)', () => {
			const a = [
				[12345678901234567890n, -9876543210987654321n, 42n],
				[-7n, 100000000000000000000n, -5555555555555555555n],
			];
			const b = [
				[3n, -11n, 29n, 1000000000000000000n],
				[-17n, 5n, -23n, -999999999999999999n],
				[31n, 13n, -7n, 123456789n],
			];
			const b2 = [
				[-4n, 8n, -15n, 16n],
				[23n, -42n, 108n, -1n],
				[0n, 7777777777777777777n, -333n, 99n],
			];
			const c = [
				[2n, -9n],
				[14n, 6n],
				[-3n, 8n],
				[5n, -12n],
			];

			// Associativity: (A * B) * C === A * (B * C)
			assert.deepEqual(
				matMulBigIntIterative(matMulBigIntIterative(a, b), c),
				matMulBigIntIterative(a, matMulBigIntIterative(b, c))
			);

			// Distributivity: A * (B + B2) === A * B + A * B2
			assert.deepEqual(
				matMulBigIntIterative(a, addMatrices(b, b2)),
				addMatrices(matMulBigIntIterative(a, b), matMulBigIntIterative(a, b2))
			);

			// Transpose property: (A * B)^T === B^T * A^T
			assert.deepEqual(
				transpose(matMulBigIntIterative(a, b)),
				matMulBigIntIterative(transpose(b), transpose(a))
			);
		});

		it('matches an independent transpose-dot-product reference across deterministic matrices', () => {
			function refMatMul(a, b) {
				const bt = transpose(b);
				return a.map((row) =>
					bt.map((col) => row.reduce((acc, v, idx) => acc + v * col[idx], 0n))
				);
			}

			let seed = 0x123456789abcdef1n;
			const nextBig = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				return seed - (1n << 63n);
			};

			const shapes = [
				[1, 1, 1],
				[3, 5, 2],
				[6, 4, 7],
				[8, 8, 8],
			];
			for (const [m, k, n] of shapes) {
				const a = Array.from({ length: m }, () => Array.from({ length: k }, nextBig));
				const b = Array.from({ length: k }, () => Array.from({ length: n }, nextBig));
				assert.deepEqual(matMulBigIntIterative(a, b), refMatMul(a, b));
			}
		});
	});
});
