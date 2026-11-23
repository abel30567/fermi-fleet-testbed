import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimalMemo } from './addDecimalMemo.js';

/**
 * Independent reference implementation using BigInt scaled integer arithmetic
 * to cross-check addDecimalMemo without sharing any table or string logic.
 */
function referenceBigIntAdd(a, b, precision) {
	const parse = (s) => {
		const t = s.trim();
		const neg = t.startsWith('-');
		const body = t.replace(/^[+-]/, '');
		const [iPart = '', fPart = ''] = body.split('.');
		const digits = (iPart || '0') + fPart;
		const val = BigInt(digits) * (neg ? -1n : 1n);
		return { val, scale: fPart.length };
	};

	const pa = parse(a);
	const pb = parse(b);
	const scale = Math.max(pa.scale, pb.scale);
	const scaledA = pa.val * 10n ** BigInt(scale - pa.scale);
	const scaledB = pb.val * 10n ** BigInt(scale - pb.scale);
	let sum = scaledA + scaledB;

	if (precision === undefined) {
		if (sum === 0n) return '0';
		const neg = sum < 0n;
		const absStr = (neg ? -sum : sum).toString().padStart(scale + 1, '0');
		if (scale === 0) return (neg ? '-' : '') + absStr;
		const intStr = absStr.slice(0, absStr.length - scale).replace(/^0+/, '') || '0';
		const fracStr = absStr.slice(absStr.length - scale).replace(/0+$/, '');
		return (neg ? '-' : '') + intStr + (fracStr ? `.${fracStr}` : '');
	}

	const neg = sum < 0n;
	let absSum = neg ? -sum : sum;

	if (precision > scale) {
		absSum *= 10n ** BigInt(precision - scale);
	} else if (precision < scale) {
		const diff = BigInt(scale - precision);
		const divisor = 10n ** diff;
		const quotient = absSum / divisor;
		const remainder = absSum % divisor;
		const half = divisor / 2n;
		absSum = remainder >= half ? quotient + 1n : quotient;
	}

	if (absSum === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	}

	const str = absSum.toString().padStart(precision + 1, '0');
	const intStr = str.slice(0, str.length - precision);
	const fracStr = precision > 0 ? str.slice(str.length - precision) : '';
	return (neg ? '-' : '') + intStr + (precision > 0 ? `.${fracStr}` : '');
}

test('basic positive, negative, and mixed decimal addition', () => {
	assert.equal(addDecimalMemo('0.1', '0.2'), '0.3');
	assert.equal(addDecimalMemo('12.34', '56.78'), '69.12');
	assert.equal(addDecimalMemo('-12.34', '-56.78'), '-69.12');
	assert.equal(addDecimalMemo('100', '-0.01'), '99.99');
	assert.equal(addDecimalMemo('-100', '0.01'), '-99.99');
	assert.equal(addDecimalMemo('1.5', '2.5'), '4');
	assert.equal(addDecimalMemo('-3.75', '3.75'), '0');
	assert.equal(addDecimalMemo('0', '0'), '0');
});

test('configurable precision: rounding, padding, and precision 0', () => {
	assert.equal(addDecimalMemo('0.1', '0.2', 4), '0.3000');
	assert.equal(addDecimalMemo('1', '2', 2), '3.00');
	assert.equal(addDecimalMemo('1.234', '0.001', 2), '1.24');
	assert.equal(addDecimalMemo('1.234', '0.0009', 2), '1.23');
	assert.equal(addDecimalMemo('-1.234', '-0.001', 2), '-1.24');
	assert.equal(addDecimalMemo('-1.234', '-0.0009', 2), '-1.23');
	assert.equal(addDecimalMemo('1.6', '2.1', 0), '4');
	assert.equal(addDecimalMemo('-1.6', '-2.1', 0), '-4');
	assert.equal(addDecimalMemo('9.995', '0', 2), '10.00');
	assert.equal(addDecimalMemo('999.999', '0.001', 2), '1000.00');
	assert.equal(addDecimalMemo('0.999', '0', 0), '1');
	assert.equal(addDecimalMemo('-0.004', '0', 2), '0.00');
	assert.equal(addDecimalMemo('-0.005', '0', 2), '-0.01');
	assert.equal(addDecimalMemo('-0.4', '0', 0), '0');
	assert.equal(addDecimalMemo('-0.5', '0', 0), '-1');
});

