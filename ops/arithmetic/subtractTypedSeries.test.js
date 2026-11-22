import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractTypedSeries } from './subtractTypedSeries.js';

/**
 * Independent helper asserting element-wise closeness of two Float64Arrays.
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [eps=1e-12]
 */
function assertArraysClose(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length, 'array lengths must match');
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(actual[i]), Math.abs(expected[i]));
		assert.ok(
			diff <= eps * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
		);
	}
}

describe('subtractTypedSeries', () => {
	describe('normal cases', () => {
		it('subtracts two Float64Arrays element-wise', () => {
			const a = new Float64Array([10, 2.5, -3, 0, 100.75]);
			const b = new Float64Array([4, 1.25, -8, 0, 0.75]);
			const res = subtractTypedSeries(a, b);

			assert.ok(res instanceof Float64Array);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(res, new Float64Array([6, 1.25, 5, 0, 100]));
		});

		it('subtracts a series of three or more Float64Arrays element-wise', () => {
			const a = new Float64Array([100, -10, 5.5, 0]);
			const b = new Float64Array([20, 5, 1.5, -3]);
			const c = new Float64Array([30, -20, 2.0, 4]);
			const d = new Float64Array([10, 3, 0.5, -1]);

			const res = subtractTypedSeries(a, b, c, d);
			assert.deepEqual(res, new Float64Array([40, 2, 1.5, 0]));
		});

		it('does not mutate input Float64Arrays', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5, 6]);
			const c = new Float64Array([7, 8, 9]);
			const aCopy = new Float64Array(a);
			const bCopy = new Float64Array(b);
			const cCopy = new Float64Array(c);

			subtractTypedSeries(a, b, c);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
			assert.deepEqual(c, cCopy);
		});

		it('supports aliased input references (same Float64Array passed multiple times)', () => {
			const a = new Float64Array([3, -7, 1.5]);
			const res = subtractTypedSeries(a, a, a);
			assert.deepEqual(res, new Float64Array([-3, 7, -1.5]));
		});

		it('works on Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 10, 20, 30, 888, 1, 2, 3, 777]);
			const a = backing.subarray(1, 4);
			const b = backing.subarray(5, 8);
			const res = subtractTypedSeries(a, b);
			assert.deepEqual(res, new Float64Array([9, 18, 27]));
		});
	});

	describe('edge cases and compensated accuracy', () => {
		it('handles empty Float64Arrays (length 0)', () => {
			const empty1 = new Float64Array(0);
			const empty2 = new Float64Array(0);
			const empty3 = new Float64Array(0);

			const res2 = subtractTypedSeries(empty1, empty2);
			assert.ok(res2 instanceof Float64Array);
			assert.equal(res2.length, 0);

			const res3 = subtractTypedSeries(empty1, empty2, empty3);
			assert.ok(res3 instanceof Float64Array);
			assert.equal(res3.length, 0);
		});

		it('handles single-element Float64Arrays', () => {
			assert.deepEqual(
				subtractTypedSeries(new Float64Array([42.5]), new Float64Array([0.5])),
				new Float64Array([42])
			);
		});

		it('normalizes -0 to +0 in output', () => {
			const a = new Float64Array([-0, 0, -0]);
			const b = new Float64Array([0, -0, -0]);
			const res = subtractTypedSeries(a, b);
			for (let i = 0; i < res.length; i++) {
				assert.ok(Object.is(res[i], 0), `index ${i} should be +0, got ${res[i]}`);
			}

			const resMulti = subtractTypedSeries(
				new Float64Array([-0]),
				new Float64Array([0]),
				new Float64Array([0])
			);
			assert.ok(Object.is(resMulti[0], 0));
		});

		it('preserves accuracy under catastrophic cancellation via TwoSum/Neumaier compensation', () => {
			// Naive left-to-right: (((1e16 - (-1)) - 1e16) - (-1)) = ((1e16 - 1e16) + 1) = 1 (wrong; exact is 2)
			const a = new Float64Array([1e16, 1e16, 1e-15]);
			const b0 = new Float64Array([-1, -0.5, 1e16]);
			const b1 = new Float64Array([1e16, -0.5, -1e16]);
			const b2 = new Float64Array([-1, 1e16, 0]);

			const res = subtractTypedSeries(a, b0, b1, b2);
			assert.equal(res[0], 2);
			assert.equal(res[1], 1);
			assert.equal(res[2], 1e-15);
		});

		it('handles multi-scale cancellation across 5 subtrahends', () => {
			// 1e16 - (-1e-15 - 1e8 + 1e16 + 1e8) === 1e-15
			const a = new Float64Array([1e16]);
			const b0 = new Float64Array([-1e-15]);
			const b1 = new Float64Array([-1e8]);
			const b2 = new Float64Array([1e16]);
			const b3 = new Float64Array([1e8]);

			const res = subtractTypedSeries(a, b0, b1, b2, b3);
			assert.equal(res[0], 1e-15);
		});

		it('handles very small subnormal values and large finite values without overflow', () => {
			const a = new Float64Array([Number.MIN_VALUE, 1e300, -1e300]);
			const b = new Float64Array([Number.MIN_VALUE, 1e300, -1e300]);
			const res = subtractTypedSeries(a, b);
			assert.deepEqual(res, new Float64Array([0, 0, 0]));
		});
	});

	describe('mathematical identity cross-checks', () => {
		it('satisfies self-subtraction identity: a - a = 0', () => {
			const a = new Float64Array([0, -0, 1, -1, Math.PI, -Math.E, 1e150, -1e-150]);
			const res = subtractTypedSeries(a, a);
			for (let i = 0; i < res.length; i++) {
				assert.ok(Object.is(res[i], 0), `expected +0 at index ${i}`);
			}
		});

		it('satisfies inverse addition identity: (a - b) + b = a and (a - b - c) + b + c = a', () => {
			const a = new Float64Array([1.25, -7.5, 100.125, 0, 3.141592653589793, -42.75]);
			const b = new Float64Array([0.5, 3.25, -25.875, 9.5, 2.718281828459045, 12.25]);
			const c = new Float64Array([-2.75, 1.5, 10.0, -9.5, 1.4142135623730951, -5.5]);

			const diff2 = subtractTypedSeries(a, b);
			const reconstructed2 = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				reconstructed2[i] = diff2[i] + b[i];
			}
			assertArraysClose(reconstructed2, a, 1e-15);

			const diff3 = subtractTypedSeries(a, b, c);
			const reconstructed3 = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				reconstructed3[i] = diff3[i] + b[i] + c[i];
			}
			assertArraysClose(reconstructed3, a, 1e-14);
		});

		it('satisfies anti-commutativity: (a - b) = -(b - a)', () => {
			const a = new Float64Array([5.5, -12.25, 0, 1e-7, 1e9, 42]);
			const b = new Float64Array([-3.5, 8.75, 0, -2e-7, 5e8, 42]);

			const ab = subtractTypedSeries(a, b);
			const ba = subtractTypedSeries(b, a);
			for (let i = 0; i < a.length; i++) {
				const negBa = ba[i] === 0 ? 0 : -ba[i];
				assert.ok(Object.is(ab[i], negBa), `index ${i}: ${ab[i]} !== ${negBa}`);
			}
		});

		it('satisfies additive identity with zero subtrahend: a - 0 = a', () => {
			const a = new Float64Array([1.5, -2.5, 0, 1e12, -1e-12]);
			const zeros = new Float64Array(a.length);
			assert.deepEqual(subtractTypedSeries(a, zeros), a);
			assert.deepEqual(subtractTypedSeries(a, zeros, zeros, zeros), a);
		});

		it('is invariant under permutation of subtrahends', () => {
			const a = new Float64Array([1e16, 50.25, -100.5, 0.125]);
			const b = new Float64Array([1e16, -12.75, 33.25, -0.5]);
			const c = new Float64Array([-3.5, 25.0, -77.75, 1.25]);
			const d = new Float64Array([1.5, 0.5, 44.0, -0.875]);

			const p1 = subtractTypedSeries(a, b, c, d);
			const p2 = subtractTypedSeries(a, c, d, b);
			const p3 = subtractTypedSeries(a, d, b, c);

			assertArraysClose(p1, p2, 1e-15);
			assertArraysClose(p1, p3, 1e-15);
		});

		it('matches an independent exact BigInt dyadic reference computation', () => {
			// Generate deterministic pseudo-random dyadic rationals k / 2^10 (exact in IEEE 754 float64)
			const n = 128;
			const numSubtrahends = 6;
			const scale = 1024; // 2^10
			let seed = 0x12345678;
			const nextInt = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
				return seed >> 8; // 24-bit signed integer
			};

			const minuendBig = new Array(n);
			const minuend = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				const v = BigInt(nextInt());
				minuendBig[i] = v;
				minuend[i] = Number(v) / scale;
			}

			const subBigs = [];
			const subs = [];
			for (let k = 0; k < numSubtrahends; k++) {
				const arrBig = new Array(n);
				const arr = new Float64Array(n);
				for (let i = 0; i < n; i++) {
					const v = BigInt(nextInt());
					arrBig[i] = v;
					arr[i] = Number(v) / scale;
				}
				subBigs.push(arrBig);
				subs.push(arr);
			}

			const actual = subtractTypedSeries(minuend, ...subs);

			for (let i = 0; i < n; i++) {
				let exactNumerator = minuendBig[i];
				for (let k = 0; k < numSubtrahends; k++) {
					exactNumerator -= subBigs[k][i];
				}
				const expected = Number(exactNumerator) / scale;
				assert.equal(actual[i], expected, `exact dyadic mismatch at index ${i}`);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when minuend is not a Float64Array', () => {
			const b = new Float64Array([1, 2]);
			for (const bad of [
				undefined,
				null,
				42,
				'abc',
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				{}
			]) {
				assert.throws(() => subtractTypedSeries(bad, b), TypeError);
			}
		});

		it('throws RangeError when no subtrahends are provided', () => {
			assert.throws(() => subtractTypedSeries(new Float64Array([1, 2])), RangeError);
		});

		it('throws TypeError when any subtrahend is not a Float64Array', () => {
			const a = new Float64Array([1, 2]);
			const valid = new Float64Array([3, 4]);
			for (const bad of [
				undefined,
				null,
				1,
				[1, 2],
				new Float32Array([1, 2]),
				new Uint8Array([1, 2]),
				{}
			]) {
				assert.throws(() => subtractTypedSeries(a, bad), TypeError);
				assert.throws(() => subtractTypedSeries(a, valid, bad), TypeError);
			}
		});

		it('throws RangeError on mismatched array lengths', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([1, 2]);
			const c = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => subtractTypedSeries(a, b), RangeError);
			assert.throws(() => subtractTypedSeries(a, a, c), RangeError);
		});

		it('throws RangeError on NaN, Infinity, or -Infinity in any input', () => {
			const valid = new Float64Array([1, 2]);
			for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				const badArr = new Float64Array([1, badVal]);
				assert.throws(() => subtractTypedSeries(badArr, valid), RangeError);
				assert.throws(() => subtractTypedSeries(valid, badArr), RangeError);
				assert.throws(() => subtractTypedSeries(valid, valid, badArr), RangeError);
			}
		});

		it('throws RangeError when subtraction overflows to a non-finite value', () => {
			const max = new Float64Array([Number.MAX_VALUE]);
			const negMax = new Float64Array([-Number.MAX_VALUE]);
			assert.throws(() => subtractTypedSeries(max, negMax), RangeError);
			assert.throws(() => subtractTypedSeries(negMax, max), RangeError);
			assert.throws(() => subtractTypedSeries(max, negMax, new Float64Array([0])), RangeError);
		});
	});
});
