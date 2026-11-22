import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddRationalRecursive } from './vectorAddRationalRecursive.js';

/**
 * Independent BigInt GCD helper for test invariant verification and reference checks.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

/**
 * Independent iterative naive rational vector addition for cross-checking.
 */
function iterativeNaiveVectorAdd(a, b) {
	const out = [];
	for (let i = 0; i < a.length; i++) {
		let num = a[i].num * b[i].den + b[i].num * a[i].den;
		let den = a[i].den * b[i].den;
		if (num === 0n) {
			out.push({ num: 0n, den: 1n });
		} else {
			if (den < 0n) {
				num = -num;
				den = -den;
			}
			const g = refGcd(num, den);
			out.push({ num: num / g, den: den / g });
		}
	}
	return out;
}

/**
 * Asserts the canonical lowest-terms rational invariant on every element of a vector.
 */
function assertLowestTermsVector(vec) {
	assert.ok(Array.isArray(vec), 'Result must be an array');
	for (let i = 0; i < vec.length; i++) {
		const r = vec[i];
		assert.equal(typeof r.num, 'bigint', `result[${i}].num must be bigint`);
		assert.equal(typeof r.den, 'bigint', `result[${i}].den must be bigint`);
		assert.ok(r.den > 0n, `result[${i}].den must be > 0n, got ${r.den}`);
		if (r.num === 0n) {
			assert.equal(r.den, 1n, `zero at index ${i} must have den === 1n`);
		} else {
			assert.equal(
				refGcd(r.num, r.den),
				1n,
				`result[${i}] = ${r.num}/${r.den} is not in lowest terms`
			);
		}
	}
}

const r = (num, den = 1n) => ({ num, den });

