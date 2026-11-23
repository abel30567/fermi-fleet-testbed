import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyRationalIterative } from './multiplyRationalIterative.js';

/**
 * Independent reference recursive Euclidean GCD for test verification.
 */
function gcdRecursive(a, b) {
	const x = a < 0n ? -a : a;
	const y = b < 0n ? -b : b;
	return y === 0n ? x : gcdRecursive(y, x % y);
}

/**
 * Independent reference rational multiplication: direct product followed by recursive GCD reduction.
 */
function referenceMultiply(a, b) {
	let num = a.num * b.num;
	let den = a.den * b.den;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcdRecursive(num, den);
	return { num: num / g, den: den / g };
}

describe('multiplyRationalIterative', () => {
	it('multiplies positive coprime rationals', () => {
		assert.deepEqual(
			multiplyRationalIterative({ num: 2n, den: 3n }, { num: 5n, den: 7n }),
			{ num: 10n, den: 21n },
		);
	});

	it('reduces products and cross-cancels common factors to lowest terms', () => {
		assert.deepEqual(
			multiplyRationalIterative({ num: 6n, den: 35n }, { num: 14n, den: 9n }),
			{ num: 4n, den: 15n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 12n, den: 18n }, { num: 15n, den: 20n }),
			{ num: 1n, den: 2n },
		);
	});

	it('handles signs and normalizes negative denominators', () => {
		assert.deepEqual(
			multiplyRationalIterative({ num: -3n, den: 4n }, { num: 2n, den: 9n }),
			{ num: -1n, den: 6n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: -3n, den: 4n }, { num: -8n, den: 9n }),
			{ num: 2n, den: 3n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 3n, den: -4n }, { num: 2n, den: -9n }),
			{ num: 1n, den: 6n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: -6n, den: -10n }, { num: 5n, den: -12n }),
			{ num: -1n, den: 4n },
		);
	});

	it('handles zero, identity, and reciprocals as edge cases', () => {
		assert.deepEqual(
			multiplyRationalIterative({ num: 0n, den: 5n }, { num: 7n, den: 3n }),
			{ num: 0n, den: 1n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 7n, den: -3n }, { num: 0n, den: -9n }),
			{ num: 0n, den: 1n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: -1n }),
			{ num: 0n, den: 1n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 11n, den: 13n }, { num: 1n, den: 1n }),
			{ num: 11n, den: 13n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: 11n, den: 13n }, { num: -1n, den: -1n }),
			{ num: 11n, den: 13n },
		);
		assert.deepEqual(
			multiplyRationalIterative({ num: -17n, den: 23n }, { num: -23n, den: 17n }),
			{ num: 1n, den: 1n },
		);
	});

	it('handles very large BigInt values without precision loss and does not mutate inputs', () => {
		const bigA = { num: (1n << 200n) * 3n, den: (1n << 199n) * 7n };
		const bigB = { num: (1n << 150n) * 7n, den: (1n << 151n) * 9n };
		const snapA = { ...bigA };
		const snapB = { ...bigB };

		const result = multiplyRationalIterative(bigA, bigB);
		assert.deepEqual(result, { num: 1n, den: 3n });
		assert.deepEqual(bigA, snapA);
		assert.deepEqual(bigB, snapB);
	});

	it('rejects invalid inputs with TypeError or RangeError', () => {
		const valid = { num: 1n, den: 2n };

		for (const bad of [null, undefined, 42, '1/2', true, 1n, [1n, 2n]]) {
			assert.throws(() => multiplyRationalIterative(bad, valid), TypeError);
			assert.throws(() => multiplyRationalIterative(valid, bad), TypeError);
		}

		for (const badField of [
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: 2n },
			{ num: 1n, den: null },
			{ num: 1n },
			{ den: 2n },
			{},
		]) {
			assert.throws(() => multiplyRationalIterative(badField, valid), TypeError);
			assert.throws(() => multiplyRationalIterative(valid, badField), TypeError);
		}

		assert.throws(() => multiplyRationalIterative({ num: 1n, den: 0n }, valid), RangeError);
		assert.throws(() => multiplyRationalIterative(valid, { num: 1n, den: 0n }), RangeError);
		// Must still validate the second operand even when the first operand is zero.
		assert.throws(() => multiplyRationalIterative({ num: 0n, den: 1n }, { num: 5n, den: 0n }), RangeError);
		assert.throws(() => multiplyRationalIterative({ num: 0n, den: 1n }, null), TypeError);
	});

	it('cross-checks against an independent reference implementation, algebraic laws, and floating-point approximations', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -7n },
			{ num: 1n, den: 1n },
			{ num: -1n, den: 1n },
			{ num: 2n, den: 3n },
			{ num: -4n, den: 6n },
			{ num: 9n, den: -12n },
			{ num: -15n, den: -25n },
			{ num: 35n, den: 49n },
			{ num: 1001n, den: 143n },
			{ num: -999983n, den: 104729n },
		];

		for (const a of samples) {
			for (const b of samples) {
				const actual = multiplyRationalIterative(a, b);
				const expected = referenceMultiply(a, b);

				assert.deepEqual(actual, expected);
				// Canonical invariants: den > 0n and gcd(|num|, den) === 1n
				assert.ok(actual.den > 0n);
				assert.equal(gcdRecursive(actual.num, actual.den), 1n);
				// Exact cross-multiplication identity: actual.num * a.den * b.den === a.num * b.num * actual.den
				assert.equal(actual.num * a.den * b.den, a.num * b.num * actual.den);
				// Commutativity
				assert.deepEqual(actual, multiplyRationalIterative(b, a));
				// Floating-point sanity cross-check
				const approx = (Number(a.num) / Number(a.den)) * (Number(b.num) / Number(b.den));
				const actualFloat = Number(actual.num) / Number(actual.den);
				assert.ok(Math.abs(actualFloat - approx) <= 1e-12 * Math.max(1, Math.abs(approx)));
			}
		}

		// Associativity on a subset
		const triples = [
			samples[4],
			samples[5],
			samples[6],
			samples[7],
			samples[9],
		];
		for (const a of triples) {
			for (const b of triples) {
				for (const c of triples) {
					assert.deepEqual(
						multiplyRationalIterative(multiplyRationalIterative(a, b), c),
						multiplyRationalIterative(a, multiplyRationalIterative(b, c)),
					);
				}
			}
		}
	});
});
