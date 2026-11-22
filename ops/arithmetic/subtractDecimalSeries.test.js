import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractDecimalSeries } from './subtractDecimalSeries.js';

/**
 * Independent reference implementation of exact decimal subtraction using
 * explicit digit-by-digit positional borrow/carry arithmetic (no BigInt).
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function independentDigitSubtract(a, b) {
	const parse = (s) => {
		let neg = false;
		if (s.startsWith('-')) {
			neg = true;
			s = s.slice(1);
		} else if (s.startsWith('+')) {
			s = s.slice(1);
		}
		const [i = '0', f = ''] = s.split('.');
		return { neg, i: i || '0', f };
	};

	const pa = parse(a);
	const pb = parse(b);
	// a - b = a + (-b)
	pb.neg = !pb.neg;

	const fracLen = Math.max(pa.f.length, pb.f.length);
	const intLen = Math.max(pa.i.length, pb.i.length);
	const da = (pa.i.padStart(intLen, '0') + pa.f.padEnd(fracLen, '0')).split('').map(Number);
	const db = (pb.i.padStart(intLen, '0') + pb.f.padEnd(fracLen, '0')).split('').map(Number);

	const cmpMag = (x, y) => {
		for (let k = 0; k < x.length; k++) {
			if (x[k] !== y[k]) return x[k] - y[k];
		}
		return 0;
	};

	let resDigits;
	let resNeg = false;

	if (pa.neg === pb.neg) {
		resNeg = pa.neg;
		resDigits = [];
		let carry = 0;
		for (let k = da.length - 1; k >= 0; k--) {
			const sum = da[k] + db[k] + carry;
			resDigits.push(sum % 10);
			carry = Math.floor(sum / 10);
		}
		if (carry > 0) resDigits.push(carry);
		resDigits.reverse();
	} else {
		const cmp = cmpMag(da, db);
		if (cmp === 0) return '0';
		const [big, small] = cmp > 0 ? [da, db] : [db, da];
		resNeg = cmp > 0 ? pa.neg : pb.neg;
		resDigits = [];
		let borrow = 0;
		for (let k = big.length - 1; k >= 0; k--) {
			let d = big[k] - small[k] - borrow;
			if (d < 0) {
				d += 10;
				borrow = 1;
			} else {
				borrow = 0;
			}
			resDigits.push(d);
		}
		resDigits.reverse();
	}

	const raw = resDigits.join('');
	const split = raw.length - fracLen;
	let intPart = raw.slice(0, split).replace(/^0+/, '') || '0';
	const fracPart = fracLen > 0 ? raw.slice(split).replace(/0+$/, '') : '';
	if (intPart === '0' && fracPart === '') return '0';
	return (resNeg ? '-' : '') + (fracPart ? `${intPart}.${fracPart}` : intPart);
}

describe('subtractDecimalSeries', () => {
	describe('normal cases', () => {
		it('subtracts basic integers and decimals exactly', () => {
			assert.equal(subtractDecimalSeries('10', '3'), '7');
			assert.equal(subtractDecimalSeries('3', '10'), '-7');
			assert.equal(subtractDecimalSeries('0.3', '0.1'), '0.2');
			assert.equal(subtractDecimalSeries('5.75', '2.25'), '3.5');
			assert.equal(subtractDecimalSeries('123.456', '0.456'), '123');
		});

		it('handles all sign combinations accurately', () => {
			assert.equal(subtractDecimalSeries('+5.5', '+2.25'), '3.25');
			assert.equal(subtractDecimalSeries('+5.5', '-2.25'), '7.75');
			assert.equal(subtractDecimalSeries('-5.5', '+2.25'), '-7.75');
			assert.equal(subtractDecimalSeries('-5.5', '-2.25'), '-3.25');
			assert.equal(subtractDecimalSeries('-2.25', '-5.5'), '3.25');
		});

		it('applies configurable precision with rounding and zero-padding', () => {
			assert.equal(subtractDecimalSeries('1.23456', '0.11111', 3), '1.123');
			assert.equal(subtractDecimalSeries('1.23456', '0.11111', 4), '1.1235');
			assert.equal(subtractDecimalSeries('0.11111', '1.23456', 4), '-1.1235');
			assert.equal(subtractDecimalSeries('1.5', '0.5', 4), '1.0000');
			assert.equal(subtractDecimalSeries('10', '3.6', 0), '6');
			assert.equal(subtractDecimalSeries('10', '3.5', 0), '7');
			assert.equal(subtractDecimalSeries('3.5', '10', 0), '-7');
		});
	});

	describe('edge cases', () => {
		it('normalizes signed zeros and avoids negative zero after rounding', () => {
			assert.equal(subtractDecimalSeries('0', '0'), '0');
			assert.equal(subtractDecimalSeries('-0', '0'), '0');
			assert.equal(subtractDecimalSeries('0', '-0'), '0');
			assert.equal(subtractDecimalSeries('-0.000', '+0.0'), '0');
			assert.equal(subtractDecimalSeries('1.5', '1.5'), '0');
			assert.equal(subtractDecimalSeries('1.5', '1.5', 3), '0.000');
			assert.equal(subtractDecimalSeries('0.001', '0.002', 2), '0.00');
			assert.equal(subtractDecimalSeries('0.001', '0.002', 0), '0');
		});

		it('handles shorthand decimal formats and leading/trailing zeros', () => {
			assert.equal(subtractDecimalSeries('.5', '.25'), '0.25');
			assert.equal(subtractDecimalSeries('5.', '2.'), '3');
			assert.equal(subtractDecimalSeries('-.5', '.5'), '-1');
			assert.equal(subtractDecimalSeries('00012.3400', '00002.3400'), '10');
			assert.equal(subtractDecimalSeries('00012.3400', '00002.3400', 2), '10.00');
		});

		it('propagates carries across decimal boundary when rounding up', () => {
			assert.equal(subtractDecimalSeries('10.000', '0.001', 2), '10.00');
			assert.equal(subtractDecimalSeries('0.001', '10.000', 2), '-10.00');
			assert.equal(subtractDecimalSeries('1.0000', '0.0001', 0), '1');
		});

		it('preserves full precision far beyond IEEE 754 float limits', () => {
			const bigA = '1' + '0'.repeat(60) + '.' + '0'.repeat(49) + '1';
			const bigB = '0.' + '0'.repeat(49) + '2';
			const expected = '9'.repeat(60) + '.' + '9'.repeat(50);
			assert.equal(subtractDecimalSeries(bigA, bigB), expected);
			assert.equal(subtractDecimalSeries(bigA, bigB, 50), expected);
			assert.equal(subtractDecimalSeries(bigA, bigB, 2), '1' + '0'.repeat(60) + '.00');
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when a or b is not a string', () => {
			assert.throws(() => subtractDecimalSeries(10, '5'), TypeError);
			assert.throws(() => subtractDecimalSeries('10', 5), TypeError);
			assert.throws(() => subtractDecimalSeries(null, '1'), TypeError);
			assert.throws(() => subtractDecimalSeries('1', undefined), TypeError);
			assert.throws(() => subtractDecimalSeries({}, '1'), TypeError);
		});

		it('throws RangeError for malformed decimal strings', () => {
			const badInputs = ['', ' ', ' 1.2', '1.2 ', '.', '+', '-', '1.2.3', 'abc', 'NaN', 'Infinity', '1e5'];
			for (const bad of badInputs) {
				assert.throws(() => subtractDecimalSeries(bad, '1'), RangeError, `expected RangeError for a=${JSON.stringify(bad)}`);
				assert.throws(() => subtractDecimalSeries('1', bad), RangeError, `expected RangeError for b=${JSON.stringify(bad)}`);
			}
		});

		it('validates the optional precision argument', () => {
			assert.throws(() => subtractDecimalSeries('1', '2', '2'), TypeError);
			assert.throws(() => subtractDecimalSeries('1', '2', null), TypeError);
			assert.throws(() => subtractDecimalSeries('1', '2', -1), RangeError);
			assert.throws(() => subtractDecimalSeries('1', '2', 1.5), RangeError);
			assert.throws(() => subtractDecimalSeries('1', '2', Number.NaN), RangeError);
			assert.throws(() => subtractDecimalSeries('1', '2', Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => subtractDecimalSeries('1', '2', Number.MAX_SAFE_INTEGER + 1), RangeError);
		});
	});

	describe('cross-checks against independent computation and algebraic identities', () => {
		it('matches independent digit-by-digit positional subtraction across diverse pairs', () => {
			const pairs = [
				['987654321098765432109876543210.1234567890123456789', '123456789012345678901234567890.9876543210987654321'],
				['-42.00000000000000000001', '57.99999999999999999999'],
				['0.0000000000000000000000001', '0.0000000000000000000000009'],
				['-1000000000000000000000000', '-999999999999999999999999.9999999999'],
				['3.141592653589793238462643383279', '2.718281828459045235360287471352'],
				['+0.1', '-0.2'],
			];

			for (const [a, b] of pairs) {
				assert.equal(subtractDecimalSeries(a, b), independentDigitSubtract(a, b));
				// Antisymmetry identity: a - b = -(b - a)
				const ab = subtractDecimalSeries(a, b);
				const ba = subtractDecimalSeries(b, a);
				const negatedBa = ba === '0' ? '0' : ba.startsWith('-') ? ba.slice(1) : `-${ba}`;
				assert.equal(ab, negatedBa);
			}
		});

		it('satisfies telescoping series identity sum_{k=1..n} (x_k - x_{k-1}) = x_n - x_0', () => {
			const terms = [
				'-12345678901234567890.123456789',
				'-500.555555555555555555',
				'0.000000000000000001',
				'42.42424242424242424242',
				'99999999999999999999999.99999999999999999999',
			];

			// Accumulate sum of differences by subtracting the negation of each delta:
			// acc + delta = acc - (-delta)
			let acc = '0';
			for (let i = 1; i < terms.length; i++) {
				const delta = subtractDecimalSeries(terms[i], terms[i - 1]);
				const negDelta = delta === '0' ? '0' : delta.startsWith('-') ? delta.slice(1) : `-${delta}`;
				acc = subtractDecimalSeries(acc, negDelta);
			}

			const direct = subtractDecimalSeries(terms[terms.length - 1], terms[0]);
			assert.equal(acc, direct);
		});
	});
});
