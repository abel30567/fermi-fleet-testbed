import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddDecimalRecursive } from './vectorAddDecimalRecursive.js';

/**
 * Independent iterative BigInt reference implementation for cross-checking.
 *
 * @param {string[]} vecA
 * @param {string[]} vecB
 * @param {number} [precision=20]
 * @returns {string[]}
 */
function iterativeReferenceAdd(vecA, vecB, precision = 20) {
	const parse = (s) => {
		const neg = s.startsWith('-');
		const clean = neg || s.startsWith('+') ? s.slice(1) : s;
		const [i = '0', f = ''] = clean.split('.');
		const val = BigInt((i || '0') + f);
		return { val: neg && val !== 0n ? -val : val, scale: f.length };
	};

	const out = [];
	for (let idx = 0; idx < vecA.length; idx++) {
		const a = parse(vecA[idx]);
		const b = parse(vecB[idx]);
		const scale = Math.max(a.scale, b.scale);
		let sum = a.val * (10n ** BigInt(scale - a.scale)) + b.val * (10n ** BigInt(scale - b.scale));
		let outScale = scale;

		if (scale > precision) {
			const factor = 10n ** BigInt(scale - precision);
			const neg = sum < 0n;
			const abs = neg ? -sum : sum;
			const q = abs / factor;
			const r = abs % factor;
			const rounded = r * 2n >= factor ? q + 1n : q;
			sum = neg ? -rounded : rounded;
			outScale = precision;
		}

		if (sum === 0n) {
			out.push('0');
			continue;
		}
		const neg = sum < 0n;
		const str = (neg ? -sum : sum).toString();
		if (outScale === 0) {
			out.push(neg ? `-${str}` : str);
			continue;
		}
		const padded = str.padStart(outScale + 1, '0');
		const intPart = padded.slice(0, padded.length - outScale);
		const fracPart = padded.slice(padded.length - outScale).replace(/0+$/, '');
		out.push(`${neg ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`);
	}
	return out;
}

