import test from 'node:test';
import assert from 'node:assert/strict';
import { moduloRationalRecursive } from './moduloRationalRecursive.js';

/**
 * Independent iterative GCD for test verification.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceGcd(a, b) {
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
 * Independent reference implementation of floored rational modulo
 * using native BigInt `/` and `%`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function referenceModuloRational(a, b) {
	// Normalize signs so denominators are positive
	const p = a.den < 0n ? -a.num : a.num;
	const q = a.den < 0n ? -a.den : a.den;
	const r = b.den < 0n ? -b.num : b.num;
	const s = b.den < 0n ? -b.den : b.den;

	const A = p * s;
	const B = q * r;
	const D = q * s;

	// Native BigInt `%` is truncated toward zero; adjust to floored modulo.
	let rem = A % B;
	if (rem !== 0n && (rem < 0n) !== (B < 0n)) {
		rem += B;
	}
	if (rem === 0n) {
		return { num: 0n, den: 1n };
	}
	const g = referenceGcd(rem, D);
	return { num: rem / g, den: D / g };
}

/**
 * Checks all algebraic invariants for `rem = moduloRationalRecursive(a, b)`:
 * 1. Lowest terms with `den > 0n` (and `0n/1n` for zero).
 * 2. `(a - rem) / b` is an exact integer `k`.
 * 3. Floored range bound: `0 <= rem < b` when `b > 0`, or `b < rem <= 0` when `b < 0`.
 */
function assertRationalModuloInvariants(a, b, rem) {
	assert.equal(typeof rem.num, 'bigint');
	assert.equal(typeof rem.den, 'bigint');
	assert.ok(rem.den > 0n, `expected den > 0n, got ${rem.den}`);
	if (rem.num === 0n) {
		assert.equal(rem.den, 1n);
	} else {
		assert.equal(referenceGcd(rem.num, rem.den), 1n, `result ${rem.num}/${rem.den} is not in lowest terms`);
	}

	// Normalize a and b denominators to positive for comparison
	const p = a.den < 0n ? -a.num : a.num;
	const q = a.den < 0n ? -a.den : a.den;
	const r = b.den < 0n ? -b.num : b.num;
	const s = b.den < 0n ? -b.den : b.den;

	// Check (a - rem) / b is an exact integer:
	// (p/q - rem.num/rem.den) / (r/s) = ((p*rem.den - rem.num*q) * s) / (q * rem.den * r)
	const diffNum = (p * rem.den - rem.num * q) * s;
	const diffDen = q * rem.den * r;
	assert.equal(diffNum % diffDen, 0n, '(a - rem) / b must be an exact integer');

	// Check range bound:
	// Compare rem = rem.num/rem.den with 0 and b = r/s (s > 0)
	if (r > 0n) {
		assert.ok(rem.num >= 0n, 'expected rem >= 0 for b > 0');
		assert.ok(rem.num * s < r * rem.den, 'expected rem < b for b > 0');
	} else {
		assert.ok(rem.num <= 0n, 'expected rem <= 0 for b < 0');
		assert.ok(rem.num * s > r * rem.den, 'expected rem > b for b < 0');
	}
}

test('normal positive rational cases', () => {
	// 7/2 mod 1/1 = 1/2
	assert.deepEqual(
		moduloRationalRecursive({ num: 7n, den: 2n }, { num: 1n, den: 1n }),
		{ num: 1n, den: 2n }
	);
	// 5/3 mod 2/5 = 5/3 - 4*(2/5) = (25 - 24)/15 = 1/15
	assert.deepEqual(
		moduloRationalRecursive({ num: 5n, den: 3n }, { num: 2n, den: 5n }),
		{ num: 1n, den: 15n }
	);
	// 11/6 mod 1/3 = 1/6
	assert.deepEqual(
		moduloRationalRecursive({ num: 11n, den: 6n }, { num: 1n, den: 3n }),
		{ num: 1n, den: 6n }
	);
	// Integer rationals: 17 mod 5 = 2
	assert.deepEqual(
		moduloRationalRecursive({ num: 17n, den: 1n }, { num: 5n, den: 1n }),
		{ num: 2n, den: 1n }
	);
});

