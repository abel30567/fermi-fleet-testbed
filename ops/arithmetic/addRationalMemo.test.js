import test from 'node:test';
import assert from 'node:assert/strict';
import { addRationalMemo } from './addRationalMemo.js';

/**
 * Independent unmemoized reference implementation of exact rational addition.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function referenceAddRational(a, b) {
	let num = a.num * b.den + b.num * a.den;
	let den = a.den * b.den;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	let x = num < 0n ? -num : num;
	let y = den;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return { num: num / x, den: den / x };
}

function bigintGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(bigintGcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`);
	}
}

test('adds basic positive and negative rationals in lowest terms', () => {
	assert.deepEqual(addRationalMemo({ num: 1n, den: 2n }, { num: 1n, den: 3n }), {
		num: 5n,
		den: 6n,
	});
	assert.deepEqual(addRationalMemo({ num: 1n, den: 6n }, { num: 1n, den: 3n }), {
		num: 1n,
		den: 2n,
	});
	assert.deepEqual(addRationalMemo({ num: -1n, den: 2n }, { num: 1n, den: 3n }), {
		num: -1n,
		den: 6n,
	});
	assert.deepEqual(addRationalMemo({ num: -2n, den: 3n }, { num: -4n, den: 5n }), {
		num: -22n,
		den: 15n,
	});
	assert.deepEqual(addRationalMemo({ num: 3n, den: 1n }, { num: 4n, den: 1n }), {
		num: 7n,
		den: 1n,
	});
});

test('handles zero, cancellation, unreduced inputs, and negative denominators', () => {
	assert.deepEqual(addRationalMemo({ num: 0n, den: 1n }, { num: 0n, den: 1n }), {
		num: 0n,
		den: 1n,
	});
	assert.deepEqual(addRationalMemo({ num: 0n, den: -7n }, { num: 5n, den: 9n }), {
		num: 5n,
		den: 9n,
	});
	assert.deepEqual(addRationalMemo({ num: 5n, den: 9n }, { num: 0n, den: 12n }), {
		num: 5n,
		den: 9n,
	});
	assert.deepEqual(addRationalMemo({ num: 3n, den: 7n }, { num: -3n, den: 7n }), {
		num: 0n,
		den: 1n,
	});
	assert.deepEqual(addRationalMemo({ num: 2n, den: 4n }, { num: 3n, den: 6n }), {
		num: 1n,
		den: 1n,
	});
	assert.deepEqual(addRationalMemo({ num: 1n, den: -2n }, { num: -1n, den: -3n }), {
		num: -1n,
		den: 6n,
	});
	assert.deepEqual(addRationalMemo({ num: -10n, den: -15n }, { num: 4n, den: -6n }), {
		num: 0n,
		den: 1n,
	});
});

test('handles large BigInt rationals and shared large common factors', () => {
	const factor = 10n ** 30n + 7n;
	const a = { num: 3n * factor, den: 14n * factor };
	const b = { num: 5n * factor, den: 21n * factor };
	const res = addRationalMemo(a, b);
	assert.deepEqual(res, { num: 19n, den: 42n });
	assertLowestTerms(res);

	const bigA = { num: 123456789012345678901234567890123456789n, den: 987654321098765432109876543210987654321n };
	const bigB = { num: -111111111111111111111111111111111111111n, den: 222222222222222222222222222222222222223n };
	const bigRes = addRationalMemo(bigA, bigB);
	assert.deepEqual(bigRes, referenceAddRational(bigA, bigB));
	assertLowestTerms(bigRes);

	// Repeat call exercises memo cache hit on large rationals
	assert.deepEqual(addRationalMemo(bigB, bigA), bigRes);
});

test('protects precomputed and memoized entries from caller mutation', () => {
	// Precomputed table entry
	const pre1 = addRationalMemo({ num: 1n, den: 2n }, { num: 1n, den: 3n });
	pre1.num = 999n;
	pre1.den = 999n;
	assert.deepEqual(addRationalMemo({ num: 1n, den: 2n }, { num: 1n, den: 3n }), {
		num: 5n,
		den: 6n,
	});

	// Dynamic memo cache entry (denominators > 6)
	const memo1 = addRationalMemo({ num: 7n, den: 101n }, { num: 13n, den: 103n });
	memo1.num = -1n;
	memo1.den = 1n;
	const memo2 = addRationalMemo({ num: 7n, den: 101n }, { num: 13n, den: 103n });
	assert.deepEqual(memo2, { num: 2034n, den: 10403n });
});

test('handles cache eviction cleanly beyond memo capacity', () => {
	for (let i = 1n; i <= 4200n; i++) {
		const a = { num: i, den: 10007n };
		const b = { num: 1n, den: 10009n };
		const expected = referenceAddRational(a, b);
		const actual = addRationalMemo(a, b);
		assert.deepEqual(actual, expected);
	}
	// Re-query evicted early entry and verify exact recomputation
	assert.deepEqual(
		addRationalMemo({ num: 1n, den: 10007n }, { num: 1n, den: 10009n }),
		{ num: 20016n, den: 100160063n },
	);
});

test('validates inputs and throws TypeError / RangeError on invalid operands', () => {
	const valid = { num: 1n, den: 2n };

	assert.throws(() => addRationalMemo(null, valid), TypeError);
	assert.throws(() => addRationalMemo(valid, undefined), TypeError);
	assert.throws(() => addRationalMemo(42, valid), TypeError);
	assert.throws(() => addRationalMemo({ num: 1, den: 2n }, valid), TypeError);
	assert.throws(() => addRationalMemo(valid, { num: 1n, den: 2 }), TypeError);
	assert.throws(() => addRationalMemo({ num: '1', den: '2' }, valid), TypeError);
	assert.throws(() => addRationalMemo({}, valid), TypeError);

	assert.throws(() => addRationalMemo({ num: 1n, den: 0n }, valid), RangeError);
	assert.throws(() => addRationalMemo(valid, { num: 0n, den: 0n }), RangeError);
});

test('cross-checks against independent reference implementation and algebraic laws', () => {
	// Exhaustive small grid covering both precomputed and unreduced/negative inputs
	const nums = [-12n, -7n, -3n, -1n, 0n, 1n, 2n, 6n, 9n, 15n];
	const dens = [-9n, -4n, -1n, 1n, 2n, 3n, 6n, 8n, 12n];
	const samples = [];
	for (const num of nums) {
		for (const den of dens) {
			samples.push({ num, den });
		}
	}

	for (let i = 0; i < samples.length; i += 3) {
		for (let j = 0; j < samples.length; j += 5) {
			const a = samples[i];
			const b = samples[j];
			const actual = addRationalMemo(a, b);
			const expected = referenceAddRational(a, b);
			assert.deepEqual(actual, expected);
			assertLowestTerms(actual);

			// Commutativity
			assert.deepEqual(addRationalMemo(b, a), actual);

			// Additive inverse
			const negActual = { num: -actual.num, den: actual.den };
			assert.deepEqual(addRationalMemo(actual, negActual), { num: 0n, den: 1n });
		}
	}

	// Deterministic pseudo-random BigInt cross-check + associativity
	let seed = 0x123456789abcdef0n;
	const nextRand = () => {
		seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
		return seed;
	};
	const randRational = () => {
		const rawNum = nextRand() - (1n << 63n);
		const rawDen = (nextRand() % 100000n) + 1n;
		const sign = nextRand() % 2n === 0n ? 1n : -1n;
		return { num: rawNum, den: rawDen * sign };
	};

	for (let k = 0; k < 100; k++) {
		const a = randRational();
		const b = randRational();
		const c = randRational();

		const ab = addRationalMemo(a, b);
		assert.deepEqual(ab, referenceAddRational(a, b));
		assertLowestTerms(ab);

		// Associativity: (a + b) + c === a + (b + c)
		const left = addRationalMemo(ab, c);
		const right = addRationalMemo(a, addRationalMemo(b, c));
		assert.deepEqual(left, right);
		assert.deepEqual(left, referenceAddRational(referenceAddRational(a, b), c));
	}
});
