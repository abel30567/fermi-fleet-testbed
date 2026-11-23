import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductDecimalSeries } from './crossProductDecimalSeries.js';

/**
 * Independent exact rational helper (numerator / denominator as BigInt)
 * used exclusively in tests to verify vector algebra identities without
 * sharing any implementation code with crossProductDecimalSeries.
 */
function toExactRational(str) {
	const negative = str.startsWith('-');
	const unsigned = negative || str.startsWith('+') ? str.slice(1) : str;
	const [mantissa, expStr] = unsigned.split(/[eE]/);
	const exp = expStr ? Number(expStr) : 0;
	const [intPart, fracPart = ''] = mantissa.split('.');
	const digits = BigInt((intPart || '0') + fracPart);
	const totalExp = exp - fracPart.length;
	const signedDigits = negative ? -digits : digits;
	if (totalExp >= 0) {
		return { num: signedDigits * (10n ** BigInt(totalExp)), den: 1n };
	}
	return { num: signedDigits, den: 10n ** BigInt(-totalExp) };
}

function ratAdd(x, y) {
	return { num: x.num * y.den + y.num * x.den, den: x.den * y.den };
}

function ratMul(x, y) {
	return { num: x.num * y.num, den: x.den * y.den };
}

function ratEq(x, y) {
	return x.num * y.den === y.num * x.den;
}

function exactDot(u, v) {
	let acc = { num: 0n, den: 1n };
	for (let i = 0; i < 3; i += 1) {
		acc = ratAdd(acc, ratMul(toExactRational(u[i]), toExactRational(v[i])));
	}
	return acc;
}

function exactNormSq(u) {
	return exactDot(u, u);
}

function negateDecimalStr(s) {
	if (s === '0') return '0';
	return s.startsWith('-') ? s.slice(1) : `-${s}`;
}