describe('vectorAddRationalRecursive', () => {
	it('adds standard rational vectors of various odd and even lengths', () => {
		// Length 1
		const res1 = vectorAddRationalRecursive([r(1n, 2n)], [r(1n, 3n)]);
		assertLowestTermsVector(res1);
		assert.deepEqual(res1, [r(5n, 6n)]);

		// Length 2
		const res2 = vectorAddRationalRecursive([r(1n, 2n), r(1n, 6n)], [r(1n, 2n), r(1n, 3n)]);
		assertLowestTermsVector(res2);
		assert.deepEqual(res2, [r(1n, 1n), r(1n, 2n)]);

		// Length 3 (odd split)
		const res3 = vectorAddRationalRecursive(
			[r(2n, 3n), r(5n, 12n), r(7n, 10n)],
			[r(5n, 6n), r(7n, 12n), r(3n, 10n)]
		);
		assertLowestTermsVector(res3);
		assert.deepEqual(res3, [r(3n, 2n), r(1n, 1n), r(1n, 1n)]);

		// Length 5 (asymmetric binary split tree)
		const res5 = vectorAddRationalRecursive(
			[r(1n, 4n), r(2n, 5n), r(3n, 7n), r(4n, 9n), r(5n, 11n)],
			[r(3n, 4n), r(1n, 10n), r(4n, 7n), r(2n, 9n), r(6n, 11n)]
		);
		assertLowestTermsVector(res5);
		assert.deepEqual(res5, [r(1n, 1n), r(1n, 2n), r(1n, 1n), r(2n, 3n), r(1n, 1n)]);
	});

	it('handles empty vectors and returns a fresh array', () => {
		const a = [];
		const b = [];
		const result = vectorAddRationalRecursive(a, b);
		assertLowestTermsVector(result);
		assert.deepEqual(result, []);
		assert.notEqual(result, a);
		assert.notEqual(result, b);
	});

	it('handles zeros, negative signs, cancellation, and unreduced inputs', () => {
		const a = [
			r(0n, 5n),
			r(0n, -9n),
			r(3n, 7n),
			r(6n, 14n),
			r(-4n, -6n),
			r(100n, 250n),
			r(-15n, 25n),
			r(0n, 1n),
		];
		const b = [
			r(0n, -3n),
			r(-6n, -9n),
			r(-3n, 7n),
			r(-9n, 21n),
			r(2n, -6n),
			r(300n, 500n),
			r(12n, -20n),
			r(8n, -12n),
		];

		const result = vectorAddRationalRecursive(a, b);
		assertLowestTermsVector(result);
		assert.deepEqual(result, [
			r(0n, 1n),
			r(2n, 3n),
			r(0n, 1n),
			r(0n, 1n),
			r(1n, 3n),
			r(1n, 1n),
			r(-6n, 5n),
			r(-2n, 3n),
		]);
	});

	it('handles very large BigInt numerators and denominators accurately', () => {
		const bigA = 10n ** 120n + 7n;
		const bigB = 10n ** 120n + 9n;
		const commonFactor = 3n ** 80n;

		const u = [
			r(1n, bigA),
			r(2n * commonFactor, 6n * commonFactor),
			r(-(2n ** 256n) + 1n, 2n ** 256n),
			r(10n ** 150n, 3n),
		];
		const v = [
			r(1n, bigB),
			r(5n * commonFactor, 15n * commonFactor),
			r(-1n, 2n ** 256n),
			r(-(10n ** 150n), 3n),
		];

		const result = vectorAddRationalRecursive(u, v);
		assertLowestTermsVector(result);

		const expected = iterativeNaiveVectorAdd(u, v);
		assert.deepEqual(result, expected);
		// Explicit algebraic checks on the large terms
		assert.deepEqual(result[1], r(2n, 3n));
		assert.deepEqual(result[2], r(-1n, 1n));
		assert.deepEqual(result[3], r(0n, 1n));
	});

	it('does not mutate input arrays or input rational objects', () => {
		const a0 = r(2n, 4n);
		const a1 = r(0n, 7n);
		const b0 = r(0n, -5n);
		const b1 = r(3n, -9n);
		const a = [a0, a1];
		const b = [b0, b1];

		const result = vectorAddRationalRecursive(a, b);
		assertLowestTermsVector(result);
		assert.deepEqual(result, [r(1n, 2n), r(-1n, 3n)]);

		// Original inputs untouched
		assert.deepEqual(a, [r(2n, 4n), r(0n, 7n)]);
		assert.deepEqual(b, [r(0n, -5n), r(3n, -9n)]);
		assert.notEqual(result[0], a0);
		assert.notEqual(result[0], b0);
		assert.notEqual(result[1], a1);
		assert.notEqual(result[1], b1);
	});

	it('cross-checks against independent iterative addition and floating-point arithmetic', () => {
		// Deterministic PRNG (LCG) to generate 127 mixed rational pairs
		let seed = 123456789n;
		const nextInt = (bound) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			return (seed % bound) - bound / 2n;
		};

		const length = 127;
		const a = [];
		const b = [];
		for (let i = 0; i < length; i++) {
			const n1 = nextInt(2000n);
			let d1 = nextInt(2000n);
			if (d1 === 0n) d1 = 17n;
			const n2 = nextInt(2000n);
			let d2 = nextInt(2000n);
			if (d2 === 0n) d2 = -19n;
			a.push(r(n1, d1));
			b.push(r(n2, d2));
		}

		const actual = vectorAddRationalRecursive(a, b);
		const expected = iterativeNaiveVectorAdd(a, b);

		assertLowestTermsVector(actual);
		assert.deepEqual(actual, expected);

		// Floating-point cross-check
		for (let i = 0; i < length; i++) {
			const floatExpected = Number(a[i].num) / Number(a[i].den) + Number(b[i].num) / Number(b[i].den);
			const floatActual = Number(actual[i].num) / Number(actual[i].den);
			assert.ok(
				Math.abs(floatActual - floatExpected) <= 1e-12 * Math.max(1, Math.abs(floatExpected)),
				`Float mismatch at index ${i}: ${floatActual} vs ${floatExpected}`
			);
		}
	});

	it('satisfies vector space algebraic identities (commutativity, associativity, identity, inverse)', () => {
		const u = [r(3n, 4n), r(-5n, 6n), r(14n, -21n), r(0n, 5n), r(11n, 13n), r(-17n, -19n)];
		const v = [r(-7n, 8n), r(5n, 6n), r(2n, 3n), r(9n, 12n), r(-4n, 39n), r(2n, 19n)];
		const w = [r(1n, 16n), r(11n, 18n), r(-4n, 9n), r(-3n, 4n), r(1n, 3n), r(-1n, 1n)];
		const zero = u.map(() => r(0n, 1n));
		const negV = v.map(({ num, den }) => r(-num, den));

		// Commutativity: u + v === v + u
		const uv = vectorAddRationalRecursive(u, v);
		const vu = vectorAddRationalRecursive(v, u);
		assertLowestTermsVector(uv);
		assert.deepEqual(uv, vu);

		// Associativity: (u + v) + w === u + (v + w)
		const leftAssoc = vectorAddRationalRecursive(uv, w);
		const vw = vectorAddRationalRecursive(v, w);
		const rightAssoc = vectorAddRationalRecursive(u, vw);
		assertLowestTermsVector(leftAssoc);
		assert.deepEqual(leftAssoc, rightAssoc);

		// Additive identity: u + 0 === normalized(u)
		const uPlusZero = vectorAddRationalRecursive(u, zero);
		assertLowestTermsVector(uPlusZero);
		assert.deepEqual(uPlusZero, iterativeNaiveVectorAdd(u, zero));

		// Additive inverse: v + (-v) === 0
		const vPlusNegV = vectorAddRationalRecursive(v, negV);
		assertLowestTermsVector(vPlusNegV);
		assert.deepEqual(vPlusNegV, zero);

		// Inverse recovery: (u + v) + (-v) === normalized(u)
		const recoveredU = vectorAddRationalRecursive(uv, negV);
		assertLowestTermsVector(recoveredU);
		assert.deepEqual(recoveredU, uPlusZero);
	});

	it('handles larger vector dimensions cleanly and quickly', () => {
		const n = 1000;
		const a = Array.from({ length: n }, (_, i) => r(BigInt(i + 1), BigInt(i + 2)));
		const b = Array.from({ length: n }, (_, i) => r(1n, BigInt(i + 2)));

		const result = vectorAddRationalRecursive(a, b);
		assertLowestTermsVector(result);
		assert.equal(result.length, n);
		for (let i = 0; i < n; i++) {
			assert.deepEqual(result[i], r(1n, 1n));
		}
	});

	it('throws TypeError for non-array arguments', () => {
		const valid = [r(1n, 2n)];
		for (const bad of [null, undefined, 42, 'abc', {}, { length: 1 }, new Float64Array([1])]) {
			assert.throws(() => vectorAddRationalRecursive(bad, valid), TypeError);
			assert.throws(() => vectorAddRationalRecursive(valid, bad), TypeError);
		}
	});

	it('throws RangeError for mismatched vector lengths', () => {
		assert.throws(() => vectorAddRationalRecursive([], [r(0n, 1n)]), RangeError);
		assert.throws(() => vectorAddRationalRecursive([r(1n, 2n), r(3n, 4n)], [r(1n, 2n)]), RangeError);
	});

	it('throws TypeError for invalid rational elements and sparse arrays', () => {
		const valid = [r(1n, 2n), r(3n, 4n), r(5n, 6n)];
		const badElements = [
			null,
			undefined,
			1,
			1n,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1n },
			{ den: 2n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: NaN, den: 1n },
			{ num: '1', den: '2' },
		];

		for (const bad of badElements) {
			assert.throws(() => vectorAddRationalRecursive([bad, r(1n, 1n), r(1n, 1n)], valid), TypeError);
			assert.throws(() => vectorAddRationalRecursive(valid, [r(1n, 1n), bad, r(1n, 1n)]), TypeError);
			assert.throws(() => vectorAddRationalRecursive(valid, [r(1n, 1n), r(1n, 1n), bad]), TypeError);
		}

		// Sparse array hole
		const sparse = new Array(3);
		sparse[0] = r(1n, 2n);
		sparse[2] = r(3n, 4n);
		assert.throws(() => vectorAddRationalRecursive(sparse, valid), TypeError);
		assert.throws(() => vectorAddRationalRecursive(valid, sparse), TypeError);
	});

	it('throws RangeError when any rational element has denominator 0n', () => {
		const valid = [r(1n, 2n), r(3n, 4n)];
		assert.throws(() => vectorAddRationalRecursive([r(1n, 0n), r(1n, 2n)], valid), RangeError);
		assert.throws(() => vectorAddRationalRecursive(valid, [r(1n, 2n), r(0n, 0n)]), RangeError);
	});
});