test('edge cases: signs, leading/trailing zeros, shorthand decimals, and huge numbers', () => {
	assert.equal(addDecimalMemo('+001.200', '  +000.8000 '), '2');
	assert.equal(addDecimalMemo('-0', '-0.000'), '0');
	assert.equal(addDecimalMemo('-0.0', '0.0', 3), '0.000');
	assert.equal(addDecimalMemo('.5', '.5'), '1');
	assert.equal(addDecimalMemo('-.25', '5.'), '4.75');
	assert.equal(
		addDecimalMemo('9007199254740993.00000000000000000001', '1.99999999999999999999'),
		'9007199254740995'
	);

	const bigA = '9'.repeat(250) + '.' + '9'.repeat(250);
	const bigB = '0.' + '0'.repeat(249) + '1';
	assert.equal(addDecimalMemo(bigA, bigB), '1' + '0'.repeat(250));
});

test('memoization consistency, commutativity, and cache eviction', () => {
	// Repeated calls with equivalent canonical values and swapped operands
	const r1 = addDecimalMemo('123.4500', '67.890', 3);
	const r2 = addDecimalMemo('67.89', '+00123.45', 3);
	const r3 = addDecimalMemo('123.45', '67.89', 3);
	assert.equal(r1, '191.340');
	assert.equal(r2, r1);
	assert.equal(r3, r1);

	// Exceed cache capacity (4096) and verify correctness remains intact
	for (let i = 0; i < 4200; i++) {
		const res = addDecimalMemo(`${i}.25`, '0.75', 2);
		assert.equal(res, `${i + 1}.00`);
	}
	assert.equal(addDecimalMemo('123.45', '67.89', 3), '191.340');
});

test('input validation throws TypeError and RangeError appropriately', () => {
	assert.throws(() => addDecimalMemo(1, '2'), TypeError);
	assert.throws(() => addDecimalMemo('1', 2), TypeError);
	assert.throws(() => addDecimalMemo(null, '1'), TypeError);
	assert.throws(() => addDecimalMemo('1', '2', '2'), TypeError);
	assert.throws(() => addDecimalMemo('1', '2', null), TypeError);

	assert.throws(() => addDecimalMemo('', '1'), RangeError);
	assert.throws(() => addDecimalMemo('   ', '1'), RangeError);
	assert.throws(() => addDecimalMemo('1', 'abc'), RangeError);
	assert.throws(() => addDecimalMemo('1.2.3', '1'), RangeError);
	assert.throws(() => addDecimalMemo('1e5', '1'), RangeError);
	assert.throws(() => addDecimalMemo('NaN', '1'), RangeError);
	assert.throws(() => addDecimalMemo('Infinity', '1'), RangeError);
	assert.throws(() => addDecimalMemo('.', '1'), RangeError);
	assert.throws(() => addDecimalMemo('+', '1'), RangeError);
	assert.throws(() => addDecimalMemo('1', '2', -1), RangeError);
	assert.throws(() => addDecimalMemo('1', '2', 1.5), RangeError);
	assert.throws(() => addDecimalMemo('1', '2', Number.NaN), RangeError);
	assert.throws(() => addDecimalMemo('1', '2', Number.POSITIVE_INFINITY), RangeError);
});

test('independent cross-check against BigInt scaled reference across deterministic fuzz corpus', () => {
	// Deterministic LCG PRNG
	let seed = 0x12345678;
	const nextInt = (max) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed % max;
	};

	const randomDecimal = () => {
		const sign = nextInt(2) === 0 ? '' : '-';
		const intLen = 1 + nextInt(40);
		const fracLen = nextInt(40);
		let intDigits = '';
		for (let i = 0; i < intLen; i++) intDigits += String(nextInt(10));
		let fracDigits = '';
		for (let i = 0; i < fracLen; i++) fracDigits += String(nextInt(10));
		return fracLen > 0 ? `${sign}${intDigits}.${fracDigits}` : `${sign}${intDigits}`;
	};

	const precisions = [undefined, 0, 1, 2, 5, 15, 50];

	for (let i = 0; i < 200; i++) {
		const a = randomDecimal();
		const b = randomDecimal();
		const prec = precisions[i % precisions.length];

		const actual = addDecimalMemo(a, b, prec);
		const expected = referenceBigIntAdd(a, b, prec);
		assert.equal(actual, expected, `Mismatch for a=${a}, b=${b}, precision=${prec}`);

		// Commutativity check
		assert.equal(addDecimalMemo(b, a, prec), actual);
	}
});
