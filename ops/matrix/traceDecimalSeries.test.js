import test from 'node:test';
import assert from 'node:assert/strict';
import { traceDecimalSeries } from './traceDecimalSeries.js';

/**
 * Independent BigInt exact decimal helper (scale-indexed) for cross-checking
 * algebraic matrix trace identities without sharing implementation code.
 */
function toExact(str) {
	const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(str);
	if (!m) throw new Error(`helper only accepts plain decimals: ${str}`);
	const sign = m[1] === '-' ? -1n : 1n;
	const frac = m[3] ?? '';
	return { num: sign * BigInt(m[2] + frac), scale: frac.length };
}

function fromExact({ num, scale }) {
	if (num === 0n) return '0';
	const neg = num < 0n;
	const abs = (neg ? -num : num).toString();
	if (scale === 0) return (neg ? '-' : '') + abs;
	const padded = abs.padStart(scale + 1, '0');
	const intPart = padded.slice(0, -scale);
	const fracPart = padded.slice(-scale).replace(/0+$/, '');
	const prefix = neg ? '-' : '';
	return fracPart ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
}

function addExact(aStr, bStr) {
	const a = toExact(aStr);
	const b = toExact(bStr);
	const scale = Math.max(a.scale, b.scale);
	const num = a.num * (10n ** BigInt(scale - a.scale)) + b.num * (10n ** BigInt(scale - b.scale));
	return fromExact({ num, scale });
}

function mulExact(aStr, bStr) {
	const a = toExact(aStr);
	const b = toExact(bStr);
	return fromExact({ num: a.num * b.num, scale: a.scale + b.scale });
}

function addMatrices(A, B) {
	return A.map((row, i) => row.map((val, j) => addExact(val, B[i][j])));
}

function scaleMatrix(c, A) {
	return A.map((row) => row.map((val) => mulExact(c, val)));
}

function transpose(A) {
	return A[0].map((_, j) => A.map((row) => row[j]));
}

function multiplyMatrices(A, B) {
	const n = A.length;
	const C = Array.from({ length: n }, () => Array(n).fill('0'));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = '0';
			for (let k = 0; k < n; k++) {
				acc = addExact(acc, mulExact(A[i][k], B[k][j]));
			}
			C[i][j] = acc;
		}
	}
	return C;
}

test('normal cases: 1x1, 2x2, 3x3, and 4x4 matrices', () => {
	assert.strictEqual(traceDecimalSeries([['42.125']]), '42.125');
	assert.strictEqual(traceDecimalSeries([['-0.5']]), '-0.5');

	assert.strictEqual(
		traceDecimalSeries([
			['1.5', '999'],
			['-888', '2.25'],
		]),
		'3.75'
	);

	assert.strictEqual(
		traceDecimalSeries([
			['0.1', '2', '3'],
			['4', '0.2', '6'],
			['7', '8', '0.3'],
		]),
		'0.6'
	);

	assert.strictEqual(
		traceDecimalSeries([
			['10.01', '1', '2', '3'],
			['4', '-5.505', '5', '6'],
			['7', '8', '3.495', '9'],
			['10', '11', '12', '2'],
		]),
		'10'
	);
});

test('supports alternate valid decimal string formats', () => {
	assert.strictEqual(
		traceDecimalSeries([
			['+1.500', '.25'],
			['5.', '-.5'],
		]),
		'1'
	);

	assert.strictEqual(
		traceDecimalSeries([
			['5.', '0'],
			['0', '.5'],
		]),
		'5.5'
	);

	assert.strictEqual(
		traceDecimalSeries([
			['1.25e2', '0'],
			['0', '2.5E-1'],
		]),
		'125.25'
	);
});

test('edge cases: zero trace and negative-zero canonicalization', () => {
	assert.strictEqual(
		traceDecimalSeries([
			['0', '1'],
			['2', '0'],
		]),
		'0'
	);

	assert.strictEqual(
		traceDecimalSeries([
			['123456.789', '42'],
			['-42', '-123456.789'],
		]),
		'0'
	);

	assert.strictEqual(traceDecimalSeries([['-0.000']]), '0');

	// Rounds tiny negative trace to canonical "0", never "-0"
	assert.strictEqual(traceDecimalSeries([['-0.0001']], 2), '0');
});

test('edge case: catastrophic cancellation in IEEE-754 floating point', () => {
	const m = [
		['1e30', '0', '0'],
		['0', '0.1', '0'],
		['0', '0', '-1e30'],
	];
	assert.strictEqual(traceDecimalSeries(m, 30), '0.1');

	const m2 = [
		['100000000000000000000000000000000000000000000000000', '1', '2', '3'],
		['4', '0.00000000000000000000000000000000000000000000000001', '5', '6'],
		['7', '8', '-100000000000000000000000000000000000000000000000000', '9'],
		['10', '11', '12', '0.00000000000000000000000000000000000000000000000002'],
	];
	assert.strictEqual(
		traceDecimalSeries(m2, 60),
		'0.00000000000000000000000000000000000000000000000003'
	);
});

