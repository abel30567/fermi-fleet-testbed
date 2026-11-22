import { describe, test } from 'node:test';
import assert from 'node:assert';
import { divideTypedRecursive } from './divideTypedRecursive.js';

describe('divideTypedRecursive', () => {
	describe('normal cases across lengths', () => {
		test('empty Float64Arrays (length 0)', () => {
			const a = new Float64Array(0);
			const b = new Float64Array(0);
			const result = divideTypedRecursive(a, b);
			assert.ok(result instanceof Float64Array);
			assert.strictEqual(result.length, 0);
			assert.notStrictEqual(result, a);
			assert.notStrictEqual(result, b);
		});

		test('single-element Float64Arrays (length 1)', () => {
			const a = new Float64Array([15]);
			const b = new Float64Array([3]);
			const result = divideTypedRecursive(a, b);
			assert.ok(result instanceof Float64Array);
			assert.deepStrictEqual(result, new Float64Array([5]));
		});

		test('even-length Float64Arrays (lengths 2 and 4)', () => {
			const res2 = divideTypedRecursive(
				new Float64Array([10, 20]),
				new Float64Array([2, 4])
			);
			assert.deepStrictEqual(res2, new Float64Array([5, 5]));

			const res4 = divideTypedRecursive(
				new Float64Array([8, 9, 10, 12]),
				new Float64Array([2, 3, 5, 4])
			);
			assert.deepStrictEqual(res4, new Float64Array([4, 3, 2, 3]));
		});

		test('odd-length Float64Arrays (lengths 3 and 5)', () => {
			const res3 = divideTypedRecursive(
				new Float64Array([9, 16, 25]),
				new Float64Array([3, 4, 5])
			);
			assert.deepStrictEqual(res3, new Float64Array([3, 4, 5]));

			const res5 = divideTypedRecursive(
				new Float64Array([2, 6, 12, 20, 30]),
				new Float64Array([1, 2, 3, 4, 5])
			);
			assert.deepStrictEqual(res5, new Float64Array([2, 3, 4, 5, 6]));
		});

		test('larger Float64Arrays (power-of-two and non-power-of-two)', () => {
			for (const len of [1024, 1025, 4099]) {
				const a = new Float64Array(len);
				const b = new Float64Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = (i + 1) * 3;
					b[i] = i + 1;
				}
				const result = divideTypedRecursive(a, b);
				assert.ok(result instanceof Float64Array);
				assert.strictEqual(result.length, len);
				for (let i = 0; i < len; i++) {
					assert.strictEqual(result[i], 3);
				}
			}
		});
	});

	describe('edge cases', () => {
		test('negative values and sign combinations', () => {
			const a = new Float64Array([-10, 10, -10, 0, -0]);
			const b = new Float64Array([2, -2, -2, 5, 5]);
			const result = divideTypedRecursive(a, b);
			assert.strictEqual(result[0], -5);
			assert.strictEqual(result[1], -5);
			assert.strictEqual(result[2], 5);
			assert.ok(Object.is(result[3], 0));
			assert.ok(Object.is(result[4], -0));
		});

		test('decimals and floating-point values', () => {
			const a = new Float64Array([0.3, 1, 7.5, 1e-100, 1e100]);
			const b = new Float64Array([0.1, 3, 2.5, 1e-50, 1e50]);
			const result = divideTypedRecursive(a, b);
			assert.strictEqual(result[0], 0.3 / 0.1);
			assert.strictEqual(result[1], 1 / 3);
			assert.strictEqual(result[2], 3);
			assert.strictEqual(result[3], 1e-100 / 1e-50);
			assert.strictEqual(result[4], 1e100 / 1e50);
		});

		test('special IEEE 754 values (NaN and Infinity)', () => {
			const a = new Float64Array([NaN, Infinity, -Infinity, 1, Infinity]);
			const b = new Float64Array([2, 2, 2, Infinity, Infinity]);
			const result = divideTypedRecursive(a, b);
			assert.ok(Number.isNaN(result[0]));
			assert.strictEqual(result[1], Infinity);
			assert.strictEqual(result[2], -Infinity);
			assert.strictEqual(result[3], 0);
			assert.ok(Number.isNaN(result[4]));
		});

		test('division by zero throws RangeError (including -0 and various positions)', () => {
			assert.throws(
				() => divideTypedRecursive(new Float64Array([1]), new Float64Array([0])),
				RangeError
			);
			assert.throws(
				() => divideTypedRecursive(new Float64Array([1]), new Float64Array([-0])),
				RangeError
			);
			assert.throws(
				() =>
					divideTypedRecursive(
						new Float64Array([1, 2, 3, 4, 5]),
						new Float64Array([0, 2, 3, 4, 5])
					),
				RangeError
			);
			assert.throws(
				() =>
					divideTypedRecursive(
						new Float64Array([1, 2, 3, 4, 5]),
						new Float64Array([1, 2, 0, 4, 5])
					),
				RangeError
			);
			assert.throws(
				() =>
					divideTypedRecursive(
						new Float64Array([1, 2, 3, 4, 5]),
						new Float64Array([1, 2, 3, 4, -0])
					),
				RangeError
			);
		});

		test('non-Float64Array inputs throw TypeError', () => {
			const valid = new Float64Array([1, 2]);
			const invalidInputs = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				null,
				undefined,
				42,
				'12',
				{ 0: 1, 1: 2, length: 2 }
			];

			for (const bad of invalidInputs) {
				assert.throws(() => divideTypedRecursive(bad, valid), TypeError);
				assert.throws(() => divideTypedRecursive(valid, bad), TypeError);
			}
			assert.throws(() => divideTypedRecursive([1], [1]), TypeError);
		});

		test('mismatched lengths throw RangeError', () => {
			assert.throws(
				() =>
					divideTypedRecursive(
						new Float64Array([1, 2]),
						new Float64Array([1, 2, 3])
					),
				RangeError
			);
			assert.throws(
				() =>
					divideTypedRecursive(new Float64Array([]), new Float64Array([1])),
				RangeError
			);
			assert.throws(
				() =>
					divideTypedRecursive(
						new Float64Array([1, 2, 3, 4]),
						new Float64Array([1, 2])
					),
				RangeError
			);
		});

		test('input arrays are not mutated and output is a new Float64Array', () => {
			const a = new Float64Array([10, -20.5, 33, 4.25, -7]);
			const b = new Float64Array([2, 4.1, -3, 0.5, -2]);
			const aSnapshot = new Float64Array(a);
			const bSnapshot = new Float64Array(b);

			const result = divideTypedRecursive(a, b);

			assert.notStrictEqual(result, a);
			assert.notStrictEqual(result, b);
			assert.deepStrictEqual(a, aSnapshot);
			assert.deepStrictEqual(b, bSnapshot);

			// Mutating the output must not affect inputs
			result[0] = 999999;
			assert.deepStrictEqual(a, aSnapshot);
			assert.deepStrictEqual(b, bSnapshot);
		});
	});

	describe('cross-check against independent iterative computation', () => {
		test('matches iterative division bit-for-bit across varied lengths and values', () => {
			// Deterministic LCG for reproducible floating-point test vectors
			let state = 0x12345678;
			const nextFloat = () => {
				state = (Math.imul(1664525, state) + 1013904223) >>> 0;
				return state / 0x100000000;
			};

			const lengths = [0, 1, 2, 3, 7, 16, 31, 128, 257, 1500];
			for (const len of lengths) {
				const a = new Float64Array(len);
				const b = new Float64Array(len);
				const expected = new Float64Array(len);

				for (let i = 0; i < len; i++) {
					const dividend = (nextFloat() - 0.5) * 1e6;
					// Ensure non-zero divisor with both positive and negative values
					let divisor = (nextFloat() - 0.5) * 1e3;
					if (Math.abs(divisor) < 1e-6) {
						divisor = i % 2 === 0 ? 1.5 : -1.5;
					}
					a[i] = dividend;
					b[i] = divisor;
					expected[i] = dividend / divisor;
				}

				const actual = divideTypedRecursive(a, b);
				assert.ok(actual instanceof Float64Array);
				assert.strictEqual(actual.length, expected.length);
				for (let i = 0; i < len; i++) {
					assert.ok(
						Object.is(actual[i], expected[i]),
						`Mismatch at length=${len}, index=${i}: got ${actual[i]}, expected ${expected[i]}`
					);
				}
			}
		});
	});
});