describe('crossProductDecimalSeries', () => {
	describe('normal cases', () => {
		it('computes standard 3D basis vector cross products (right-hand rule)', () => {
			const i = ['1', '0', '0'];
			const j = ['0', '1', '0'];
			const k = ['0', '0', '1'];

			assert.deepEqual(crossProductDecimalSeries(i, j), ['0', '0', '1']);
			assert.deepEqual(crossProductDecimalSeries(j, k), ['1', '0', '0']);
			assert.deepEqual(crossProductDecimalSeries(k, i), ['0', '1', '0']);

			assert.deepEqual(crossProductDecimalSeries(j, i), ['0', '0', '-1']);
			assert.deepEqual(crossProductDecimalSeries(k, j), ['-1', '0', '0']);
			assert.deepEqual(crossProductDecimalSeries(i, k), ['0', '-1', '0']);
		});

		it('computes integer vector cross products', () => {
			assert.deepEqual(
				crossProductDecimalSeries(['2', '3', '4'], ['5', '6', '7']),
				['-3', '6', '-3'],
			);
			assert.deepEqual(
				crossProductDecimalSeries(['3', '-3', '1'], ['4', '9', '2']),
				['-15', '-2', '39'],
			);
		});

		it('computes decimal vector cross products accurately', () => {
			// a = [1.5, -2.25, 3.125], b = [-0.5, 4.75, -1.25]
			// c0 = (-2.25)(-1.25) - (3.125)(4.75) = 2.8125 - 14.84375 = -12.03125
			// c1 = (3.125)(-0.5) - (1.5)(-1.25) = -1.5625 - (-1.875) = 0.3125
			// c2 = (1.5)(4.75) - (-2.25)(-0.5) = 7.125 - 1.125 = 6
			assert.deepEqual(
				crossProductDecimalSeries(['1.5', '-2.25', '3.125'], ['-0.5', '4.75', '-1.25']),
				['-12.03125', '0.3125', '6'],
			);
		});

		it('accepts leading plus signs, shorthand decimals, leading/trailing zeros, and scientific notation', () => {
			assert.deepEqual(
				crossProductDecimalSeries(['+001.500', '.5', '0.0'], ['0.', '2e0', '1.5e-1']),
				['0.075', '-0.225', '3'],
			);
		});

		it('rounds to the requested precision (round-half-away-from-zero) and trims trailing zeros', () => {
			// a = [1.115, 0, 0], b = [0, 1, 0] -> c2 = 1.115
			assert.deepEqual(
				crossProductDecimalSeries(['1.115', '0', '0'], ['0', '1', '0'], 2),
				['0', '0', '1.12'],
			);
			// Negative half-way rounds away from zero: -1.115 -> -1.12
			assert.deepEqual(
				crossProductDecimalSeries(['-1.115', '0', '0'], ['0', '1', '0'], 2),
				['0', '0', '-1.12'],
			);
			// Carry propagation across decimal point: 1.999 rounded to 2 decimal places -> "2"
			assert.deepEqual(
				crossProductDecimalSeries(['1.999', '0', '0'], ['0', '1', '0'], 2),
				['0', '0', '2'],
			);
			// precision = 0 rounds to nearest integer
			assert.deepEqual(
				crossProductDecimalSeries(['1.5', '0', '0'], ['0', '1', '0'], 0),
				['0', '0', '2'],
			);
			assert.deepEqual(
				crossProductDecimalSeries(['-1.5', '0', '0'], ['0', '1', '0'], 0),
				['0', '0', '-2'],
			);
		});
	});

	describe('edge cases', () => {
		it('returns ["0", "0", "0"] for parallel, antiparallel, and zero vectors', () => {
			const v = ['1.2345678901234567890123456789', '-9.876543210987654321', '42.5'];
			assert.deepEqual(crossProductDecimalSeries(v, v), ['0', '0', '0']);

			// Parallel scalar multiple (2.5x)
			const scaled = ['3.08641972530864197253086419725', '-24.6913580274691358025', '106.25'];
			assert.deepEqual(crossProductDecimalSeries(v, scaled, 60), ['0', '0', '0']);

			// Antiparallel (-1x)
			const negated = v.map(negateDecimalStr);
			assert.deepEqual(crossProductDecimalSeries(v, negated, 60), ['0', '0', '0']);

			// Zero vector
			assert.deepEqual(crossProductDecimalSeries(['0', '0', '0'], v), ['0', '0', '0']);
			assert.deepEqual(crossProductDecimalSeries(v, ['-0.0', '+0', '0e10']), ['0', '0', '0']);
		});

		it('handles all-negative decimal vectors and avoids "-0" when rounding tiny negatives to zero', () => {
			assert.deepEqual(
				crossProductDecimalSeries(['-0.2', '-0.3', '-0.4'], ['-0.5', '-0.6', '-0.7']),
				['-0.03', '0.06', '-0.03'],
			);
			// Product is -1e-10; rounded to 5 decimal places must be "0", not "-0"
			assert.deepEqual(
				crossProductDecimalSeries(['-1e-5', '0', '0'], ['0', '1e-5', '0'], 5),
				['0', '0', '0'],
			);
		});

		it('preserves >50 digits of precision and avoids IEEE-754 float cancellation', () => {
			// a = [1, 1 + 10^-60, 0], b = [1, 1, 0]
			// In float64, 1 + 10^-60 === 1, yielding [0, 0, 0].
			// Exact cross product is [0, 0, -10^-60].
			const onePlusEps = `1.${'0'.repeat(59)}1`;
			const expectedNegEps = `-0.${'0'.repeat(59)}1`;
			assert.deepEqual(
				crossProductDecimalSeries(['1', onePlusEps, '0'], ['1', '1', '0'], 70),
				['0', '0', expectedNegEps],
			);

			// Non-trivial 64-digit cancellation across all three components:
			// a = [10^30 + 10^-30, 10^30 + 2*10^-30, 10^30 + 3*10^-30]
			// b = [10^30,          10^30,            10^30          ]
			// c0 = (10^30 + 2e-30)*10^30 - (10^30 + 3e-30)*10^30 = -1
			// c1 = (10^30 + 3e-30)*10^30 - (10^30 + 1e-30)*10^30 =  2
			// c2 = (10^30 + 1e-30)*10^30 - (10^30 + 2e-30)*10^30 = -1
			const big = `1${'0'.repeat(30)}`;
			const a = [
				`${big}.${'0'.repeat(29)}1`,
				`${big}.${'0'.repeat(29)}2`,
				`${big}.${'0'.repeat(29)}3`,
			];
			const b = [big, big, big];
			assert.deepEqual(crossProductDecimalSeries(a, b, 60), ['-1', '2', '-1']);

			// Exact >60 fractional digits retained when precision >= 65
			const p = `0.${'0'.repeat(30)}123456789`;
			const q = `0.${'0'.repeat(30)}2`;
			// p * q = 2.46913578e-62 = 0.<61 zeros>246913578
			const expectedProd = `0.${'0'.repeat(61)}246913578`;
			assert.deepEqual(
				crossProductDecimalSeries([p, '0', '0'], ['0', q, '0'], 75),
				['0', '0', expectedProd],
			);
		});

		it('applies default precision of 30 decimal places', () => {
			// 10^-16 * 10^-16 = 10^-32 -> rounds to 0 at default precision 30
			assert.deepEqual(
				crossProductDecimalSeries(['1e-16', '0', '0'], ['0', '1e-16', '0']),
				['0', '0', '0'],
			);
			// 5 * 10^-31 rounds half-away-from-zero to 10^-30 at default precision 30
			assert.deepEqual(
				crossProductDecimalSeries(['5e-16', '0', '0'], ['0', '1e-15', '0']),
				['0', '0', `0.${'0'.repeat(29)}1`],
			);
		});

		it('rejects invalid vector structures, non-decimal strings, and invalid precision', () => {
			// Non-array vectors
			assert.throws(() => crossProductDecimalSeries(null, ['1', '2', '3']), TypeError);
			assert.throws(() => crossProductDecimalSeries(['1', '2', '3'], undefined), TypeError);
			assert.throws(() => crossProductDecimalSeries('1,2,3', ['1', '2', '3']), TypeError);
			assert.throws(() => crossProductDecimalSeries({ 0: '1', 1: '2', 2: '3', length: 3 }, ['1', '2', '3']), TypeError);

			// Wrong vector lengths
			assert.throws(() => crossProductDecimalSeries([], ['1', '2', '3']), RangeError);
			assert.throws(() => crossProductDecimalSeries(['1', '2'], ['1', '2', '3']), RangeError);
			assert.throws(() => crossProductDecimalSeries(['1', '2', '3'], ['1', '2', '3', '4']), RangeError);

			// Sparse array and non-string elements
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => crossProductDecimalSeries(new Array(3), ['1', '2', '3']), TypeError);
			assert.throws(() => crossProductDecimalSeries([1, 2, 3], ['1', '2', '3']), TypeError);
			assert.throws(() => crossProductDecimalSeries(['1', '2', '3'], ['1', null, '3']), TypeError);
			assert.throws(() => crossProductDecimalSeries(['1', 2n, '3'], ['1', '2', '3']), TypeError);

			// Malformed decimal strings
			for (const bad of ['', ' ', ' 1', '1 ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '.', '+', '-', '1e', '1e+', '1_000']) {
				assert.throws(
					() => crossProductDecimalSeries([bad, '0', '0'], ['0', '1', '0']),
					RangeError,
					`Expected "${bad}" to be rejected`,
				);
			}

			// Invalid precision
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], '30'), TypeError);
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], null), TypeError);
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], -1), RangeError);
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], 1.5), RangeError);
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], Number.NaN), RangeError);
			assert.throws(() => crossProductDecimalSeries(['1', '0', '0'], ['0', '1', '0'], Number.POSITIVE_INFINITY), RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		const pairs = [
			[
				['123.45678901234567890123456789', '-987.65432109876543210987654321', '0.00000000000000000000123456789'],
				['-42.195000000000000000000000001', '3.141592653589793238462643383279', '-2.718281828459045235360287471352'],
			],
			[
				['-0.000000000000000000000000000001', '1000000000000000000000000000000', '-7.5'],
				['999999999999999999999999999999.9', '-0.000000000000000000000000000002', '19.25'],
			],
		];

		it('satisfies exact orthogonality: (a × b) · a = 0 and (a × b) · b = 0', () => {
			const zero = { num: 0n, den: 1n };
			for (const [a, b] of pairs) {
				const c = crossProductDecimalSeries(a, b, 100);
				assert.ok(ratEq(exactDot(c, a), zero), 'Expected (a × b) · a === 0');
				assert.ok(ratEq(exactDot(c, b), zero), 'Expected (a × b) · b === 0');
			}
		});

		it('satisfies exact anticommutativity: a × b = -(b × a)', () => {
			for (const [a, b] of pairs) {
				const ab = crossProductDecimalSeries(a, b, 100);
				const ba = crossProductDecimalSeries(b, a, 100);
				assert.deepEqual(ab, ba.map(negateDecimalStr));
			}
		});

		it("satisfies exact Lagrange's identity: ||a × b||² + (a · b)² = ||a||² ||b||²", () => {
			for (const [a, b] of pairs) {
				const c = crossProductDecimalSeries(a, b, 100);
				const dot = exactDot(a, b);
				const lhs = ratAdd(exactNormSq(c), ratMul(dot, dot));
				const rhs = ratMul(exactNormSq(a), exactNormSq(b));
				assert.ok(ratEq(lhs, rhs), "Expected ||a × b||² + (a · b)² === ||a||² ||b||²");
			}
		});

		it('satisfies the Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0', () => {
			const a = ['1.234567890123456789', '-2.5', '3.75'];
			const b = ['-4.125', '5.987654321098765432', '-6.25'];
			const c = ['7.5', '-8.000000000000000001', '9.125'];

			const t1 = crossProductDecimalSeries(a, crossProductDecimalSeries(b, c, 80), 80);
			const t2 = crossProductDecimalSeries(b, crossProductDecimalSeries(c, a, 80), 80);
			const t3 = crossProductDecimalSeries(c, crossProductDecimalSeries(a, b, 80), 80);

			const zero = { num: 0n, den: 1n };
			for (let idx = 0; idx < 3; idx += 1) {
				const sum = ratAdd(
					ratAdd(toExactRational(t1[idx]), toExactRational(t2[idx])),
					toExactRational(t3[idx]),
				);
				assert.ok(ratEq(sum, zero), `Expected Jacobi component ${idx} to be 0`);
			}
		});
	});
});
