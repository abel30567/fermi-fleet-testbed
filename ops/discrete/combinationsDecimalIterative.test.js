import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsDecimalIterative } from './combinationsDecimalIterative.js';

/**
 * Independent BigInt factorial reference for cross-checking C(n, k).
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialBigInt(m) {
	let acc = 1n;
	for (let i = 2n; i <= m; i += 1n) {
		acc *= i;
	}
	return acc;
}

/**
 * Independent additive Pascal's triangle row builder for cross-checking.
 *
 * @param {number} n
 * @returns {bigint[]}
 */
function pascalRow(n) {
	let row = [1n];
	for (let i = 1; i <= n; i += 1) {
		const next = new Array(i + 1);
		next[0] = 1n;
		next[i] = 1n;
		for (let j = 1; j < i; j += 1) {
			next[j] = row[j - 1] + row[j];
		}
		row = next;
	}
	return row;
}

describe('combinationsDecimalIterative', () => {
	describe('normal cases', () => {
		it('computes standard small binomial coefficients', () => {
			assert.equal(combinationsDecimalIterative('5', '2'), '10');
			assert.equal(combinationsDecimalIterative('10', '3'), '120');
			assert.equal(combinationsDecimalIterative('20', '10'), '184756');
			assert.equal(combinationsDecimalIterative('52', '5'), '2598960');
		});

		it('computes large values beyond IEEE-754 float64 precision exactly', () => {
			// C(100, 50) has 30 decimal digits (exceeds float64's 15-17 significant digits).
			assert.equal(
				combinationsDecimalIterative('100', '50'),
				'100891344545564193334812497256'
			);

			// C(200, 100) has 60 decimal digits.
			const expected200 =
				factorialBigInt(200n) / (factorialBigInt(100n) * factorialBigInt(100n));
			assert.equal(
				combinationsDecimalIterative('200', '100'),
				expected200.toString()
			);
		});

		it('handles arbitrarily large n with small r via symmetry', () => {
			const hugeN = '10000000000000000000000000000000000000000'; // 10^40
			const hugeNMinus2 = '9999999999999999999999999999999999999998'; // 10^40 - 2
			const expected = ((10n ** 40n) * (10n ** 40n - 1n)) / 2n;

			assert.equal(combinationsDecimalIterative(hugeN, '2'), expected.toString());
			assert.equal(
				combinationsDecimalIterative(hugeN, hugeNMinus2),
				expected.toString()
			);
		});
	});

	describe('edge cases', () => {
		it('handles boundary values k = 0, k = n, n = 0, and k > n', () => {
			assert.equal(combinationsDecimalIterative('0', '0'), '1');
			assert.equal(combinationsDecimalIterative('1', '0'), '1');
			assert.equal(combinationsDecimalIterative('1', '1'), '1');
			assert.equal(combinationsDecimalIterative('10', '0'), '1');
			assert.equal(combinationsDecimalIterative('10', '10'), '1');
			assert.equal(combinationsDecimalIterative('10', '1'), '10');
			assert.equal(combinationsDecimalIterative('10', '9'), '10');

			assert.equal(combinationsDecimalIterative('0', '1'), '0');
			assert.equal(combinationsDecimalIterative('5', '6'), '0');
			assert.equal(combinationsDecimalIterative('10', '100'), '0');
		});

		it('accepts equivalent decimal string representations', () => {
			assert.equal(combinationsDecimalIterative('+10', '3.0'), '120');
			assert.equal(
				combinationsDecimalIterative(
					'10.000000000000000000000000000000',
					'+003.000'
				),
				'120'
			);
			assert.equal(combinationsDecimalIterative('1e1', '30e-1'), '120');
			assert.equal(combinationsDecimalIterative('1.0e1', '3.'), '120');
			assert.equal(combinationsDecimalIterative('-0', '-0.0'), '1');
			assert.equal(combinationsDecimalIterative(' 5 ', ' 2.0 '), '10');
			assert.equal(combinationsDecimalIterative('5', '-0.000'), '1');
		});

		it('respects the configurable precision argument', () => {
			assert.equal(combinationsDecimalIterative('5', '2', 0), '10');
			assert.equal(combinationsDecimalIterative('5', '2', 4), '10.0000');
			assert.equal(combinationsDecimalIterative('5', '6', 0), '0');
			assert.equal(combinationsDecimalIterative('5', '6', 3), '0.000');
			assert.equal(combinationsDecimalIterative('0', '0', 2), '1.00');
			assert.equal(
				combinationsDecimalIterative('100', '50', 25),
				`100891344545564193334812497256.${'0'.repeat(25)}`
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-string n or k', () => {
			for (const bad of [10, 10n, null, undefined, {}, [], true]) {
				assert.throws(() => combinationsDecimalIterative(bad, '2'), TypeError);
				assert.throws(() => combinationsDecimalIterative('5', bad), TypeError);
			}
		});

		it('throws TypeError for non-number precision', () => {
			for (const bad of ['0', null, 0n, {}, [], false]) {
				assert.throws(
					() => combinationsDecimalIterative('5', '2', bad),
					TypeError
				);
			}
		});

		it('throws RangeError for negative, non-integer, or malformed n or k', () => {
			const invalidValues = [
				'-1',
				'-10',
				'-10.0',
				'-1e2',
				'5.5',
				'10.000000000000000000000000000001',
				'.5',
				'1.5e0',
				'1e-1',
				'',
				'   ',
				'abc',
				'1.2.3',
				'.',
				'+',
				'-',
				'NaN',
				'Infinity',
				'1e',
				'1_000',
				'1 0',
			];

			for (const bad of invalidValues) {
				assert.throws(
					() => combinationsDecimalIterative(bad, '2'),
					RangeError,
					`Expected RangeError for n="${bad}"`
				);
				assert.throws(
					() => combinationsDecimalIterative('5', bad),
					RangeError,
					`Expected RangeError for k="${bad}"`
				);
			}
		});

		it('throws RangeError for invalid precision values', () => {
			for (const bad of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => combinationsDecimalIterative('5', '2', bad),
					RangeError
				);
			}
		});
	});

	describe('mathematical cross-checks', () => {
		it("satisfies Pascal's triangle recurrence C(n, k) = C(n-1, k-1) + C(n-1, k)", () => {
			for (let n = 1; n <= 20; n += 1) {
				for (let k = 1; k < n; k += 1) {
					const lhs = BigInt(combinationsDecimalIterative(String(n), String(k)));
					const rhs =
						BigInt(combinationsDecimalIterative(String(n - 1), String(k - 1))) +
						BigInt(combinationsDecimalIterative(String(n - 1), String(k)));
					assert.equal(lhs, rhs, `Failed Pascal identity at n=${n}, k=${k}`);
				}
			}
		});

		it("matches an independent additive Pascal's triangle row for n = 60 (beyond float64)", () => {
			const n = 60;
			const expectedRow = pascalRow(n);
			for (let k = 0; k <= n; k += 1) {
				assert.equal(
					combinationsDecimalIterative(String(n), String(k)),
					expectedRow[k].toString(),
					`Mismatch at C(${n}, ${k})`
				);
			}
		});

		it('satisfies symmetry C(n, k) = C(n, n - k)', () => {
			for (const n of [25, 100]) {
				for (let k = 0; k <= n; k += 1) {
					assert.equal(
						combinationsDecimalIterative(String(n), String(k)),
						combinationsDecimalIterative(String(n), String(n - k)),
						`Symmetry failed for n=${n}, k=${k}`
					);
				}
			}
		});

		it('satisfies the row sum identity sum_{k=0}^n C(n, k) = 2^n', () => {
			for (const n of [0, 1, 5, 15, 30, 80]) {
				let sum = 0n;
				for (let k = 0; k <= n; k += 1) {
					sum += BigInt(combinationsDecimalIterative(String(n), String(k)));
				}
				assert.equal(sum, 2n ** BigInt(n), `Row sum failed for n=${n}`);
			}
		});
	});
});
