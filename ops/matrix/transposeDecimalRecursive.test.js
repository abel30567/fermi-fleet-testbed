import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeDecimalRecursive } from './transposeDecimalRecursive.js';

/**
 * Independent naive nested-loop transpose for cross-checking (assumes already normalized values).
 * @param {string[][]} matrix
 * @returns {string[][]}
 */
function naiveTranspose(matrix) {
	const rows = matrix.length;
	const cols = matrix[0].length;
	const out = Array.from({ length: cols }, () => new Array(rows));
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c][r] = matrix[r][c];
		}
	}
	return out;
}

describe('transposeDecimalRecursive', () => {
	describe('normal cases', () => {
		it('transposes a square matrix of integers and decimals', () => {
			const input = [
				['1', '2.5', '3'],
				['4.25', '5', '6.75'],
				['7', '8.125', '9']
			];
			const expected = [
				['1', '4.25', '7'],
				['2.5', '5', '8.125'],
				['3', '6.75', '9']
			];
			assert.deepEqual(transposeDecimalRecursive(input), expected);
		});

		it('transposes rectangular matrices (tall and wide)', () => {
			const wide = [
				['1', '2', '3', '4'],
				['5', '6', '7', '8']
			];
			assert.deepEqual(transposeDecimalRecursive(wide), [
				['1', '5'],
				['2', '6'],
				['3', '7'],
				['4', '8']
			]);

			const tall = [
				['10.1', '20.2'],
				['30.3', '40.4'],
				['50.5', '60.6'],
				['70.7', '80.8']
			];
			assert.deepEqual(transposeDecimalRecursive(tall), [
				['10.1', '30.3', '50.5', '70.7'],
				['20.2', '40.4', '60.6', '80.8']
			]);
		});

		it('handles negative values, explicit plus signs, leading/trailing zeros, and -0', () => {
			const input = [
				['-0.000', '+0042.500', '-.25'],
				['+0', '100.', '-0007.00']
			];
			assert.deepEqual(transposeDecimalRecursive(input), [
				['0', '0'],
				['42.5', '100'],
				['-0.25', '-7']
			]);
		});

		it('preserves arbitrary precision beyond IEEE-754 limits (> 25 digits)', () => {
			const highPrecA = '123456789012345678901234567890.098765432109876543210987654321';
			const highPrecB = '-99999999999999999999999999999.111111111111111111111111111119';
			const highPrecC = '0.00000000000000000000000000000123456789';
			const highPrecD = '31415926535897932384626433832795.028841971693993751058209749445';

			const input = [
				[highPrecA, highPrecB],
				[highPrecC, highPrecD]
			];

			const result = transposeDecimalRecursive(input, 40);
			assert.deepEqual(result, [
				[highPrecA, highPrecC],
				[highPrecB, highPrecD]
			]);
		});

		it('rounds values according to configurable precision (round half away from zero)', () => {
			const input = [
				['1.234', '1.235', '-1.235'],
				['1.999', '-0.004', '0.005']
			];

			assert.deepEqual(transposeDecimalRecursive(input, 2), [
				['1.23', '2'],
				['1.24', '0'],
				['-1.24', '0.01']
			]);

			assert.deepEqual(transposeDecimalRecursive(input, 0), [
				['1', '2'],
				['1', '0'],
				['-1', '0']
			]);

			// Default precision = 20 truncates/rounds 21st fractional digit
			const defaultPrecInput = [['0.123456789012345678905', '-0.123456789012345678904']];
			assert.deepEqual(transposeDecimalRecursive(defaultPrecInput), [
				['0.12345678901234567891'],
				['-0.1234567890123456789']
			]);
		});

		it('supports scientific notation and normalizes without precision loss', () => {
			const input = [
				['1.234567890123456789012345e-5', '-4.5e4'],
				['2.5E+2', '0e10']
			];
			assert.deepEqual(transposeDecimalRecursive(input, 30), [
				['0.00001234567890123456789012345', '250'],
				['-45000', '0']
			]);
		});

		it('does not mutate the input matrix', () => {
			const input = [
				['+1.00', '-2.50'],
				['03.00', '4.125']
			];
			const snapshot = structuredClone(input);
			transposeDecimalRecursive(input, 2);
			assert.deepEqual(input, snapshot);
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 matrix', () => {
			assert.deepEqual(transposeDecimalRecursive([['-42.12500']]), [['-42.125']]);
		});

		it('handles row vector (1xN) and column vector (Nx1)', () => {
			const rowVec = [['1.1', '-2.2', '3.3', '-4.4', '5.5']];
			const colVec = [['1.1'], ['-2.2'], ['3.3'], ['-4.4'], ['5.5']];

			assert.deepEqual(transposeDecimalRecursive(rowVec), colVec);
			assert.deepEqual(transposeDecimalRecursive(colVec), rowVec);
		});

		it('handles odd and prime dimensions (3x5, 5x7, 7x3)', () => {
			const makeMatrix = (rows, cols) =>
				Array.from({ length: rows }, (_, r) =>
					Array.from({ length: cols }, (_, c) => `${r * cols + c}.${r + 1}${c + 1}`)
				);

			for (const [rows, cols] of [
				[3, 5],
				[5, 7],
				[7, 3]
			]) {
				const mat = makeMatrix(rows, cols);
				const transposed = transposeDecimalRecursive(mat, 10);
				assert.equal(transposed.length, cols);
				assert.equal(transposed[0].length, rows);
				assert.deepEqual(transposed, naiveTranspose(mat));
			}
		});
	});

	describe('validation errors', () => {
		it('throws TypeError for non-array matrix or non-array rows', () => {
			assert.throws(() => transposeDecimalRecursive(null), TypeError);
			assert.throws(() => transposeDecimalRecursive('123'), TypeError);
			assert.throws(() => transposeDecimalRecursive([1, 2]), TypeError);
			assert.throws(() => transposeDecimalRecursive([['1'], 'not-a-row']), TypeError);
		});

		it('throws RangeError for empty or jagged matrices', () => {
			assert.throws(() => transposeDecimalRecursive([]), RangeError);
			assert.throws(() => transposeDecimalRecursive([[]]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['1', '2'], ['3']]), RangeError);
		});

		it('throws TypeError for non-string cells and RangeError for malformed decimal strings', () => {
			assert.throws(() => transposeDecimalRecursive([[1, '2']]), TypeError);
			assert.throws(() => transposeDecimalRecursive([[null]]), TypeError);
			assert.throws(() => transposeDecimalRecursive([[undefined]]), TypeError);

			assert.throws(() => transposeDecimalRecursive([['']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['   ']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['abc']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['NaN']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['Infinity']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['1.2.3']]), RangeError);
			assert.throws(() => transposeDecimalRecursive([['.']]), RangeError);
		});

		it('throws for invalid precision values', () => {
			assert.throws(() => transposeDecimalRecursive([['1']], '5'), TypeError);
			assert.throws(() => transposeDecimalRecursive([['1']], null), TypeError);
			assert.throws(() => transposeDecimalRecursive([['1']], -1), RangeError);
			assert.throws(() => transposeDecimalRecursive([['1']], 1.5), RangeError);
			assert.throws(() => transposeDecimalRecursive([['1']], NaN), RangeError);
			assert.throws(() => transposeDecimalRecursive([['1']], Infinity), RangeError);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches independent naive nested-loop transpose across a 17x23 high-precision matrix', () => {
			const rows = 17;
			const cols = 23;
			const matrix = Array.from({ length: rows }, (_, r) =>
				Array.from({ length: cols }, (_, c) => {
					const sign = (r + c) % 2 === 0 ? '' : '-';
					const whole = `${(r + 1) * 1000 + c}12345678901234567890`;
					const frac = `${String(r + 1).padStart(2, '0')}${String(c + 1).padStart(2, '0')}987654321098765432101`;
					return `${sign}${whole}.${frac}`;
				})
			);

			const recursiveResult = transposeDecimalRecursive(matrix, 30);
			const naiveResult = naiveTranspose(matrix);
			assert.deepEqual(recursiveResult, naiveResult);
		});

		it('satisfies double-transpose involution (A^T)^T = A', () => {
			const matrix = [
				['-123456789012345678901234567.89012345678901234567890123', '0', '42.5', '-0.000000000000000000000001'],
				['999999999999999999999999999.99999999999999999999999999', '-1', '3.14159265358979323846264338', '7'],
				['0.5', '-88888888888888888888888888', '1000000000000000000000000000', '-2.71828182845904523536028747']
			];

			const transposed = transposeDecimalRecursive(matrix, 30);
			const doubleTransposed = transposeDecimalRecursive(transposed, 30);

			assert.deepEqual(doubleTransposed, matrix);
			assert.deepEqual(transposed, naiveTranspose(matrix));
		});
	});
});
