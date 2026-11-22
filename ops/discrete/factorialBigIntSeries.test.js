import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialBigIntSeries } from './factorialBigIntSeries.js';

/**
 * Independent iterative reference implementation of n!.
 * @param {bigint} n
 * @returns {bigint}
 */
function iterativeFactorial(n) {
	let acc = 1n;
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i;
	}
	return acc;
}

/**
 * Legendre's formula for the p-adic valuation v_p(n!).
 * @param {bigint} n
 * @param {bigint} p
 * @returns {bigint}
 */
function legendreValuation(n, p) {
	let count = 0n;
	let divisor = p;
	while (divisor <= n) {
		count += n / divisor;
		divisor *= p;
	}
	return count;
}

/**
 * Exact p-adic valuation of a positive BigInt value by repeated division.
 * @param {bigint} value
 * @param {bigint} p
 * @returns {bigint}
 */
function exactValuation(value, p) {
	let count = 0n;
	let remaining = value;
	while (remaining % p === 0n) {
		remaining /= p;
		count += 1n;
	}
	return count;
}

describe('factorialBigIntSeries', () => {
	it('handles base and edge cases (0n, 1n, 2n, 3n, 4n)', () => {
		assert.equal(factorialBigIntSeries(0n), 1n);
		assert.equal(factorialBigIntSeries(1n), 1n);
		assert.equal(factorialBigIntSeries(2n), 2n);
		assert.equal(factorialBigIntSeries(3n), 6n);
		assert.equal(factorialBigIntSeries(4n), 24n);
	});

	it('computes known normal values (5n, 20n, 50n, 100n)', () => {
		assert.equal(factorialBigIntSeries(5n), 120n);
		assert.equal(factorialBigIntSeries(20n), 2432902008176640000n);
		assert.equal(
			factorialBigIntSeries(50n),
			30414093201713378043612608166064768844377641568960512000000000000n,
		);
		assert.equal(
			factorialBigIntSeries(100n),
			93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n,
		);
	});

	it('handles large inputs such as 200n and 500n', () => {
		const f200 = factorialBigIntSeries(200n);
		assert.equal(f200, iterativeFactorial(200n));
		assert.equal(f200.toString().length, 375);

		const f500 = factorialBigIntSeries(500n);
		assert.equal(f500, iterativeFactorial(500n));
		assert.equal(f500.toString().length, 1135);
	});

	it('matches direct iterative multiplication for all n from 0n to 120n', () => {
		let running = 1n;
		for (let n = 0n; n <= 120n; n += 1n) {
			if (n >= 2n) {
				running *= n;
			}
			assert.equal(
				factorialBigIntSeries(n),
				running,
				`mismatch at n=${n}`,
			);
		}
	});

	it('satisfies Legendre formula for trailing zeros and p-adic valuations', () => {
		const testNs = [20n, 50n, 100n, 200n];
		const primes = [2n, 3n, 5n, 7n, 11n];

		for (const n of testNs) {
			const fact = factorialBigIntSeries(n);

			// Trailing zeros in base 10 equal v_5(n!)
			const expectedTrailingZeros = legendreValuation(n, 5n);
			const digits = fact.toString();
			const actualTrailingZeros = BigInt(
				digits.length - digits.replace(/0+$/, '').length,
			);
			assert.equal(
				actualTrailingZeros,
				expectedTrailingZeros,
				`trailing zeros mismatch for n=${n}`,
			);

			// p-adic valuations for multiple primes
			for (const p of primes) {
				assert.equal(
					exactValuation(fact, p),
					legendreValuation(n, p),
					`v_${p}(${n}!) mismatch`,
				);
			}
		}
	});

	it('satisfies Wilson theorem (p - 1)! ≡ -1 (mod p) for primes and 0 (mod m) for composites > 4', () => {
		const primes = [2n, 3n, 5n, 7n, 11n, 13n, 29n, 53n, 97n, 101n, 199n];
		for (const p of primes) {
			const val = factorialBigIntSeries(p - 1n);
			assert.equal(
				(val + 1n) % p,
				0n,
				`Wilson theorem failed for prime p=${p}`,
			);
		}

		const composites = [6n, 8n, 9n, 10n, 15n, 25n, 64n, 100n];
		for (const m of composites) {
			const val = factorialBigIntSeries(m - 1n);
			assert.equal(
				val % m,
				0n,
				`Composite divisibility failed for m=${m}`,
			);
		}
	});

	it('rejects invalid inputs with TypeError or RangeError', () => {
		assert.throws(() => factorialBigIntSeries(-1n), RangeError);
		assert.throws(() => factorialBigIntSeries(-100n), RangeError);

		assert.throws(() => factorialBigIntSeries(5), TypeError);
		assert.throws(() => factorialBigIntSeries(0), TypeError);
		assert.throws(() => factorialBigIntSeries(NaN), TypeError);
		assert.throws(() => factorialBigIntSeries(Infinity), TypeError);
		assert.throws(() => factorialBigIntSeries('5'), TypeError);
		assert.throws(() => factorialBigIntSeries(null), TypeError);
		assert.throws(() => factorialBigIntSeries(undefined), TypeError);
		assert.throws(() => factorialBigIntSeries(true), TypeError);
		assert.throws(() => factorialBigIntSeries({}), TypeError);
	});
});