test('edge case: high precision (> 50 fractional digits) and rounding', () => {
	const a = '1.' + '1234567890'.repeat(6); // 60 fractional digits
	const b = '2.' + '8765432109'.repeat(6); // 60 fractional digits
	// Sum of each 10-digit block is 9999999999; 6 blocks => 3.999...9 (60 nines)
	const expected60 = '3.' + '9'.repeat(60);

	assert.strictEqual(
		traceDecimalSeries(
			[
				[a, '0'],
				['0', b],
			],
			60
		),
		expected60
	);

	// Rounding 3.999...(60 nines) to 55 digits carries all the way to "4"
	assert.strictEqual(
		traceDecimalSeries(
			[
				[a, '0'],
				['0', b],
			],
			55
		),
		'4'
	);

	// Exact half-away-from-zero rounding behavior
	assert.strictEqual(traceDecimalSeries([['1.235']], 2), '1.24');
	assert.strictEqual(traceDecimalSeries([['-1.235']], 2), '-1.24');
	assert.strictEqual(traceDecimalSeries([['1.234']], 2), '1.23');
	assert.strictEqual(traceDecimalSeries([['2.5']], 0), '3');
	assert.strictEqual(traceDecimalSeries([['-2.5']], 0), '-3');
	assert.strictEqual(traceDecimalSeries([['1e50', '0'], ['0', '2e50']], 0), '3' + '0'.repeat(50));
});

test('strict input validation: non-square, empty, jagged, and invalid inputs', () => {
	// Not an array / empty
	assert.throws(() => traceDecimalSeries(null), TypeError);
	assert.throws(() => traceDecimalSeries('1'), TypeError);
	assert.throws(() => traceDecimalSeries([]), RangeError);
	assert.throws(() => traceDecimalSeries([[]]), RangeError);

	// Non-square / jagged
	assert.throws(
		() =>
			traceDecimalSeries([
				['1', '2', '3'],
				['4', '5', '6'],
			]),
		RangeError
	);
	assert.throws(
		() =>
			traceDecimalSeries([
				['1', '2'],
				['3'],
			]),
		RangeError
	);
	assert.throws(() => traceDecimalSeries([['1', '2'], 'not-a-row']), TypeError);

	// Invalid elements (including off-diagonal)
	assert.throws(() => traceDecimalSeries([[1]]), TypeError);
	assert.throws(
		() =>
			traceDecimalSeries([
				['1', 2],
				['3', '4'],
			]),
		TypeError
	);
	assert.throws(() => traceDecimalSeries([['']]), RangeError);
	assert.throws(() => traceDecimalSeries([['   ']]), RangeError);
	assert.throws(() => traceDecimalSeries([['NaN']]), RangeError);
	assert.throws(() => traceDecimalSeries([['Infinity']]), RangeError);
	assert.throws(() => traceDecimalSeries([['1.2.3']]), RangeError);
	assert.throws(() => traceDecimalSeries([['.']]), RangeError);
	assert.throws(() => traceDecimalSeries([['1e']]), RangeError);
	assert.throws(
		() =>
			traceDecimalSeries([
				['1', 'invalid'],
				['0', '2'],
			]),
		RangeError
	);

	// Invalid precision
	assert.throws(() => traceDecimalSeries([['1']], -1), RangeError);
	assert.throws(() => traceDecimalSeries([['1']], 1.5), RangeError);
	assert.throws(() => traceDecimalSeries([['1']], NaN), RangeError);
	assert.throws(() => traceDecimalSeries([['1']], Infinity), RangeError);
	assert.throws(() => traceDecimalSeries([['1']], '10'), TypeError);
	assert.throws(() => traceDecimalSeries([['1']], null), TypeError);
});

test('independent cross-checks: linearity, transpose invariance, and cyclic property', () => {
	const A = [
		['1.25', '-0.5', '3.125'],
		['2.75', '4.0001', '-1.5'],
		['-6.2', '0.125', '0.8759'],
	];
	const B = [
		['-0.75', '2.5', '1.1'],
		['0.4', '-3.25', '5.05'],
		['2.2', '-1.75', '0.6241'],
	];

	// 1. Linearity: tr(A + B) === tr(A) + tr(B)
	const trA = traceDecimalSeries(A, 30);
	const trB = traceDecimalSeries(B, 30);
	const trAplusB = traceDecimalSeries(addMatrices(A, B), 30);
	assert.strictEqual(trAplusB, addExact(trA, trB));

	// Scalar linearity: tr(c * A) === c * tr(A)
	const c = '-3.75';
	assert.strictEqual(traceDecimalSeries(scaleMatrix(c, A), 30), mulExact(c, trA));

	// 2. Transpose invariance: tr(A^T) === tr(A)
	assert.strictEqual(traceDecimalSeries(transpose(A), 30), trA);
	assert.strictEqual(traceDecimalSeries(transpose(B), 30), trB);

	// 3. Cyclic property: tr(A * B) === tr(B * A)
	const AB = multiplyMatrices(A, B);
	const BA = multiplyMatrices(B, A);
	assert.strictEqual(traceDecimalSeries(AB, 30), traceDecimalSeries(BA, 30));
});
