import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeDecimalIterative } from './transposeDecimalIterative.js';

/**
 * Independent BigInt exact decimal helper for cross-checking mathematical identities
 * without sharing any implementation code with `transposeDecimalIterative`.
 */
function parseExactDecimal(str) {
	const negative = str.startsWith('-');
	const unsigned = negative ? str.slice(1) : str;
	const dot = unsigned.indexOf('.');
	if (dot === -1) {
		return { unscaled: BigInt(str), scale: 0 };
	}
	const digits = unsigned.slice(0, dot) + unsigned.slice(dot + 1);
	const scale = unsigned.length - dot - 1;
	const mag = BigInt(digits);
	return { unscaled: negative ? -mag : mag, scale };
}

function addExact(a, b) {
	const maxScale = Math.max(a.scale, b.scale);
	const aScaled = a.unscaled * 10n ** BigInt(maxScale - a.scale);
	const bScaled = b.unscaled * 10n ** BigInt(maxScale - b.scale);
	return { unscaled: aScaled + bScaled, scale: maxScale };
}

function mulExact(a, b) {
	return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale };
}

function equalExact(a, b) {
	const maxScale = Math.max(a.scale, b.scale);
	const aScaled = a.unscaled * 10n ** BigInt(maxScale - a.scale);
	const bScaled = b.unscaled * 10n ** BigInt(maxScale - b.scale);
	return aScaled === bScaled;
}

function matVecExact(matrix, vec) {
	return matrix.map((row) =>
		row.reduce(
			(acc, entry, j) => addExact(acc, mulExact(parseExactDecimal(entry), parseExactDecimal(vec[j]))),
			{ unscaled: 0n, scale: 0 },
		),
	);
}

function dotExact(u, v) {
	return u.reduce((acc, val, i) => addExact(acc, mulExact(val, v[i])), {
		unscaled: 0n,
		scale: 0,
	});
}

