import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { divideDecimalStable } from './divideDecimalStable.js';

/**
 * Independent helper: parse a decimal string into exact integer ratio `num / 10^scale`.
 * Used strictly as an independent oracle for error-bound cross-checks.
 *
 * @param {string} s
 * @returns {{ num: bigint, exp: bigint }}
 */
function parseToExactPower10(s) {
	const trimmed = s.trim();
	const [mantissa, expPart] = trimmed.split(/[eE]/);
	const exp = expPart ? BigInt(expPart) : 0n;
	const sign = mantissa.startsWith('-') ? -1n : 1n;
	const unsigned = mantissa.replace(/^[+-]/, '');
	const [intPart = '', fracPart = ''] = unsigned.split('.');
	const digits = BigInt(intPart + fracPart);
	return { num: sign * digits, exp: exp - BigInt(fracPart.length) };
}

/**
 * Independent oracle verifying |q - a/b| <= boundFactor * 10^(-precision)
 * using exact integer cross-multiplication (no floating point).
 *
 * @param {string} aStr
 * @param {string} bStr
 * @param {string} qStr
 * @param {number} precision
 * @param {'half-even'|'half-up'|'truncate'} mode
 */
function assertWithinErrorBound(aStr, bStr, qStr, precision, mode = 'half-even') {
	const a = parseToExactPower10(aStr);
	const b = parseToExactPower10(bStr);
	const q = parseToExactPower10(qStr);

	// Check |q * b - a| <= bound * |b| * 10^(-precision)
	// Multiply through by 10^commonScale to keep everything exact BigInt.
	const qbExp = q.exp + b.exp;
	const rhsExp = b.exp - BigInt(precision);
	const minExp = [a.exp, qbExp, rhsExp].reduce((m, v) => (v < m ? v : m));

	const lhsA = a.num * 10n ** (a.exp - minExp);
	const lhsQB = q.num * b.num * 10n ** (qbExp - minExp);
	const absDiff = lhsQB >= lhsA ? lhsQB - lhsA : lhsA - lhsQB;

	const absB = b.num < 0n ? -b.num : b.num;
	const rhsUnit = absB * 10n ** (rhsExp - minExp);

	if (mode === 'truncate') {
		assert.ok(absDiff < rhsUnit, `Truncate error exceeded 1 ULP for ${aStr} / ${bStr} -> ${qStr}`);
	} else {
		assert.ok(
			absDiff * 2n <= rhsUnit,
			`Rounded error exceeded 0.5 ULP for ${aStr} / ${bStr} -> ${qStr}`,
		);
	}
}

