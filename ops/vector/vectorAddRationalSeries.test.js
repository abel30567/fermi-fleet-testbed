import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddRationalSeries } from './vectorAddRationalSeries.js';

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function assertLowestTerms(vec) {
	for (const { num, den } of vec) {
		assert.equal(typeof num, 'bigint');
		assert.equal(typeof den, 'bigint');
		assert.ok(den > 0n, `expected den > 0n, got ${den}`);
		if (num === 0n) {
			assert.equal(den, 1n);
		} else {
			assert.equal(gcd(num, den), 1n, `expected reduced fraction, got ${num}/${den}`);
		}
	}
}

const r = (num, den = 1n) => ({ num, den });

describe('vectorAddRationalSeries', () => {
	it('adds simple positive and negative rational vectors in lowest terms', () => {
		const a = [r(1n, 2n), r(1n, 6n), r(-3n, 4n), r(1n, 10n)];
		const b = [r(1n, 3n), r(5n, 6n), r(1n, 4n), r(1n, 15n)];
		const sum = vectorAddRationalSeries(a, b);

		assert.deepEqual(sum, [r(5n, 6n), r(1n, 1n), r(-1n, 2n), r(1n, 6n)]);
		assertLowestTerms(sum);
	});

	it('handles empty vectors', () => {
		assert.deepEqual(vectorAddRationalSeries([], []), []);
	});

	it('normalizes zero values, unreduced fractions, and negative denominators', () => {
		const a = [r(0n, -5n), r(4n, -6n), r(-6n, -9n), r(10n, 20n)];
		const b = [r(0n, 7n), r(-2n, 6n), r(2n, -3n), r(-5n, 10n)];
		const sum = vectorAddRationalSeries(a, b);

		assert.deepEqual(sum, [r(0n, 1n), r(-1n, 1n), r(0n, 1n), r(0n, 1n)]);
		assertLowestTerms(sum);
	});

	it('handles very large arbitrary-precision BigInt components without precision loss', () => {
		const big = 10n ** 40n;
		const a = [r(1n, big), r(big + 1n, 3n * big)];
		const b = [r(big - 1n, big), r(2n * big - 1n, 3n * big)];
		const sum = vectorAddRationalSeries(a, b);

		assert.deepEqual(sum, [r(1n, 1n), r(1n, 1n)]);
		assertLowestTerms(sum);
	});

	it('does not mutate input vectors or rational objects', () => {
		const a = [r(2n, -4n), r(3n, 9n)];
		const b = [r(1n, 2n), r(2n, 3n)];
		const aSnapshot = a.map((x) => ({ ...x }));
		const bSnapshot = b.map((x) => ({ ...x }));

		const sum = vectorAddRationalSeries(a, b);
		assert.deepEqual(a, aSnapshot);
		assert.deepEqual(b, bSnapshot);
		assert.notEqual(sum, a);
		assert.notEqual(sum, b);
	});

	it('satisfies commutativity, associativity, additive identity, and additive inverse', () => {
		const u = [r(7n, 12n), r(-5n, 18n), r(13n, 35n), r(0n, 9n)];
		const v = [r(-11n, 15n), r(4n, 21n), r(8n, 25n), r(-9n, 14n)];
		const w = [r(5n, 8n), r(7n, 10n), r(-3n, 14n), r(3n, 7n)];
		const zero = [r(0n, 1n), r(0n, 1n), r(0n, 1n), r(0n, 1n)];
		const negU = u.map(({ num, den }) => r(-num, den));

		// Commutativity: u + v === v + u
		assert.deepEqual(vectorAddRationalSeries(u, v), vectorAddRationalSeries(v, u));

		// Associativity: (u + v) + w === u + (v + w)
		const lhs = vectorAddRationalSeries(vectorAddRationalSeries(u, v), w);
		const rhs = vectorAddRationalSeries(u, vectorAddRationalSeries(v, w));
		assert.deepEqual(lhs, rhs);
		assertLowestTerms(lhs);

		// Additive identity: u + 0 === normalized(u)
		assert.deepEqual(vectorAddRationalSeries(u, zero), [
			r(7n, 12n),
			r(-5n, 18n),
			r(13n, 35n),
			r(0n, 1n),
		]);

		// Additive inverse: u + (-u) === 0
		assert.deepEqual(vectorAddRationalSeries(u, negU), zero);
	});

	it('cross-checks against naive common-denominator formula and telescoping series identity', () => {
		// Direct naive common-denominator cross-check
		const a = [r(17n, 24n), r(-29n, 36n), r(41n, 60n), r(1234567890123456789n, 9876543210987654321n)];
		const b = [r(19n, 30n), r(11n, 48n), r(-17n, 42n), r(-234567890123456789n, 1234567890123456789n)];
		const sum = vectorAddRationalSeries(a, b);
		assertLowestTerms(sum);

		for (let i = 0; i < a.length; i++) {
			const expectedNum = a[i].num * b[i].den + b[i].num * a[i].den;
			const expectedDen = a[i].den * b[i].den;
			// Exact cross-multiplication equivalence: sum.num / sum.den === expectedNum / expectedDen
			assert.equal(sum[i].num * expectedDen, expectedNum * sum[i].den);
		}

		// Telescoping rational series identity: sum_{k=1..N} 1/(k*(k+1)) === N/(N+1)
		// and sum_{k=1..N} (-1)^k * (1/k - 1/(k+1)) tested alongside vector accumulation
		const N = 25n;
		let acc = [r(0n, 1n), r(0n, 1n)];
		for (let k = 1n; k <= N; k++) {
			const term = [r(1n, k * (k + 1n)), r(2n, k * (k + 2n))];
			acc = vectorAddRationalSeries(acc, term);
		}
		assertLowestTerms(acc);
		// sum_{k=1..N} 1/(k(k+1)) = N/(N+1)
		assert.deepEqual(acc[0], r(N, N + 1n));
		// sum_{k=1..N} 2/(k(k+2)) = 1 + 1/2 - 1/(N+1) - 1/(N+2) = (3N^2 + 5N) / (2(N+1)(N+2))
		const expectedNum2 = 3n * N * N + 5n * N;
		const expectedDen2 = 2n * (N + 1n) * (N + 2n);
		const g2 = gcd(expectedNum2, expectedDen2);
		assert.deepEqual(acc[1], r(expectedNum2 / g2, expectedDen2 / g2));
	});

	it('throws TypeError or RangeError on invalid inputs', () => {
		// Non-array inputs
		assert.throws(() => vectorAddRationalSeries(null, []), TypeError);
		assert.throws(() => vectorAddRationalSeries([], undefined), TypeError);
		assert.throws(() => vectorAddRationalSeries('abc', []), TypeError);
		assert.throws(() => vectorAddRationalSeries({}, []), TypeError);

		// Length mismatch
		assert.throws(() => vectorAddRationalSeries([r(1n, 2n)], []), RangeError);
		assert.throws(() => vectorAddRationalSeries([r(1n, 2n)], [r(1n, 2n), r(1n, 3n)]), RangeError);

		// Invalid component types
		assert.throws(() => vectorAddRationalSeries([null], [r(1n, 1n)]), TypeError);
		assert.throws(() => vectorAddRationalSeries([r(1n, 1n)], [[1n, 2n]]), TypeError);
		assert.throws(() => vectorAddRationalSeries([{ num: 1, den: 2n }], [r(1n, 1n)]), TypeError);
		assert.throws(() => vectorAddRationalSeries([r(1n, 1n)], [{ num: 1n, den: 2 }]), TypeError);
		assert.throws(() => vectorAddRationalSeries([{ num: 1n }], [r(1n, 1n)]), TypeError);

		// Zero denominator
		assert.throws(() => vectorAddRationalSeries([r(1n, 0n)], [r(1n, 2n)]), RangeError);
		assert.throws(() => vectorAddRationalSeries([r(1n, 2n)], [r(0n, 0n)]), RangeError);
	});
});
