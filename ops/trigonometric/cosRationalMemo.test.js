import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosRationalMemo } from './cosRationalMemo.js';

/**
 * Helper: compute BigInt gcd to assert lowest-terms invariant in tests.
 */
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

/**
 * Helper: convert a BigInt rational to a JS Number without overflowing
 * Number.MAX_VALUE on large BigInt numerators/denominators.
 */
function rationalToNumber({ num, den }) {
	const scale = 10n ** 18n;
	const scaled = (num * scale) / den;
	return Number(scaled) / 1e18;
}

/**
 * Helper: assert that a rational value is in canonical lowest terms.
 */
function assertCanonicalRational(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

describe('cosRationalMemo', () => {
	it('returns exact 1/1 for zero and unreduced zero forms', () => {
		assert.deepEqual(cosRationalMemo({ num: 0n, den: 1n }), { num: 1n, den: 1n });
		assert.deepEqual(cosRationalMemo({ num: 0n, den: 42n }), { num: 1n, den: 1n });
		assert.deepEqual(cosRationalMemo({ num: 0n, den: -7n }), { num: 1n, den: 1n });
		assert.deepEqual(cosRationalMemo({ num: 0n, den: 1n }, 1), { num: 1n, den: 1n });
		assert.deepEqual(cosRationalMemo({ num: 0n, den: 1n }, { terms: 5, useCache: false }), {
			num: 1n,
			den: 1n,
		});
	});

	it('computes exact truncated Maclaurin polynomials for explicit term counts', () => {
		// 1 term: 1
		assert.deepEqual(cosRationalMemo({ num: 1n, den: 2n }, 1), { num: 1n, den: 1n });

		// 2 terms for x = 1/2: 1 - (1/4)/2 = 7/8
		assert.deepEqual(cosRationalMemo({ num: 1n, den: 2n }, 2), { num: 7n, den: 8n });

		// 3 terms for x = 1: 1 - 1/2 + 1/24 = 13/24
		assert.deepEqual(cosRationalMemo({ num: 1n, den: 1n }, 3), { num: 13n, den: 24n });

		// 4 terms for x = 1: 1 - 1/2 + 1/24 - 1/720 = 389/720
		assert.deepEqual(cosRationalMemo({ num: 1n, den: 1n }, { terms: 4 }), {
			num: 389n,
			den: 720n,
		});

		// 2 terms for x = 2: 1 - 4/2 = -1/1
		const negOne = cosRationalMemo({ num: 2n, den: 1n }, 2);
		assertCanonicalRational(negOne);
		assert.deepEqual(negOne, { num: -1n, den: 1n });
	});

	it('normalizes unreduced inputs and negative denominators identically', () => {
		const base = cosRationalMemo({ num: 1n, den: 2n });
		assertCanonicalRational(base);
		assert.deepEqual(cosRationalMemo({ num: 6n, den: 12n }), base);
		assert.deepEqual(cosRationalMemo({ num: -3n, den: -6n }), base);
		assert.deepEqual(cosRationalMemo({ num: 3n, den: -6n }), base);
		assert.deepEqual(cosRationalMemo({ num: -1n, den: 2n }), base);
	});

	it('satisfies exact even symmetry cos(-x) === cos(x)', () => {
		const samples = [
			{ num: 1n, den: 3n },
			{ num: 3n, den: 4n },
			{ num: 7n, den: 5n },
			{ num: 355n, den: 113n },
			{ num: 11n, den: 2n },
		];
		for (const x of samples) {
			const pos = cosRationalMemo(x);
			const neg = cosRationalMemo({ num: -x.num, den: x.den });
			const negDen = cosRationalMemo({ num: x.num, den: -x.den });
			assertCanonicalRational(pos);
			assertCanonicalRational(neg);
			assert.deepEqual(neg, pos);
			assert.deepEqual(negDen, pos);
		}
	});

	it('cross-checks accurately against Math.cos across small, negative, and larger angles', () => {
		const cases = [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 10n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 1n },
			{ num: 355n, den: 339n }, // ~ pi/3, cos ~ 0.5
			{ num: 355n, den: 226n }, // ~ pi/2, cos ~ 0
			{ num: 2n, den: 1n },
			{ num: 355n, den: 113n }, // ~ pi, cos ~ -1
			{ num: 5n, den: 1n },
			{ num: 710n, den: 113n }, // ~ 2*pi, cos ~ 1
			{ num: 10n, den: 1n },
			{ num: -7n, den: 3n },
			{ num: -15n, den: 2n },
		];

		for (const x of cases) {
			const res = cosRationalMemo(x);
			assertCanonicalRational(res);
			const approx = rationalToNumber(res);
			const expected = Math.cos(Number(x.num) / Number(x.den));
			assert.ok(
				Math.abs(approx - expected) < 1e-14,
				`Mismatch for ${x.num}/${x.den}: got ${approx}, expected ${expected}`
			);
		}
	});

	it('cross-checks the double-angle identity cos(2x) = 2*cos(x)^2 - 1', () => {
		const angles = [
			{ num: 1n, den: 5n },
			{ num: 2n, den: 3n },
			{ num: 5n, den: 4n },
			{ num: -9n, den: 7n },
		];

		for (const x of angles) {
			const cosX = cosRationalMemo(x);
			const cos2X = cosRationalMemo({ num: x.num * 2n, den: x.den });
			// Compute 2 * cos(x)^2 - 1 in exact rationals
			const rhsNum = 2n * cosX.num * cosX.num - cosX.den * cosX.den;
			const rhsDen = cosX.den * cosX.den;
			const diff = Math.abs(rationalToNumber(cos2X) - rationalToNumber({ num: rhsNum, den: rhsDen }));
			assert.ok(
				diff < 1e-15,
				`Double-angle identity mismatch for ${x.num}/${x.den}: diff=${diff}`
			);
		}
	});

	it('maintains memoization hit consistency and isolates returned objects from mutation', () => {
		const input = { num: 3n, den: 7n };
		const first = cosRationalMemo(input);
		const second = cosRationalMemo(input);
		const uncached = cosRationalMemo(input, { useCache: false });

		assert.deepEqual(second, first);
		assert.deepEqual(uncached, first);
		assert.notEqual(first, second, 'cached hits must return fresh objects');

		// Mutating the returned object must not corrupt the memo cache
		const originalNum = first.num;
		const originalDen = first.den;
		first.num = 999999n;
		first.den = 1n;

		const third = cosRationalMemo(input);
		assert.deepEqual(third, { num: originalNum, den: originalDen });
	});

	it('lazily extends the precomputed factorial table beyond initial capacity for high term counts', () => {
		const highTerms = cosRationalMemo({ num: 1n, den: 1n }, 40);
		assertCanonicalRational(highTerms);
		const approx = rationalToNumber(highTerms);
		assert.ok(Math.abs(approx - Math.cos(1)) < 1e-15);
	});

	it('rejects invalid rational inputs with TypeError or RangeError', () => {
		const typeErrors = [
			null,
			undefined,
			0,
			1.5,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1, den: 2 },
			{ num: 1n, den: 2 },
			{ num: 1, den: 2n },
			{ num: '1', den: '2' },
		];
		for (const bad of typeErrors) {
			assert.throws(() => cosRationalMemo(bad), TypeError);
		}

		assert.throws(() => cosRationalMemo({ num: 1n, den: 0n }), RangeError);
		assert.throws(() => cosRationalMemo({ num: 0n, den: 0n }), RangeError);
	});

	it('rejects invalid options and term counts', () => {
		const valid = { num: 1n, den: 2n };

		assert.throws(() => cosRationalMemo(valid, 0), RangeError);
		assert.throws(() => cosRationalMemo(valid, -5), RangeError);
		assert.throws(() => cosRationalMemo(valid, 2.5), RangeError);
		assert.throws(() => cosRationalMemo(valid, NaN), RangeError);
		assert.throws(() => cosRationalMemo(valid, Infinity), RangeError);

		assert.throws(() => cosRationalMemo(valid, null), TypeError);
		assert.throws(() => cosRationalMemo(valid, '5'), TypeError);
		assert.throws(() => cosRationalMemo(valid, []), TypeError);

		assert.throws(() => cosRationalMemo(valid, { terms: 0 }), RangeError);
		assert.throws(() => cosRationalMemo(valid, { terms: -1 }), RangeError);
		assert.throws(() => cosRationalMemo(valid, { terms: 1.5 }), RangeError);
		assert.throws(() => cosRationalMemo(valid, { terms: '3' }), RangeError);
		assert.throws(() => cosRationalMemo(valid, { useCache: 'true' }), TypeError);
	});
});