describe('transposeDecimalIterative', () => {
	describe('normal cases', () => {
		it('transposes a square 2x2 and 3x3 matrix', () => {
			const m2 = [
				['1.5', '-2.25'],
				['3.75', '4'],
			];
			assert.deepEqual(transposeDecimalIterative(m2), [
				['1.5', '3.75'],
				['-2.25', '4'],
			]);

			const m3 = [
				['1', '2', '3'],
				['4', '5', '6'],
				['7', '8', '9'],
			];
			assert.deepEqual(transposeDecimalIterative(m3), [
				['1', '4', '7'],
				['2', '5', '8'],
				['3', '6', '9'],
			]);
		});

		it('transposes rectangular matrices (2x3 -> 3x2 and 3x2 -> 2x3)', () => {
			const rect2x3 = [
				['1.1', '2.2', '3.3'],
				['-4.4', '5.5', '-6.6'],
			];
			const expected3x2 = [
				['1.1', '-4.4'],
				['2.2', '5.5'],
				['3.3', '-6.6'],
			];
			assert.deepEqual(transposeDecimalIterative(rect2x3), expected3x2);
			assert.deepEqual(transposeDecimalIterative(expected3x2), rect2x3);
		});

		it('preserves arbitrary high-precision entries beyond float64 (35-50+ digits)', () => {
			const pi40 = '3.1415926535897932384626433832795028841971';
			const e40 = '2.7182818284590452353602874713526624977572';
			const hugeIntFrac = '-987654321098765432109876543210.123456789012345678901234567890123456789';
			const tinyHighPrec = '0.0000000000000000000000000000001234567891';

			const m = [
				[pi40, hugeIntFrac],
				[e40, tinyHighPrec],
			];

			const t = transposeDecimalIterative(m, 50);
			assert.deepEqual(t, [
				[pi40, e40],
				[hugeIntFrac, tinyHighPrec],
			]);
		});

		it('rounds entries half away from zero to configurable precision', () => {
			const m = [
				['1.23456', '-1.23456', '9.9999'],
				['0.005', '-0.005', '123456789012345678901234567890.123456789012345678905'],
			];

			assert.deepEqual(transposeDecimalIterative(m, 2), [
				['1.23', '0.01'],
				['-1.23', '-0.01'],
				['10', '123456789012345678901234567890.12'],
			]);

			// Default precision is 20
			assert.deepEqual(transposeDecimalIterative(m), [
				['1.23456', '0.005'],
				['-1.23456', '-0.005'],
				['9.9999', '123456789012345678901234567890.12345678901234567891'],
			]);
		});

		it('normalizes leading/trailing zeros, plus signs, shorthand decimals, and scientific notation', () => {
			const m = [
				['+00042.5000', '-.250', '5.'],
				['1.25e-4', '-3.5E+3', ' 000.000100 '],
			];

			assert.deepEqual(transposeDecimalIterative(m, 10), [
				['42.5', '0.000125'],
				['-0.25', '-3500'],
				['5', '0.0001'],
			]);
		});

		it('does not mutate the input matrix', () => {
			const original = [
				['+01.50', '-0.00'],
				['2.345', '3'],
			];
			const snapshot = original.map((row) => [...row]);
			const transposed = transposeDecimalIterative(original, 2);

			assert.deepEqual(original, snapshot);
			transposed[0][0] = '999';
			assert.equal(original[0][0], '+01.50');
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 matrix', () => {
			assert.deepEqual(transposeDecimalIterative([['42.125']]), [['42.125']]);
		});

		it('transposes a 1xN row vector into an Nx1 column vector and back', () => {
			const rowVec = [['1', '-2.5', '0', '100.00000000000000000001']];
			const colVec = [
				['1'],
				['-2.5'],
				['0'],
				['100.00000000000000000001'],
			];
			assert.deepEqual(transposeDecimalIterative(rowVec, 25), colVec);
			assert.deepEqual(transposeDecimalIterative(colVec, 25), rowVec);
		});

		it('normalizes negative zero and values rounding to zero into "0"', () => {
			const m = [
				['-0', '-0.00', '+0.000'],
				['-0e10', '-0.0000000000000000000004', '-1e-10000'],
			];
			assert.deepEqual(transposeDecimalIterative(m, 20), [
				['0', '0'],
				['0', '0'],
				['0', '0'],
			]);
		});

		it('supports precision = 0 (rounds to nearest integer, half away from zero)', () => {
			const m = [
				['0.5', '-0.5', '-0.4999999999999999999999999'],
				['999999999999999999999999.5', '-99.9', '0.4'],
			];
			assert.deepEqual(transposeDecimalIterative(m, 0), [
				['1', '1000000000000000000000000'],
				['-1', '-100'],
				['0', '0'],
			]);
		});

		it('rejects invalid matrix shapes and types with TypeError/RangeError', () => {
			for (const badMatrix of [null, undefined, 42, '1', {}]) {
				assert.throws(() => transposeDecimalIterative(badMatrix), TypeError);
			}

			assert.throws(() => transposeDecimalIterative([]), RangeError);
			assert.throws(() => transposeDecimalIterative([[]]), RangeError);
			assert.throws(() => transposeDecimalIterative(['1', '2']), TypeError);
			assert.throws(() => transposeDecimalIterative([['1'], null]), TypeError);
			assert.throws(
				() =>
					transposeDecimalIterative([
						['1', '2'],
						['3'],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					transposeDecimalIterative([
						['1'],
						['2', '3'],
					]),
				RangeError,
			);
		});

		it('rejects invalid element types and malformed decimal strings', () => {
			for (const badElem of [1, 1n, null, undefined, {}, []]) {
				assert.throws(() => transposeDecimalIterative([[badElem]]), TypeError);
			}

			const malformed = [
				'',
				'   ',
				'abc',
				'1.2.3',
				'.',
				'+',
				'-',
				'+.',
				'-.',
				'NaN',
				'Infinity',
				'-Infinity',
				'1e',
				'1e+',
				'1e1.5',
				'--1',
				'1 2',
				'1_000',
				'1e999999999999',
			];
			for (const str of malformed) {
				assert.throws(() => transposeDecimalIterative([[str]]), RangeError, `Expected RangeError for "${str}"`);
			}
		});

		it('rejects invalid precision arguments', () => {
			for (const badType of ['20', null, 20n, {}, []]) {
				assert.throws(() => transposeDecimalIterative([['1']], badType), TypeError);
			}
			for (const badRange of [-1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => transposeDecimalIterative([['1']], badRange), RangeError);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies involution (A^T)^T = A on a high-precision rectangular matrix', () => {
			const A = [
				[
					'12345678901234567890.098765432109876543210987654321',
					'-0.000000000000000000000000123456789',
					'7',
				],
				[
					'-99999999999999999999999999.5',
					'3.14159265358979323846264338327950288',
					'0',
				],
			];

			const At = transposeDecimalIterative(A, 40);
			const Att = transposeDecimalIterative(At, 40);
			assert.deepEqual(Att, A);
		});

		it('satisfies the adjoint inner-product identity <A x, y> = <x, A^T y> exactly via independent BigInt arithmetic', () => {
			const A = [
				[
					'1.111111111111111111111111111111',
					'-2.222222222222222222222222222222',
					'3.333333333333333333333333333333',
				],
				[
					'-4.444444444444444444444444444444',
					'5.555555555555555555555555555555',
					'-6.666666666666666666666666666666',
				],
			];
			const x = [
				'0.123456789012345678901234567891',
				'-9.876543210987654321098765432109',
				'42.000000000000000000000000000007',
			];
			const y = [
				'-7.654321098765432109876543210987',
				'2.718281828459045235360287471353',
			];

			const At = transposeDecimalIterative(A, 35);

			const Ax = matVecExact(A, x);
			const lhs = dotExact(Ax, y.map(parseExactDecimal));

			const Aty = matVecExact(At, y);
			const rhs = dotExact(x.map(parseExactDecimal), Aty);

			assert.equal(equalExact(lhs, rhs), true);
		});

		it('preserves trace and total element sum of a square high-precision matrix', () => {
			const A = [
				['10.1234567890123456789012345', '-20.5', '30.0000000000000000000000001'],
				['40.9876543210987654321098765', '-50.25', '60.75'],
				['-70.1111111111111111111111111', '80.2222222222222222222222222', '90.3333333333333333333333333'],
			];

			const At = transposeDecimalIterative(A, 30);

			const trace = (M) =>
				M.reduce((acc, row, i) => addExact(acc, parseExactDecimal(row[i])), {
					unscaled: 0n,
					scale: 0,
				});
			const totalSum = (M) =>
				M.flat().reduce((acc, val) => addExact(acc, parseExactDecimal(val)), {
					unscaled: 0n,
					scale: 0,
				});

			assert.equal(equalExact(trace(A), trace(At)), true);
			assert.equal(equalExact(totalSum(A), totalSum(At)), true);
		});
	});
});
