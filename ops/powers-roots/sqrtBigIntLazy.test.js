import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtBigIntLazy } from './sqrtBigIntLazy.js';

const SCALE = 10n ** 18n;
const SCALE_SQUARED = 10n ** 36n;

/**
 * Independent binary-search integer square root for cross-checking Newton's method.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function binarySearchIsqrt(m) {
	if (m < 2n) return m;
	let lo = 1n;
	let hi = 1n;
	while (hi * hi <= m) {
		lo = hi;
		hi <<= 1n;
	}
	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid <= m) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

describe('sqrtBigIntLazy', () => {
	describe('single BigInt values', () => {
		it('handles zero', () => {
			assert.equal(sqrtBigIntLazy(0n), 0n);
		});

		it('computes exact scaled roots for perfect squares', () => {
			assert.equal(sqrtBigIntLazy(1n), 1n * SCALE);
			assert.equal(sqrtBigIntLazy(4n), 2n * SCALE);
			assert.equal(sqrtBigIntLazy(9n), 3n * SCALE);
			assert.equal(sqrtBigIntLazy(16n), 4n * SCALE);
			assert.equal(sqrtBigIntLazy(100n), 10n * SCALE);
			assert.equal(sqrtBigIntLazy(1_000_000n), 1_000n * SCALE);
			assert.equal(sqrtBigIntLazy(10n ** 12n), 10n ** 6n * SCALE);
		});

		it('computes fixed-point roots scaled by 10^18 for non-perfect squares', () => {
			assert.equal(sqrtBigIntLazy(2n), 1_414_213_562_373_095_048n);
			assert.equal(sqrtBigIntLazy(3n), 1_732_050_807_568_877_293n);
			assert.equal(sqrtBigIntLazy(5n), 2_236_067_977_499_789_696n);
			assert.equal(sqrtBigIntLazy(10n), 3_162_277_660_168_379_331n);
		});

		it('handles very large BigInts accurately', () => {
			const base = 10n ** 100n;
			const exactSquare = base * base;
			assert.equal(sqrtBigIntLazy(exactSquare), base * SCALE);

			// Just below and just above a huge perfect square
			const justBelow = exactSquare - 1n;
			const rBelow = sqrtBigIntLazy(justBelow);
			assert.ok(rBelow * rBelow <= justBelow * SCALE_SQUARED);
			assert.ok((rBelow + 1n) * (rBelow + 1n) > justBelow * SCALE_SQUARED);

			const justAbove = exactSquare + 1n;
			const rAbove = sqrtBigIntLazy(justAbove);
			assert.ok(rAbove * rAbove <= justAbove * SCALE_SQUARED);
			assert.ok((rAbove + 1n) * (rAbove + 1n) > justAbove * SCALE_SQUARED);

			// 1024-bit non-square
			const huge = (1n << 1024n) + 987_654_321_012_345_678_901n;
			const rHuge = sqrtBigIntLazy(huge);
			assert.ok(rHuge * rHuge <= huge * SCALE_SQUARED);
			assert.ok((rHuge + 1n) * (rHuge + 1n) > huge * SCALE_SQUARED);
		});
	});

	describe('lazy / streaming iterable consumption', () => {
		it('streams results from arrays, sets, and BigUint64Array', () => {
			const arrGen = sqrtBigIntLazy([0n, 1n, 2n, 4n, 9n]);
			assert.equal(typeof arrGen.next, 'function');
			assert.equal(typeof arrGen[Symbol.iterator], 'function');
			assert.deepEqual([...arrGen], [
				0n,
				1n * SCALE,
				1_414_213_562_373_095_048n,
				2n * SCALE,
				3n * SCALE,
			]);

			const setResults = [...sqrtBigIntLazy(new Set([16n, 25n]))];
			assert.deepEqual(setResults, [4n * SCALE, 5n * SCALE]);

			const typedResults = [...sqrtBigIntLazy(new BigUint64Array([0n, 36n, 49n]))];
			assert.deepEqual(typedResults, [0n, 6n * SCALE, 7n * SCALE]);
		});

		it('handles empty iterables', () => {
			assert.deepEqual([...sqrtBigIntLazy([])], []);
			function* empty() {}
			assert.deepEqual([...sqrtBigIntLazy(empty())], []);
		});

		it('consumes infinite generators lazily on demand and closes cleanly on early break', () => {
			let pulled = 0;
			let closed = false;

			function* infiniteSquares() {
				try {
					let i = 0n;
					while (true) {
						pulled += 1;
						yield i * i;
						i += 1n;
					}
				} finally {
					closed = true;
				}
			}

			const stream = sqrtBigIntLazy(infiniteSquares());
			// Constructing the stream must not pull any item yet.
			assert.equal(pulled, 0);
			assert.equal(closed, false);

			assert.deepEqual(stream.next(), { value: 0n, done: false });
			assert.equal(pulled, 1);

			assert.deepEqual(stream.next(), { value: 1n * SCALE, done: false });
			assert.equal(pulled, 2);

			assert.deepEqual(stream.next(), { value: 2n * SCALE, done: false });
			assert.equal(pulled, 3);

			// Early break via for...of must pull only needed elements and run finally block.
			const taken = [];
			for (const root of stream) {
				taken.push(root);
				if (taken.length === 2) break;
			}
			assert.deepEqual(taken, [3n * SCALE, 4n * SCALE]);
			assert.equal(pulled, 5);
			assert.equal(closed, true);
		});

		it('validates elements lazily during streaming', () => {
			const negStream = sqrtBigIntLazy([4n, -1n, 9n]);
			assert.equal(negStream.next().value, 2n * SCALE);
			assert.throws(() => negStream.next(), RangeError);

			const badTypeStream = sqrtBigIntLazy([9n, 16, 25n]);
			assert.equal(badTypeStream.next().value, 3n * SCALE);
			assert.throws(() => badTypeStream.next(), TypeError);
		});
	});

	describe('input validation', () => {
		it('rejects negative BigInts with RangeError', () => {
			assert.throws(() => sqrtBigIntLazy(-1n), RangeError);
			assert.throws(() => sqrtBigIntLazy(-4n), RangeError);
			assert.throws(() => sqrtBigIntLazy(-(10n ** 50n)), RangeError);
		});

		it('rejects non-BigInt primitives and non-iterable objects with TypeError', () => {
			const invalidInputs = [
				0,
				4,
				-4,
				2.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				'4',
				new String('4'),
				null,
				undefined,
				true,
				false,
				{},
				Symbol('4'),
				() => 4n,
			];

			for (const bad of invalidInputs) {
				assert.throws(
					() => sqrtBigIntLazy(bad),
					TypeError,
					`Expected TypeError for input: ${String(bad)}`,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies r^2 <= n * 10^36 < (r + 1)^2 across diverse integers', () => {
			const samples = [];
			for (let i = 0n; i <= 200n; i += 1n) {
				samples.push(i);
			}
			for (let k = 1n; k <= 128n; k *= 2n) {
				const p = 1n << k;
				samples.push(p - 1n, p, p + 1n);
			}
			samples.push(
				10n ** 37n + 7n,
				(10n ** 60n) + 314_159_265_358_979_323n,
				(1n << 521n) - 1n,
			);

			let index = 0;
			for (const r of sqrtBigIntLazy(samples)) {
				const n = samples[index++];
				const scaled = n * SCALE_SQUARED;
				assert.ok(
					r * r <= scaled,
					`Upper bound violated for n=${n}: r^2 > n*10^36`,
				);
				assert.ok(
					(r + 1n) * (r + 1n) > scaled,
					`Lower bound violated for n=${n}: (r+1)^2 <= n*10^36`,
				);
			}
		});

		it('matches independent binary-search isqrt implementation', () => {
			const values = [
				0n,
				1n,
				2n,
				3n,
				7n,
				8n,
				15n,
				16n,
				17n,
				123_456_789n,
				(1n << 128n) - 1n,
				(1n << 256n) + 42n,
			];

			const actual = [...sqrtBigIntLazy(values)];
			const expected = values.map((n) => binarySearchIsqrt(n * SCALE_SQUARED));
			assert.deepEqual(actual, expected);
		});

		it('agrees with Math.sqrt within IEEE-754 precision for safe integers', () => {
			const nums = [0, 1, 2, 3, 5, 7, 13, 42, 999, 123_456, 987_654_321];
			for (const num of nums) {
				const r = sqrtBigIntLazy(BigInt(num));
				const approx = Number(r) / 1e18;
				const expected = Math.sqrt(num);
				assert.ok(
					Math.abs(approx - expected) <= 1e-12 * Math.max(1, expected),
					`Mismatch for ${num}: approx=${approx}, expected=${expected}`,
				);
			}
		});
	});
});