describe('divideDecimalStable', () => {
	describe('normal cases', () => {
		it('handles exact integer and terminating decimal divisions', () => {
			assert.equal(divideDecimalStable('10', '2'), '5');
			assert.equal(divideDecimalStable('1', '4'), '0.25');
			assert.equal(divideDecimalStable('1', '8'), '0.125');
			assert.equal(divideDecimalStable('3.75', '1.5'), '2.5');
			assert.equal(divideDecimalStable('100000000000000000000000000', '5'), '20000000000000000000000000');
		});

		it('handles repeating decimals with default and custom precision', () => {
			assert.equal(divideDecimalStable('1', '3'), '0.33333333333333333333');
			assert.equal(divideDecimalStable('2', '3'), '0.66666666666666666667');
			assert.equal(divideDecimalStable('1', '3', 6), '0.333333');
			assert.equal(divideDecimalStable('2', '3', 6), '0.666667');
			assert.equal(divideDecimalStable('22', '7', 10), '3.1428571429');
		});

		it('handles all sign combinations and optional leading plus or whitespace', () => {
			assert.equal(divideDecimalStable('-10', '4'), '-2.5');
			assert.equal(divideDecimalStable('10', '-4'), '-2.5');
			assert.equal(divideDecimalStable('-10', '-4'), '2.5');
			assert.equal(divideDecimalStable('  +10.5  ', ' +2 '), '5.25');
			assert.equal(divideDecimalStable('.5', '2.'), '0.25');
		});

		it('supports scientific notation inputs', () => {
			assert.equal(divideDecimalStable('1.5e-10', '3e-12'), '50');
			assert.equal(divideDecimalStable('1E5', '4e2'), '250');
			assert.equal(divideDecimalStable('1e100', '4e99'), '2.5');
			assert.equal(divideDecimalStable('.5e-2', '5.e-4'), '10');
		});

		it('supports rounding modes half-even, half-up, and truncate', () => {
			// Exact ties at precision 0
			assert.equal(divideDecimalStable('5', '2', 0, { roundingMode: 'half-even' }), '2');
			assert.equal(divideDecimalStable('7', '2', 0, { roundingMode: 'half-even' }), '4');
			assert.equal(divideDecimalStable('-5', '2', 0, { roundingMode: 'half-even' }), '-2');
			assert.equal(divideDecimalStable('-7', '2', 0, { roundingMode: 'half-even' }), '-4');

			assert.equal(divideDecimalStable('5', '2', 0, { roundingMode: 'half-up' }), '3');
			assert.equal(divideDecimalStable('-5', '2', 0, { roundingMode: 'half-up' }), '-3');

			assert.equal(divideDecimalStable('5', '2', 0, { roundingMode: 'truncate' }), '2');
			assert.equal(divideDecimalStable('-5', '2', 0, { roundingMode: 'truncate' }), '-2');
			assert.equal(divideDecimalStable('2', '3', 4, { roundingMode: 'truncate' }), '0.6666');

			// Exact tie at fractional digit: 1/8 = 0.125
			assert.equal(divideDecimalStable('1', '8', 2, { roundingMode: 'half-even' }), '0.12');
			assert.equal(divideDecimalStable('1', '8', 2, { roundingMode: 'half-up' }), '0.13');
			assert.equal(divideDecimalStable('3', '8', 2, { roundingMode: 'half-even' }), '0.38');
		});

		it('respects trimTrailingZeros option', () => {
			assert.equal(divideDecimalStable('10', '2', 4, { trimTrailingZeros: false }), '5.0000');
			assert.equal(divideDecimalStable('1', '4', 5, { trimTrailingZeros: false }), '0.25000');
			assert.equal(divideDecimalStable('0', '7', 3, { trimTrailingZeros: false }), '0.000');
			assert.equal(divideDecimalStable('10', '2', 0, { trimTrailingZeros: false }), '5');
		});
	});

	describe('edge cases', () => {
		it('normalizes signed zeros to positive zero', () => {
			assert.equal(divideDecimalStable('0', '5'), '0');
			assert.equal(divideDecimalStable('-0', '5'), '0');
			assert.equal(divideDecimalStable('0.000', '-5'), '0');
			assert.equal(divideDecimalStable('-0.00e-20', '-3.14'), '0');
			// Rounding underflow to zero must not emit "-0"
			assert.equal(divideDecimalStable('-1', '1000', 1), '0');
		});

		it('propagates rounding carries cleanly across decimal point', () => {
			assert.equal(divideDecimalStable('9.999', '1', 2), '10');
			assert.equal(divideDecimalStable('9.999', '1', 2, { trimTrailingZeros: false }), '10.00');
			assert.equal(divideDecimalStable('0.9999', '1', 2), '1');
			assert.equal(divideDecimalStable('-9.999', '1', 2), '-10');
		});

		it('short-circuits extreme underflow and cancels extreme equal exponents without OOM', () => {
			assert.equal(divideDecimalStable('1e-1000000000', '3', 20), '0');
			assert.equal(divideDecimalStable('-9.999e-500000000', '1', 10), '0');
			assert.equal(divideDecimalStable('1e1000000000', '2e1000000000', 10), '0.5');
			assert.equal(divideDecimalStable('3e-999999999', '4e-999999999', 10), '0.75');
		});

		it('handles high-precision inputs far beyond IEEE 754 limits', () => {
			const bigA = '12345678901234567890123456789012345678901234567890.1234567890123456789';
			const bigB = '12345678901234567890123456789012345678901234567890.1234567890123456789';
			assert.equal(divideDecimalStable(bigA, bigB, 50), '1');

			// Exact 50-digit quotient: (10^60 - 1) / 9 = 60 nines / 9 = 60 ones
			const sixtyNines = '9'.repeat(60);
			assert.equal(divideDecimalStable(sixtyNines, '9', 0), '1'.repeat(60));
		});

		it('throws appropriate errors on invalid inputs and division by zero', () => {
			assert.throws(() => divideDecimalStable(10, '2'), TypeError);
			assert.throws(() => divideDecimalStable('10', 2), TypeError);
			assert.throws(() => divideDecimalStable('10', '2', '5'), TypeError);
			assert.throws(() => divideDecimalStable('10', '2', 5, null), TypeError);
			assert.throws(() => divideDecimalStable('10', '2', 5, { trimTrailingZeros: 'yes' }), TypeError);

			assert.throws(() => divideDecimalStable('', '2'), RangeError);
			assert.throws(() => divideDecimalStable('   ', '2'), RangeError);
			assert.throws(() => divideDecimalStable('NaN', '2'), RangeError);
			assert.throws(() => divideDecimalStable('Infinity', '2'), RangeError);
			assert.throws(() => divideDecimalStable('1.2.3', '2'), RangeError);
			assert.throws(() => divideDecimalStable('.', '2'), RangeError);
			assert.throws(() => divideDecimalStable('1e', '2'), RangeError);

			assert.throws(() => divideDecimalStable('10', '0'), RangeError);
			assert.throws(() => divideDecimalStable('10', '-0.000'), RangeError);
			assert.throws(() => divideDecimalStable('10', '0e100'), RangeError);

			assert.throws(() => divideDecimalStable('10', '2', -1), RangeError);
			assert.throws(() => divideDecimalStable('10', '2', 1.5), RangeError);
			assert.throws(() => divideDecimalStable('10', '2', Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => divideDecimalStable('10', '2', 5, { roundingMode: 'floor' }), RangeError);
			assert.throws(() => divideDecimalStable('1e2000000', '1', 5), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches known analytical decimal expansions to high precision', () => {
			// 1/7 = 0.(142857)...
			assert.equal(divideDecimalStable('1', '7', 60), `0.${'142857'.repeat(10)}`);

			// 1/81 = 0.(012345679)...
			assert.equal(divideDecimalStable('1', '81', 45), `0.${'012345679'.repeat(5)}`);

			// 1/998001 starts with 0.000001002003004005006007008009010011...
			const expectedPrefix =
				'0.' + Array.from({ length: 20 }, (_, i) => String(i).padStart(3, '0')).join('');
			assert.equal(divideDecimalStable('1', '998001', 60, { roundingMode: 'truncate' }), expectedPrefix);
		});

		it('satisfies exact 0.5-ULP and 1-ULP error bounds via independent rational multiplication', () => {
			const cases = [
				['1', '3', 30],
				['-355', '113', 40],
				['98765432109876543210.123456789', '1234567890123456789.987654321', 50],
				['1.23456789e-25', '9.87654321e-18', 35],
				['7.5', '100', 1],
				['-1', '19', 25],
			];

			for (const [a, b, p] of cases) {
				for (const mode of ['half-even', 'half-up', 'truncate']) {
					const q = divideDecimalStable(a, b, p, { roundingMode: mode });
					assertWithinErrorBound(a, b, q, p, mode);
				}
			}
		});

		it('is invariant under simultaneous power-of-10 scaling and agrees with IEEE 754 on well-conditioned values', () => {
			const base = divideDecimalStable('123.456', '78.9', 30);
			assert.equal(divideDecimalStable('123.456e50', '78.9e50', 30), base);
			assert.equal(divideDecimalStable('123.456e-50', '78.9e-50', 30), base);
			assert.ok(Math.abs(Number(base) - 123.456 / 78.9) < 1e-12);
		});
	});
});