test('all four sign combinations follow floored modulo semantics', () => {
	// (+, +): 5/4 mod 1/2 = 1/4
	assert.deepEqual(
		moduloRationalRecursive({ num: 5n, den: 4n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 4n }
	);
	// (-, +): -1/4 mod 1/2 = 1/4 (since -1/4 = -1*(1/2) + 1/4)
	assert.deepEqual(
		moduloRationalRecursive({ num: -1n, den: 4n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 4n }
	);
	// (-, +): -5/4 mod 1/2 = 1/4 (since -5/4 = -3*(1/2) + 1/4)
	assert.deepEqual(
		moduloRationalRecursive({ num: -5n, den: 4n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 4n }
	);
	// (+, -): 1/4 mod -1/2 = -1/4 (since 1/4 = -1*(-1/2) + (-1/4))
	assert.deepEqual(
		moduloRationalRecursive({ num: 1n, den: 4n }, { num: -1n, den: 2n }),
		{ num: -1n, den: 4n }
	);
	// (-, -): -5/4 mod -1/2 = -1/4 (since -5/4 = 2*(-1/2) + (-1/4))
	assert.deepEqual(
		moduloRationalRecursive({ num: -5n, den: 4n }, { num: -1n, den: 2n }),
		{ num: -1n, den: 4n }
	);
});

test('edge cases: zero dividend, exact multiples, smaller dividend, unnormalized inputs', () => {
	// Zero dividend
	assert.deepEqual(
		moduloRationalRecursive({ num: 0n, den: 7n }, { num: 3n, den: 5n }),
		{ num: 0n, den: 1n }
	);
	assert.deepEqual(
		moduloRationalRecursive({ num: 0n, den: -3n }, { num: -2n, den: 9n }),
		{ num: 0n, den: 1n }
	);

	// Exact multiples (positive and negative)
	assert.deepEqual(
		moduloRationalRecursive({ num: 9n, den: 4n }, { num: 3n, den: 4n }),
		{ num: 0n, den: 1n }
	);
	assert.deepEqual(
		moduloRationalRecursive({ num: -9n, den: 4n }, { num: 3n, den: 4n }),
		{ num: 0n, den: 1n }
	);
	assert.deepEqual(
		moduloRationalRecursive({ num: 3n, den: 2n }, { num: -1n, den: 2n }),
		{ num: 0n, den: 1n }
	);
	assert.deepEqual(
		moduloRationalRecursive({ num: -3n, den: 2n }, { num: -1n, den: 2n }),
		{ num: 0n, den: 1n }
	);

	// Dividend already strictly within [0, b)
	const a = { num: 2n, den: 6n };
	const b = { num: 3n, den: 4n };
	const res = moduloRationalRecursive(a, b);
	assert.deepEqual(res, { num: 1n, den: 3n });
	assert.notEqual(res, a);
	assert.deepEqual(a, { num: 2n, den: 6n });

	// Unnormalized inputs and negative denominators
	assert.deepEqual(
		moduloRationalRecursive({ num: 14n, den: -4n }, { num: -6n, den: -6n }),
		{ num: 1n, den: 2n }
	);
	assert.deepEqual(
		moduloRationalRecursive({ num: -10n, den: -15n }, { num: 2n, den: -6n }),
		{ num: 0n, den: 1n }
	);
});

test('boundary bit-length differences and large BigInts (divide-and-conquer stress)', () => {
	// Test values near n = 2d, 3d, 4d boundaries
	for (const mult of [0n, 1n, 2n, 3n, 4n, 7n, 8n, 15n, 16n]) {
		for (const offset of [-1n, 0n, 1n]) {
			const d = 17n;
			const n = mult * d + offset;
			const a = { num: n, den: 13n };
			const b = { num: d, den: 13n };
			const actual = moduloRationalRecursive(a, b);
			const expected = referenceModuloRational(a, b);
			assert.deepEqual(actual, expected);
			assertRationalModuloInvariants(a, b, actual);
		}
	}

	// Very large dividend relative to divisor (tests deep recursive splitting without stack overflow)
	const bigA = { num: (1n << 4096n) + 12345678901234567890123456789n, den: 97n };
	const smallB = { num: 355n, den: 113n };
	const bigRes = moduloRationalRecursive(bigA, smallB);
	assert.deepEqual(bigRes, referenceModuloRational(bigA, smallB));
	assertRationalModuloInvariants(bigA, smallB, bigRes);

	// Negative large dividend with negative large divisor
	const negBigA = { num: -(1n << 2048n) - 999999999999999999n, den: (1n << 128n) + 15n };
	const negBigB = { num: -((1n << 512n) + 7n), den: (1n << 128n) + 3n };
	const negBigRes = moduloRationalRecursive(negBigA, negBigB);
	assert.deepEqual(negBigRes, referenceModuloRational(negBigA, negBigB));
	assertRationalModuloInvariants(negBigA, negBigB, negBigRes);
});

test('invalid inputs throw TypeError or RangeError', () => {
	const valid = { num: 1n, den: 2n };

	// Non-objects, null, undefined, arrays
	for (const bad of [undefined, null, 0, 1n, '1/2', true, [], [1n, 2n]]) {
		assert.throws(() => moduloRationalRecursive(bad, valid), TypeError);
		assert.throws(() => moduloRationalRecursive(valid, bad), TypeError);
	}

	// Non-BigInt properties or missing properties
	for (const bad of [
		{},
		{ num: 1n },
		{ den: 2n },
		{ num: 1, den: 2n },
		{ num: 1n, den: 2 },
		{ num: '1', den: '2' },
		{ num: NaN, den: 1n },
	]) {
		assert.throws(() => moduloRationalRecursive(bad, valid), TypeError);
		assert.throws(() => moduloRationalRecursive(valid, bad), TypeError);
	}

	// Zero denominators
	assert.throws(() => moduloRationalRecursive({ num: 1n, den: 0n }, valid), RangeError);
	assert.throws(() => moduloRationalRecursive(valid, { num: 1n, den: 0n }), RangeError);
	assert.throws(() => moduloRationalRecursive({ num: 0n, den: 0n }, valid), RangeError);

	// Modulo by zero
	assert.throws(() => moduloRationalRecursive(valid, { num: 0n, den: 1n }), RangeError);
	assert.throws(() => moduloRationalRecursive(valid, { num: 0n, den: -5n }), RangeError);
	assert.throws(() => moduloRationalRecursive({ num: 0n, den: 1n }, { num: 0n, den: 3n }), RangeError);
});

test('independent cross-check against native BigInt reference and algebraic invariants', () => {
	// Deterministic PRNG (xorshift64*) for broad coverage across signs and magnitudes
	let state = 0x123456789abcdef1n;
	const mask64 = (1n << 64n) - 1n;
	function nextBigInt() {
		state ^= state >> 12n;
		state ^= (state << 25n) & mask64;
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & mask64;
	}

	for (let i = 0; i < 200; i++) {
		const aSign = nextBigInt() & 1n ? -1n : 1n;
		const bSign = nextBigInt() & 1n ? -1n : 1n;
		const aDenSign = nextBigInt() & 1n ? -1n : 1n;
		const bDenSign = nextBigInt() & 1n ? -1n : 1n;

		const shiftA = nextBigInt() % 180n;
		const shiftB = nextBigInt() % 60n;

		const a = {
			num: aSign * ((nextBigInt() << shiftA) ^ nextBigInt()),
			den: aDenSign * ((nextBigInt() % 100000n) + 1n),
		};
		const b = {
			num: bSign * (((nextBigInt() << shiftB) ^ nextBigInt()) + 1n),
			den: bDenSign * ((nextBigInt() % 100000n) + 1n),
		};

		const actual = moduloRationalRecursive(a, b);
		const expected = referenceModuloRational(a, b);
		assert.deepEqual(actual, expected);
		assertRationalModuloInvariants(a, b, actual);
	}
});

test('independent cross-check against exact dyadic IEEE-754 floating-point arithmetic', () => {
	// For powers-of-two denominators with small numerators, IEEE-754 float math is exact.
	const cases = [
		[{ num: 13n, den: 4n }, { num: 3n, den: 8n }],
		[{ num: -13n, den: 4n }, { num: 3n, den: 8n }],
		[{ num: 13n, den: 4n }, { num: -3n, den: 8n }],
		[{ num: -13n, den: 4n }, { num: -3n, den: 8n }],
		[{ num: 45n, den: 16n }, { num: 5n, den: 4n }],
		[{ num: -7n, den: 8n }, { num: 1n, den: 2n }],
	];

	for (const [a, b] of cases) {
		const actual = moduloRationalRecursive(a, b);
		const fa = Number(a.num) / Number(a.den);
		const fb = Number(b.num) / Number(b.den);
		const expectedFloat = fa - Math.floor(fa / fb) * fb;
		const actualFloat = Number(actual.num) / Number(actual.den);
		assert.equal(actualFloat, expectedFloat);
		assertRationalModuloInvariants(a, b, actual);
	}
});
