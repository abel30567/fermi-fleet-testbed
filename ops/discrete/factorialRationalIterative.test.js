import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialRationalIterative } from './factorialRationalIterative.js';

/**
 * Independent recursive reference implementation for non-negative BigInt integers.
 * @param {bigint} n
 * @returns {bigint}
 */
function factorialRecursiveRef(n) {
	if (n <= 1n) {
		return 1n;
	}
	return n * factorialRecursiveRef(n - 1n);
}

/**
 * Legendre's formula: exact exponent of prime p dividing n!.
 * @param {bigint} n
 * @param {bigint} p
 * @returns {bigint}
 */
function legendreValuation(n, p) {
	let count = 0n;
	let power = p;
	while (power <= n) {
		count += n / power;
		power *= p;
	}
	return count;
}

describe('factorialRationalIterative', () => {
	it('computes factorials for normal small integer rationals', () => {
		assert.deepEqual(factorialRationalIterative({ num: 2n, den: 1n }), { num: 2n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 3n, den: 1n }), { num: 6n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 4n, den: 1n }), { num: 24n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 5n, den: 1n }), { num: 120n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 10n, den: 1n }), { num: 3628800n, den: 1n });
	});

	it('handles 0! and 1! edge cases including unreduced and negative-denominator forms', () => {
		assert.deepEqual(factorialRationalIterative({ num: 0n, den: 1n }), { num: 1n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 0n, den: 7n }), { num: 1n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 0n, den: -5n }), { num: 1n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 1n, den: 1n }), { num: 1n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 4n, den: 4n }), { num: 1n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: -9n, den: -9n }), { num: 1n, den: 1n });
	});

	it('normalizes unreduced integer rationals and negative denominators', () => {
		assert.deepEqual(factorialRationalIterative({ num: 6n, den: 2n }), { num: 6n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 10n, den: 2n }), { num: 120n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: 21n, den: 3n }), { num: 5040n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: -6n, den: -2n }), { num: 6n, den: 1n });
		assert.deepEqual(factorialRationalIterative({ num: -10n, den: -2n }), { num: 120n, den: 1n });
	});

	it('computes exact factorials for large n > 20 exceeding Number.MAX_SAFE_INTEGER', () => {
		const f21 = factorialRationalIterative({ num: 21n, den: 1n });
		assert.equal(f21.den, 1n);
		assert.equal(f21.num, 51090942171709440000n);
		assert.ok(f21.num > BigInt(Number.MAX_SAFE_INTEGER));

		const f25 = factorialRationalIterative({ num: 50n, den: 2n });
		assert.deepEqual(f25, { num: 15511210043330985984000000n, den: 1n });

		const f50 = factorialRationalIterative({ num: 50n, den: 1n });
		assert.deepEqual(f50, {
			num: 30414093201713378043612608166064768844377641568960512000000000000n,
			den: 1n,
		});
	});

	it('rejects malformed inputs with TypeError', () => {
		const badTypes = [
			null,
			undefined,
			5,
			5n,
			'5',
			[],
			{},
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: 5n },
			{ den: 1n },
		];
		for (const input of badTypes) {
			assert.throws(() => factorialRationalIterative(input), TypeError);
		}
	});

	it('rejects zero denominator, negative rationals, and non-integer rationals with RangeError', () => {
		const badRanges = [
			{ num: 5n, den: 0n },
			{ num: 0n, den: 0n },
			{ num: -1n, den: 1n },
			{ num: 6n, den: -2n },
			{ num: -10n, den: 2n },
			{ num: 1n, den: 2n },
			{ num: 5n, den: 3n },
			{ num: -3n, den: 2n },
			{ num: -3n, den: -2n },
			{ num: 7n, den: -4n },
		];
		for (const input of badRanges) {
			assert.throws(() => factorialRationalIterative(input), RangeError);
		}
	});

	it('satisfies recurrence identity n! / (n-1)! === n and matches recursive reference', () => {
		let prev = factorialRationalIterative({ num: 0n, den: 1n });
		assert.deepEqual(prev, { num: factorialRecursiveRef(0n), den: 1n });

		for (let n = 1n; n <= 40n; n += 1n) {
			const scale = (n % 2n === 0n) ? 3n : -5n;
			const curr = factorialRationalIterative({ num: n * scale, den: scale });

			assert.equal(curr.den, 1n);
			assert.equal(curr.num % prev.num, 0n);
			assert.equal(curr.num / prev.num, n);
			assert.equal(curr.num, factorialRecursiveRef(n));

			prev = curr;
		}
	});

	it('matches Legendre prime-power valuations for 50!', () => {
		const { num, den } = factorialRationalIterative({ num: 50n, den: 1n });
		assert.equal(den, 1n);

		for (const p of [2n, 3n, 5n, 7n, 11n, 13n]) {
			const expectedExp = legendreValuation(50n, p);
			let actualExp = 0n;
			let rem = num;
			while (rem % p === 0n) {
				rem /= p;
				actualExp += 1n;
			}
			assert.equal(actualExp, expectedExp, `valuation for prime ${p}`);
		}
	});
});
