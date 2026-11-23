import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialRationalRecursive } from './factorialRationalRecursive.js';

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function assertNormalizedRational(r, expectedNum, expectedDen = 1n) {
	assert.equal(typeof r, 'object');
	assert.notEqual(r, null);
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, 'denominator must be positive');
	assert.equal(gcd(r.num, r.den), 1n, 'rational must be in lowest terms');
	assert.deepEqual(r, { num: expectedNum, den: expectedDen });
}

function iterativeFactorial(n) {
	let acc = 1n;
	for (let k = 2n; k <= n; k++) {
		acc *= k;
	}
	return acc;
}

function legendreExponent(n, p) {
	let exp = 0n;
	let power = p;
	while (power <= n) {
		exp += n / power;
		power *= p;
	}
	return exp;
}

function valuation(value, p) {
	let count = 0n;
	let cur = value;
	while (cur > 0n && cur % p === 0n) {
		cur /= p;
		count += 1n;
	}
	return count;
}

describe('factorialRationalRecursive', () => {
	it('computes exact factorials for small non-negative integer numbers', () => {
		const expected = [
			[0, 1n],
			[1, 1n],
			[2, 2n],
			[3, 6n],
			[4, 24n],
			[5, 120n],
			[6, 720n],
			[7, 5040n],
			[10, 3628800n],
			[20, 2432902008176640000n],
			[25, 15511210043330985984000000n],
		];
		for (const [n, fact] of expected) {
			assertNormalizedRational(factorialRationalRecursive(n), fact, 1n);
		}
	});

	it('accepts BigInt inputs', () => {
		assertNormalizedRational(factorialRationalRecursive(0n), 1n, 1n);
		assertNormalizedRational(factorialRationalRecursive(1n), 1n, 1n);
		assertNormalizedRational(factorialRationalRecursive(12n), 479001600n, 1n);
		assertNormalizedRational(
			factorialRationalRecursive(30n),
			265252859812191058636308480000000n,
			1n,
		);
	});

	it('accepts exact rational object inputs representing non-negative integers', () => {
		assertNormalizedRational(factorialRationalRecursive({ num: 0n, den: 1n }), 1n, 1n);
		assertNormalizedRational(factorialRationalRecursive({ num: 0n, den: -7n }), 1n, 1n);
		assertNormalizedRational(factorialRationalRecursive({ num: 1n, den: 1n }), 1n, 1n);
		assertNormalizedRational(factorialRationalRecursive({ num: 12n, den: 3n }), 24n, 1n);
		assertNormalizedRational(factorialRationalRecursive({ num: -10n, den: -2n }), 120n, 1n);
	});

	it('handles edge cases such as -0 and deep recursion inputs without stack overflow', () => {
		assertNormalizedRational(factorialRationalRecursive(-0), 1n, 1n);

		const res1000 = factorialRationalRecursive(1000);
		assert.equal(res1000.den, 1n);
		assert.equal(gcd(res1000.num, res1000.den), 1n);
		assert.equal(res1000.num, iterativeFactorial(1000n));
	});

	it('throws RangeError for negative, non-integer, non-finite, unsafe, or zero-denominator inputs', () => {
		const rangeErrorInputs = [
			-1,
			-100,
			-1n,
			-50n,
			1.5,
			0.25,
			-0.5,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			{ num: -3n, den: 1n },
			{ num: 6n, den: -2n },
			{ num: 3n, den: 2n },
			{ num: -5n, den: 4n },
			{ num: 5n, den: 0n },
			{ num: 0n, den: 0n },
		];
		for (const bad of rangeErrorInputs) {
			assert.throws(() => factorialRationalRecursive(bad), RangeError);
		}
	});

	it('throws TypeError for invalid input types or malformed rational objects', () => {
		const typeErrorInputs = [
			null,
			undefined,
			'5',
			true,
			false,
			{},
			[],
			[5n, 1n],
			{ num: 5, den: 1 },
			{ num: 5n, den: 1 },
			{ num: 5, den: 1n },
			{ num: '5', den: '1' },
			Symbol('5'),
		];
		for (const bad of typeErrorInputs) {
			assert.throws(() => factorialRationalRecursive(bad), TypeError);
		}
	});

	it('cross-checks against an independent iterative factorial for n = 0..100 and n = 500', () => {
		for (let n = 0; n <= 100; n++) {
			const res = factorialRationalRecursive(n);
			const expected = iterativeFactorial(BigInt(n));
			assertNormalizedRational(res, expected, 1n);
		}
		assertNormalizedRational(factorialRationalRecursive(500n), iterativeFactorial(500n), 1n);
	});

	it('satisfies the recurrence relation n! = n * (n - 1)! for n = 1..60', () => {
		let prev = factorialRationalRecursive(0);
		for (let n = 1; n <= 60; n++) {
			const curr = factorialRationalRecursive(n);
			assert.equal(curr.den, 1n);
			assert.equal(curr.num, BigInt(n) * prev.num);
			prev = curr;
		}
	});

	it("cross-checks via Wilson's theorem and Legendre's prime valuation formula", () => {
		const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 97n];
		for (const p of primes) {
			const res = factorialRationalRecursive(p - 1n);
			assert.equal(res.den, 1n);
			assert.equal((res.num + 1n) % p, 0n, `Wilson's theorem failed for p=${p}`);
		}

		for (const n of [100n, 500n]) {
			const res = factorialRationalRecursive(n);
			for (const p of [2n, 3n, 5n, 7n, 11n]) {
				assert.equal(
					valuation(res.num, p),
					legendreExponent(n, p),
					`Legendre exponent mismatch for n=${n}, p=${p}`,
				);
			}
		}
	});
});
