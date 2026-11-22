import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceDecimalIterative } from './traceDecimalIterative.js';

/**
 * Independent exact rational arithmetic helpers (BigInt numerator / denominator)
 * used to cross-check matrix identities (linearity, cyclic invariance, transpose).
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function decimalToRational(str) {
	const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(str);
	assert.ok(m, `Invalid test decimal: ${str}`);
	const sign = m[1] === '-' ? -1n : 1n;
	const intPart = m[2] ?? '';
	const fracPart = m[3] ?? m[4] ?? '';
	const num = sign * BigInt(intPart + fracPart || '0');
	const den = 10n ** BigInt(fracPart.length);
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den;
	const den = a.den * b.den;
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

function mulRat(a, b) {
	const num = a.num * b.num;
	const den = a.den * b.den;
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

/**
 * Converts a rational whose denominator divides a power of 10 into an exact
 * decimal string.
 */
function rationalToExactDecimal(r) {
	if (r.num === 0n) return '0';
	const neg = r.num < 0n;
	let num = neg ? -r.num : r.num;
	let den = r.den;

	let twos = 0;
	let fives = 0;
	let d = den;
	while (d % 2n === 0n) {
		d /= 2n;
		twos += 1;
	}
	while (d % 5n === 0n) {
		d /= 5n;
		fives += 1;
	}
	assert.equal(d, 1n, 'Rational denominator must be terminating base-10');

	const scale = Math.max(twos, fives);
	num *= 2n ** BigInt(scale - twos) * 5n ** BigInt(scale - fives);

	let digits = num.toString();
	if (scale === 0) {
		return (neg ? '-' : '') + digits;
	}
	if (digits.length <= scale) {
		digits = '0'.repeat(scale - digits.length + 1) + digits;
	}
	const intPart = digits.slice(0, digits.length - scale);
	const fracPart = digits.slice(digits.length - scale).replace(/0+$/, '');
	return (neg ? '-' : '') + (fracPart ? `${intPart}.${fracPart}` : intPart);
}

function matAddExact(A, B) {
	const n = A.length;
	const out = [];
	for (let i = 0; i < n; i += 1) {
		const row = [];
		for (let j = 0; j < n; j += 1) {
			row.push(rationalToExactDecimal(addRat(decimalToRational(A[i][j]), decimalToRational(B[i][j]))));
		}
		out.push(row);
	}
	return out;
}

function matMulExact(A, B) {
	const n = A.length;
	const out = [];
	for (let i = 0; i < n; i += 1) {
		const row = [];
		for (let j = 0; j < n; j += 1) {
			let acc = { num: 0n, den: 1n };
			for (let k = 0; k < n; k += 1) {
				acc = addRat(acc, mulRat(decimalToRational(A[i][k]), decimalToRational(B[k][j])));
			}
			row.push(rationalToExactDecimal(acc));
		}
		out.push(row);
	}
	return out;
}

