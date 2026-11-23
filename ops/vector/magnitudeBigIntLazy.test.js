import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeBigIntLazy } from './magnitudeBigIntLazy.js';

const SCALE = 10n ** 18n;
const SCALE_SQ = 10n ** 36n;

/**
 * Asserts that `result` is the exact nearest integer to sqrt(sumSq * 10^36).
 * For N > 0, round(sqrt(N)) = r iff (2r - 1)^2 < 4N < (2r + 1)^2.
 */
function assertExactRoundedSqrt(result, sumSq) {
	if (sumSq === 0n) {
		assert.equal(result, 0n);
		return;
	}
	const scaledSumSq = sumSq * SCALE_SQ;
	const fourN = 4n * scaledSumSq;
	const lower = (2n * result - 1n) ** 2n;
	const upper = (2n * result + 1n) ** 2n;
	assert.ok(
		lower < fourN && fourN < upper,
		`Expected ${result} to be nearest integer to sqrt(${scaledSumSq})`
	);
}

describe('magnitudeBigIntLazy', () => {
	it('computes exact magnitudes for Pythagorean triples and integer-norm vectors', () => {
		assert.equal(magnitudeBigIntLazy([3n, 4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntLazy([5n, 12n]), 13n * SCALE);
		assert.equal(magnitudeBigIntLazy([8n, 15n]), 17n * SCALE);
		assert.equal(magnitudeBigIntLazy([2n, 3n, 6n]), 7n * SCALE);
		assert.equal(magnitudeBigIntLazy([1n, 1n, 1n, 1n]), 2n * SCALE);
		assert.equal(magnitudeBigIntLazy([7n]), 7n * SCALE);
	});

	it('computes fixed-point rounded magnitudes for non-integer norms', () => {
		// sqrt(2) = 1.4142135623730950488016887... -> ...5049
		assert.equal(magnitudeBigIntLazy([1n, 1n]), 1414213562373095049n);
		// sqrt(3) = 1.7320508075688772935274463... -> ...7294
		assert.equal(magnitudeBigIntLazy([1n, 1n, 1n]), 1732050807568877294n);
		// sqrt(5) = 2.2360679774997896964091736... -> ...9696
		assert.equal(magnitudeBigIntLazy([1n, 2n]), 2236067977499789696n);
	});

	it('handles empty vector and zero vectors', () => {
		assert.equal(magnitudeBigIntLazy([]), 0n);
		assert.equal(magnitudeBigIntLazy([0n]), 0n);
		assert.equal(magnitudeBigIntLazy([0n, 0n, 0n, 0n]), 0n);
		assert.equal(magnitudeBigIntLazy((function* () {})()), 0n);
	});

	it('handles negative components identically to positive components', () => {
		assert.equal(magnitudeBigIntLazy([-3n, -4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntLazy([-3n, 4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntLazy([3n, -4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntLazy([-7n]), 7n * SCALE);
		assert.equal(magnitudeBigIntLazy([-1n, -1n]), 1414213562373095049n);
	});

	it('handles huge BigInt components far beyond Number.MAX_VALUE', () => {
		const k = 10n ** 50n;
		assert.equal(magnitudeBigIntLazy([3n * k, 4n * k]), 5n * k * SCALE);

		// 10^400 overflows IEEE 754 double (~1.8e308)
		const huge = 10n ** 400n;
		const res = magnitudeBigIntLazy([huge, huge]);
		assertExactRoundedSqrt(res, 2n * huge * huge);
	});

	it('consumes lazy generators, Sets, BigInt64Arrays, and custom iterables', () => {
		function* genPythagorean() {
			yield 3n;
			yield 4n;
		}
		assert.equal(magnitudeBigIntLazy(genPythagorean()), 5n * SCALE);

		assert.equal(magnitudeBigIntLazy(new Set([3n, 4n])), 5n * SCALE);
		assert.equal(magnitudeBigIntLazy(new BigInt64Array([-6n, 8n])), 10n * SCALE);

		const customIterable = {
			*[Symbol.iterator]() {
				yield 2n;
				yield -3n;
				yield 6n;
			}
		};
		assert.equal(magnitudeBigIntLazy(customIterable), 7n * SCALE);
	});

	it('streams large generators in O(1) memory and fails fast on invalid elements', () => {
		// 100,000 ones -> sumSq = 100,000, sqrt(100,000) = 100 * sqrt(10)
		function* hundredThousandOnes() {
			for (let i = 0; i < 100_000; i++) {
				yield 1n;
			}
		}
		const streamResult = magnitudeBigIntLazy(hundredThousandOnes());
		assertExactRoundedSqrt(streamResult, 100_000n);

		// Verify lazy fail-fast: stops consuming generator upon invalid element
		let consumed = 0;
		function* badStream() {
			consumed += 1;
			yield 3n;
			consumed += 1;
			yield 4; // invalid (number, not bigint)
			consumed += 1;
			yield 5n;
		}
		assert.throws(() => magnitudeBigIntLazy(badStream()), TypeError);
		assert.equal(consumed, 2);
	});

	it('throws TypeError on invalid inputs', () => {
		const invalidVectors = [
			null,
			undefined,
			42,
			42n,
			true,
			'34',
			{},
			{ next: () => ({ done: true }) },
			[3, 4],
			[3n, 4],
			[3n, '4'],
			[3n, null],
			[3n, undefined],
			[3n, NaN],
			[3n, {}]
		];

		for (const input of invalidVectors) {
			assert.throws(() => magnitudeBigIntLazy(input), TypeError);
		}
	});

	it('cross-checks exact rounding inequality and Math.hypot across diverse vectors', () => {
		const vectors = [
			[1n, 2n, 3n],
			[7n, 11n, 13n, 17n],
			[-123n, 456n, -789n],
			[999999n, 1234567n, 8901234n],
			[0n, 1n, 0n, 2n, 0n, 3n, 0n, 4n],
			[1000000007n, -998244353n, 123456789n]
		];

		for (const vec of vectors) {
			const result = magnitudeBigIntLazy(vec);
			const sumSq = vec.reduce((acc, x) => acc + x * x, 0n);

			// Exact algebraic cross-check: result^2 ≈ sumSq * 10^36 within exact half-ulp
			assertExactRoundedSqrt(result, sumSq);

			// Independent floating-point cross-check via Math.hypot
			const expectedFloat = Math.hypot(...vec.map(Number));
			const actualFloat = Number(result) / 1e18;
			const relError = Math.abs(actualFloat - expectedFloat) / expectedFloat;
			assert.ok(
				relError < 1e-14,
				`Relative error ${relError} too large for vector [${vec}]: got ${actualFloat}, expected ${expectedFloat}`
			);
		}
	});
});
