import { test } from 'node:test';
import assert from 'node:assert';
import { factorialBigIntStable } from './factorialBigIntStable.js';

/**
 * Naive iterative reference factorial for independent cross-checking.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function naiveFactorial(n) {
	let acc = 1n;
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i;
	}
	return acc;
}

/**
 * Legendre's formula for p-adic valuation v_p(n!).
 *
 * @param {bigint} n
 * @param {bigint} p
 * @returns {bigint}
 */
function legendreValuation(n, p) {
	let count = 0n;
	let d = p;
	while (d <= n) {
		count += n / d;
		d *= p;
	}
	return count;
}

test('edge cases: 0n, 1n, 2n', () => {
	assert.strictEqual(factorialBigIntStable(0n), 1n);
	assert.strictEqual(factorialBigIntStable(1n), 1n);
	assert.strictEqual(factorialBigIntStable(2n), 2n);
});

test('known small and medium exact values', () => {
	assert.strictEqual(factorialBigIntStable(3n), 6n);
	assert.strictEqual(factorialBigIntStable(4n), 24n);
	assert.strictEqual(factorialBigIntStable(5n), 120n);
	assert.strictEqual(factorialBigIntStable(10n), 3628800n);
	assert.strictEqual(factorialBigIntStable(20n), 2432902008176640000n);
	assert.strictEqual(
		factorialBigIntStable(50n),
		30414093201713378043612608166064768844377641568960512000000000000n,
	);
	assert.strictEqual(
		factorialBigIntStable(100n),
		93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n,
	);
});

test('independent cross-check against naive iterative product for 0n..250n', () => {
	let iterative = 1n;
	for (let n = 0n; n <= 250n; n += 1n) {
		if (n > 1n) {
			iterative *= n;
		}
		assert.strictEqual(factorialBigIntStable(n), iterative, `mismatch at n=${n}`);
	}
});

test('recurrence identity n! / (n - 1)! === n and exact divisibility', () => {
	const testPoints = [1n, 2n, 7n, 15n, 16n, 17n, 63n, 64n, 65n, 500n, 1024n, 2000n];
	for (const n of testPoints) {
		const fn = factorialBigIntStable(n);
		const fnPrev = factorialBigIntStable(n - 1n);
		assert.strictEqual(fn % fnPrev, 0n, `remainder non-zero at n=${n}`);
		assert.strictEqual(fn / fnPrev, n, `quotient mismatch at n=${n}`);
	}
});

test('large n (10000n): stack-safe, matches recurrence, Legendre 2-adic/5-adic valuations, and naive sample', () => {
	const n = 10000n;
	const factN = factorialBigIntStable(n);
	const factNMinus1 = factorialBigIntStable(n - 1n);

	assert.strictEqual(factN % factNMinus1, 0n);
	assert.strictEqual(factN / factNMinus1, n);

	// Exact trailing decimal zeros match Legendre's 5-adic valuation v_5(10000!) = 2499
	const expectedTrailingZeros = Number(legendreValuation(n, 5n));
	const decimalStr = factN.toString(10);
	assert.strictEqual(decimalStr.length, 35660);
	const trailingZeros = decimalStr.length - decimalStr.replace(/0+$/, '').length;
	assert.strictEqual(trailingZeros, expectedTrailingZeros);

	// Exact 2-adic valuation matches Legendre's formula v_2(n!)
	const expectedTwoValuation = legendreValuation(n, 2n);
	const twoPow = 1n << expectedTwoValuation;
	assert.strictEqual(factN % twoPow, 0n);
	assert.strictEqual((factN >> expectedTwoValuation) & 1n, 1n);

	// Cross-check 1500n directly against naive iterative multiplication
	assert.strictEqual(factorialBigIntStable(1500n), naiveFactorial(1500n));
});

test('Wilson theorem cross-check for primes p: ((p - 1)! + 1) % p === 0', () => {
	const primes = [2n, 3n, 5n, 17n, 97n, 257n, 509n, 1009n];
	for (const p of primes) {
		const res = (factorialBigIntStable(p - 1n) + 1n) % p;
		assert.strictEqual(res, 0n, `Wilson theorem failed for prime p=${p}`);
	}
});

test('input validation: throws RangeError on negative BigInt', () => {
	for (const bad of [-1n, -2n, -100n, -(10n ** 30n)]) {
		assert.throws(() => factorialBigIntStable(bad), {
			name: 'RangeError',
		});
	}
});

test('input validation: throws TypeError on non-BigInt inputs', () => {
	const invalidInputs = [
		0,
		1,
		5,
		-1,
		1.5,
		NaN,
		Infinity,
		-Infinity,
		'0',
		'5',
		'',
		true,
		false,
		null,
		undefined,
		{},
		[],
		[5n],
		Symbol('5'),
		() => 5n,
	];

	for (const bad of invalidInputs) {
		assert.throws(() => factorialBigIntStable(bad), {
			name: 'TypeError',
		});
	}
});