describe('traceDecimalIterative', () => {
	describe('normal cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.equal(traceDecimalIterative([['42']]), '42');
			assert.equal(traceDecimalIterative([['-3.14159']]), '-3.14159');
			assert.equal(traceDecimalIterative([['+0.5000']]), '0.5');
			assert.equal(traceDecimalIterative([['.25']]), '0.25');
			assert.equal(traceDecimalIterative([['7.']]), '7');
		});

		it('avoids IEEE-754 floating-point error on 0.1 + 0.2', () => {
			const matrix = [
				['0.1', '999.999'],
				['-123.456', '0.2'],
			];
			assert.equal(traceDecimalIterative(matrix), '0.3');
		});

		it('computes trace of a 4x4 matrix with mixed signs and scientific notation', () => {
			const matrix = [
				['1.5e2', '0', '1', '-2'],
				['3', '-49.75', '5', '6'],
				['7', '8', '2.5E-2', '9'],
				['10', '11', '12', '-0.275'],
			];
			// 150 - 49.75 + 0.025 - 0.275 = 100
			assert.equal(traceDecimalIterative(matrix), '100');
		});

		it('preserves high precision beyond float64 (30-50+ decimal places)', () => {
			const d0 = '1000000000000000000000000000000.000000000000000000000000000000000001';
			const d1 = '-1000000000000000000000000000000.000000000000000000000000000000000000';
			const d2 = '0.1234567890123456789012345678901234567890123456789';
			const matrix = [
				[d0, '1', '2'],
				['3', d1, '4'],
				['5', '6', d2],
			];
			// Exact sum = 0.1234567890123456789012345678901234577890123456789 (49 decimal places)
			assert.equal(
				traceDecimalIterative(matrix, 50),
				'0.1234567890123456789012345678901234577890123456789'
			);
			// Rounded to default precision = 20
			assert.equal(traceDecimalIterative(matrix), '0.1234567890123456789');
			// Rounded to precision = 35 (36th digit is 7 -> rounds up 5 -> 6)
			assert.equal(traceDecimalIterative(matrix, 35), '0.12345678901234567890123456789012346');
		});

		it('rounds half away from zero at requested precision including carries', () => {
			assert.equal(traceDecimalIterative([['0.999', '0'], ['0', '0.0005']], 2), '1');
			assert.equal(traceDecimalIterative([['1.234', '0'], ['0', '0.001']], 2), '1.24');
			assert.equal(traceDecimalIterative([['-1.234', '0'], ['0', '-0.001']], 2), '-1.24');
			assert.equal(traceDecimalIterative([['1.2344', '0'], ['0', '0']], 3), '1.234');
		});
	});

	describe('edge cases', () => {
		it('handles zero trace and cancelling positive/negative diagonals without producing -0', () => {
			assert.equal(traceDecimalIterative([['0']]), '0');
			assert.equal(traceDecimalIterative([['-0.000', '1'], ['2', '-0']]), '0');
			assert.equal(
				traceDecimalIterative([
					['12345678901234567890.12345678901234567890123456789', '7'],
					['-8', '-12345678901234567890.12345678901234567890123456789'],
				], 35),
				'0'
			);
			// Small negative value rounding to zero should normalize to "0"
			assert.equal(traceDecimalIterative([['-0.0004', '0'], ['0', '0']], 2), '0');
		});

		it('handles precision = 0 correctly', () => {
			assert.equal(traceDecimalIterative([['1.2', '0'], ['0', '0.3']], 0), '2');
			assert.equal(traceDecimalIterative([['-1.2', '0'], ['0', '-0.3']], 0), '-2');
			assert.equal(traceDecimalIterative([['0.49', '0'], ['0', '0']], 0), '0');
			assert.equal(traceDecimalIterative([['-0.49', '0'], ['0', '0']], 0), '0');
		});

		it('handles very large integers without precision loss', () => {
			const big = '9'.repeat(60);
			assert.equal(
				traceDecimalIterative([
					[big, '0'],
					['0', '1'],
				], 0),
				'1' + '0'.repeat(60)
			);
		});

		it('validates matrix structure and non-square/jagged/empty inputs', () => {
			assert.throws(() => traceDecimalIterative(null), TypeError);
			assert.throws(() => traceDecimalIterative('1'), TypeError);
			assert.throws(() => traceDecimalIterative([]), RangeError);
			assert.throws(() => traceDecimalIterative([[]]), RangeError);
			assert.throws(() => traceDecimalIterative(['1']), TypeError);
			assert.throws(
				() => traceDecimalIterative([['1', '2', '3'], ['4', '5', '6']]),
				RangeError
			);
			assert.throws(
				() => traceDecimalIterative([['1', '2'], ['3']]),
				RangeError
			);
		});

		it('validates ALL matrix entries including off-diagonal elements', () => {
			// Invalid off-diagonal string
			assert.throws(
				() => traceDecimalIterative([['1', 'not-a-number'], ['0', '2']]),
				RangeError
			);
			// Invalid off-diagonal type
			assert.throws(
				() => traceDecimalIterative([['1', 2], ['3', '4']]),
				TypeError
			);
			// Whitespace / empty / malformed decimals
			for (const bad of ['', ' ', ' 1.0 ', '.', '+', '-', '1.2.3', 'NaN', 'Infinity', '1e', '1e99999999']) {
				assert.throws(
					() => traceDecimalIterative([['1', bad], ['0', '2']]),
					RangeError,
					`Expected RangeError for off-diagonal entry "${bad}"`
				);
			}
			// Invalid diagonal entry
			assert.throws(
				() => traceDecimalIterative([['1', '0'], ['0', 'bad']]),
				RangeError
			);
		});

		it('validates precision parameter', () => {
			const m = [['1']];
			assert.throws(() => traceDecimalIterative(m, -1), RangeError);
			assert.throws(() => traceDecimalIterative(m, 1.5), RangeError);
			assert.throws(() => traceDecimalIterative(m, Infinity), RangeError);
			assert.throws(() => traceDecimalIterative(m, Number.MAX_SAFE_INTEGER + 1), RangeError);
			assert.throws(() => traceDecimalIterative(m, NaN), TypeError);
			assert.throws(() => traceDecimalIterative(m, '20'), TypeError);
			assert.throws(() => traceDecimalIterative(m, null), TypeError);
		});
	});

	describe('mathematical identity cross-checks', () => {
		const A = [
			['1.1111111111111111111111111', '-2.3456789012345678901234567', '0.5'],
			['3.1415926535897932384626433', '0.0000000000000000000000009', '-7.25'],
			['-4.2', '12.3456789012345678901234567', '2.7182818284590452353602874'],
		];
		const B = [
			['-0.8888888888888888888888889', '5.5', '-1.25'],
			['2.5', '10.1234567890123456789012345', '0.75'],
			['-3.3333333333333333333333333', '4.125', '-1.7182818284590452353602874'],
		];

		it('satisfies linearity: tr(A + B) === tr(A) + tr(B)', () => {
			const precision = 30;
			const AplusB = matAddExact(A, B);
			const lhs = traceDecimalIterative(AplusB, precision);

			const trA = decimalToRational(traceDecimalIterative(A, precision));
			const trB = decimalToRational(traceDecimalIterative(B, precision));
			const rhs = rationalToExactDecimal(addRat(trA, trB));

			assert.equal(lhs, rhs);
		});

		it('satisfies cyclic invariance: tr(A * B) === tr(B * A) for non-commuting matrices', () => {
			const precision = 60;
			const AB = matMulExact(A, B);
			const BA = matMulExact(B, A);

			// Confirm A*B and B*A are genuinely distinct matrices
			assert.notEqual(AB[0][0], BA[0][0]);

			const trAB = traceDecimalIterative(AB, precision);
			const trBA = traceDecimalIterative(BA, precision);
			assert.equal(trAB, trBA);

			// Independent direct rational cross-check of tr(A * B)
			let direct = { num: 0n, den: 1n };
			for (let i = 0; i < 3; i += 1) {
				for (let k = 0; k < 3; k += 1) {
					direct = addRat(
						direct,
						mulRat(decimalToRational(A[i][k]), decimalToRational(B[k][i]))
					);
				}
			}
			assert.equal(trAB, rationalToExactDecimal(direct));
		});

		it('satisfies transpose invariance: tr(A^T) === tr(A)', () => {
			const AT = A[0].map((_, j) => A.map((row) => row[j]));
			assert.equal(traceDecimalIterative(AT, 30), traceDecimalIterative(A, 30));
		});
	});
});