describe('vectorAddDecimalRecursive', () => {
	test('normal vectors with integers and decimals', () => {
		assert.deepEqual(
			vectorAddDecimalRecursive(['1', '2.5', '0.1'], ['3', '4.25', '0.2']),
			['4', '6.75', '0.3']
		);
		assert.deepEqual(
			vectorAddDecimalRecursive(['+1.5', '.25', '5.'], ['2.5', '.75', '0.5']),
			['4', '1', '5.5']
		);
	});

	test('empty and single-element vectors', () => {
		assert.deepEqual(vectorAddDecimalRecursive([], []), []);
		assert.deepEqual(vectorAddDecimalRecursive(['42.125'], ['0.875']), ['43']);
		assert.deepEqual(vectorAddDecimalRecursive(['0'], ['-0.0']), ['0']);
	});

	test('even, odd, and larger vector lengths exercise recursive splitting', () => {
		const a = Array.from({ length: 17 }, (_, i) => `${i}.1`);
		const b = Array.from({ length: 17 }, (_, i) => `${i * 2}.9`);
		const expected = Array.from({ length: 17 }, (_, i) => `${i * 3 + 1}`);
		assert.deepEqual(vectorAddDecimalRecursive(a, b), expected);

		const aLarge = Array.from({ length: 257 }, (_, i) => `${i}.${String(i).padStart(3, '0')}`);
		const bLarge = Array.from({ length: 257 }, (_, i) => `-${i}.${String(i).padStart(3, '0')}`);
		assert.deepEqual(
			vectorAddDecimalRecursive(aLarge, bLarge),
			Array(257).fill('0')
		);
	});

	test('high-precision (>30 digits) integer and fractional arithmetic', () => {
		const a = [
			'1234567890123456789012345678901234567890.00000000000000000000000000000000001',
			'0.1111111111111111111111111111111111111111',
			'99999999999999999999999999999999999999.999999999999999999999999999999999999'
		];
		const b = [
			'8765432109876543210987654321098765432109.99999999999999999999999999999999999',
			'0.2222222222222222222222222222222222222222',
			'0.000000000000000000000000000000000001'
		];
		assert.deepEqual(vectorAddDecimalRecursive(a, b, 45), [
			'10000000000000000000000000000000000000000',
			'0.3333333333333333333333333333333333333333',
			'100000000000000000000000000000000000000'
		]);
	});

	test('negative values, cancellation, and no negative zero', () => {
		assert.deepEqual(
			vectorAddDecimalRecursive(
				['-5.5', '-10.25', '7.125', '-0.001'],
				['5.5', '-2.75', '-10.5', '0.001']
			),
			['0', '-13', '-3.375', '0']
		);
		assert.deepEqual(
			vectorAddDecimalRecursive(['-0.0004'], ['0'], 2),
			['0']
		);
	});

	test('rounding to configurable precision (half-away-from-zero)', () => {
		assert.deepEqual(
			vectorAddDecimalRecursive(['0.125', '0.124', '-0.125', '-0.124', '9.995'], ['0', '0', '0', '0', '0'], 2),
			['0.13', '0.12', '-0.13', '-0.12', '10']
		);
		// precision = 0 rounds to integer
		assert.deepEqual(
			vectorAddDecimalRecursive(['1.5', '1.499999', '-1.5', '-1.499999'], ['0', '0', '0', '0'], 0),
			['2', '1', '-2', '-1']
		);
		// default precision = 20 rounds the 21st fractional digit
		assert.deepEqual(
			vectorAddDecimalRecursive(
				['0.000000000000000000005', '0.000000000000000000004'],
				['0', '0']
			),
			['0.00000000000000000001', '0']
		);
	});

	test('input validation rejects invalid arguments', () => {
		// Non-array vectors
		assert.throws(() => vectorAddDecimalRecursive('1', ['1']), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], null), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(undefined, []), TypeError);

		// Mismatched lengths
		assert.throws(() => vectorAddDecimalRecursive(['1', '2'], ['1']), RangeError);
		assert.throws(() => vectorAddDecimalRecursive([], ['0']), RangeError);

		// Invalid precision
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], '20'), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], null), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], -1), RangeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], 2.5), RangeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], NaN), RangeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], Infinity), RangeError);

		// Non-string elements
		assert.throws(() => vectorAddDecimalRecursive([1], ['1']), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(['1'], [null]), TypeError);
		assert.throws(() => vectorAddDecimalRecursive(['1', 2n], ['1', '2']), TypeError);

		// Invalid decimal strings
		for (const bad of ['', ' ', ' 1.2', '1.2 ', 'abc', '1.2.3', '.', '+.', '-.', '--1', 'NaN', 'Infinity', '1e5', '1_000']) {
			assert.throws(() => vectorAddDecimalRecursive([bad], ['0']), RangeError, `expected RangeError for "${bad}"`);
			assert.throws(() => vectorAddDecimalRecursive(['0'], [bad]), RangeError, `expected RangeError for "${bad}"`);
		}
	});

	test('cross-checks: commutativity, associativity, and independent iterative reference', () => {
		const a = [
			'123456789012345678901234567890.1234567890123456789012345678901',
			'-98765432109876543210987654321.0000000000000000000000000000009',
			'0.0000000000000000000000000000000000005',
			'42',
			'-0.75'
		];
		const b = [
			'-123456789012345678901234567890.0234567890123456789012345678901',
			'98765432109876543210987654321.5000000000000000000000000000009',
			'0.0000000000000000000000000000000000005',
			'-42.25',
			'0.75'
		];
		const c = [
			'0.9',
			'-0.5',
			'-0.000000000000000000000000000000000001',
			'100.25',
			'-1.125'
		];

		// Commutativity: A + B === B + A (both exact and rounded)
		assert.deepEqual(
			vectorAddDecimalRecursive(a, b, 40),
			vectorAddDecimalRecursive(b, a, 40)
		);
		assert.deepEqual(
			vectorAddDecimalRecursive(a, b, 10),
			vectorAddDecimalRecursive(b, a, 10)
		);

		// Associativity at exact precision: (A + B) + C === A + (B + C)
		const abThenC = vectorAddDecimalRecursive(vectorAddDecimalRecursive(a, b, 50), c, 50);
		const aThenBC = vectorAddDecimalRecursive(a, vectorAddDecimalRecursive(b, c, 50), 50);
		assert.deepEqual(abThenC, aThenBC);

		// Independent iterative BigInt reference check across multiple precisions
		for (const p of [0, 2, 10, 20, 40]) {
			assert.deepEqual(
				vectorAddDecimalRecursive(a, b, p),
				iterativeReferenceAdd(a, b, p)
			);
		}
	});
});
