import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductRationalRecursive } from './dotProductRationalRecursive.js';

/**
 * Helper to create a rational object concisely.
 * @param {bigint} num
 * @param {bigint} [den=1n]
 */
const r = (num, den = 1n) => ({ num, den });

/**
 * Independent Euclidean gcd for invariant assertions and reference checks.
 * @param {bigint} a
 * @param {bigint} b
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

/**
 * Verifies the canonical lowest-terms rational invariant on a result.
 * @param {{ num: bigint, den: bigint }} q
 */
function assertCanonicalRational(q) {
	assert.equal(typeof q, 'object');
	assert.notEqual(q, null);
	assert.equal(typeof q.num, 'bigint');
	assert.equal(typeof q.den, 'bigint');
	assert.ok(q.den > 0n, `Expected den > 0n, got ${q.den}`);
	if (q.num === 0n) {
		assert.equal(q.den, 1n, `Expected zero denominator to be 1n, got ${q.den}`);
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `Expected lowest terms for ${q.num}/${q.den}`);
	}
}

/**
 * Independent iterative naive reference dot product (no divide-and-conquer).
 * @param {Array<{ num: bigint, den: bigint }>} vecA
 * @param {Array<{ num: bigint, den: bigint }>} vecB
 */
function iterativeReferenceDot(vecA, vecB) {
	let accNum = 0n;
	let accDen = 1n;
	for (let i = 0; i < vecA.length; i++) {
		const termNum = vecA[i].num * vecB[i].num;
		const termDen = vecA[i].den * vecB[i].den;
		accNum = accNum * termDen + termNum * accDen;
		accDen = accDen * termDen;
		if (accDen < 0n) {
			accNum = -accNum;
			accDen = -accDen;
		}
		const g = gcd(accNum, accDen);
		accNum /= g;
		accDen /= g;
	}
	return accNum === 0n ? { num: 0n, den: 1n } : { num: accNum, den: accDen };
}

/**
 * Exact rational addition helper for algebraic identity tests.
 */
function ratAdd(a, b) {
	let num = a.num * b.den + b.num * a.den;
	let den = a.den * b.den;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

/**
 * Exact rational multiplication helper for algebraic identity tests.
 */
function ratMul(a, b) {
	let num = a.num * b.num;
	let den = a.den * b.den;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

describe('dotProductRationalRecursive', () => {
	it('returns { num: 0n, den: 1n } for empty vectors', () => {
		const res = dotProductRationalRecursive([], []);
		assertCanonicalRational(res);
		assert.deepEqual(res, { num: 0n, den: 1n });
	});

	it('handles single-element vectors including zero, negatives, and unreduced forms', () => {
		const res1 = dotProductRationalRecursive([r(2n, 3n)], [r(9n, 4n)]);
		assertCanonicalRational(res1);
		assert.deepEqual(res1, r(3n, 2n));

		const res2 = dotProductRationalRecursive([r(-6n, -9n)], [r(15n, -10n)]);
		assertCanonicalRational(res2);
		assert.deepEqual(res2, r(-1n, 1n));

		const res3 = dotProductRationalRecursive([r(0n, -7n)], [r(123n, 456n)]);
		assertCanonicalRational(res3);
		assert.deepEqual(res3, r(0n, 1n));
	});

	it('computes exact dot products for even and odd length vectors', () => {
		// Length 2: (1/2)*(2/3) + (3/4)*(4/5) = 1/3 + 3/5 = 14/15
		const res2 = dotProductRationalRecursive([r(1n, 2n), r(3n, 4n)], [r(2n, 3n), r(4n, 5n)]);
		assertCanonicalRational(res2);
		assert.deepEqual(res2, r(14n, 15n));

		// Length 3: (1/2)*(1/3) + (-2/5)*(5/6) + (7/3)*(3/14) = 1/6 - 1/3 + 1/2 = 1/3
		const res3 = dotProductRationalRecursive(
			[r(1n, 2n), r(-2n, 5n), r(7n, 3n)],
			[r(1n, 3n), r(5n, 6n), r(3n, 14n)],
		);
		assertCanonicalRational(res3);
		assert.deepEqual(res3, r(1n, 3n));

		// Length 5: harmonic-like dot product sum_{k=1}^5 (1/k)*(1/(k+1)) = 1 - 1/6 = 5/6
		const u5 = [r(1n, 1n), r(1n, 2n), r(1n, 3n), r(1n, 4n), r(1n, 5n)];
		const v5 = [r(1n, 2n), r(1n, 3n), r(1n, 4n), r(1n, 5n), r(1n, 6n)];
		const res5 = dotProductRationalRecursive(u5, v5);
		assertCanonicalRational(res5);
		assert.deepEqual(res5, r(5n, 6n));

		// Telescoping identity over length 15: sum_{k=1}^{15} 1/(k*(k+1)) = 15/16
		const u15 = Array.from({ length: 15 }, (_, i) => r(1n, BigInt(i + 1)));
		const v15 = Array.from({ length: 15 }, (_, i) => r(1n, BigInt(i + 2)));
		const res15 = dotProductRationalRecursive(u15, v15);
		assertCanonicalRational(res15);
		assert.deepEqual(res15, r(15n, 16n));
	});

	it('handles exact cancellation to zero and orthogonal vectors', () => {
		const res = dotProductRationalRecursive(
			[r(1n, 2n), r(1n, 3n), r(1n, 6n)],
			[r(2n, 3n), r(-1n, 1n), r(0n, -5n)],
		);
		assertCanonicalRational(res);
		assert.deepEqual(res, r(0n, 1n));

		// Orthogonal 4D vectors: (a, b, c, d) . (-b, a, -d, c) = 0
		const u = [r(13n, 17n), r(-29n, 31n), r(37n, 41n), r(-43n, 47n)];
		const v = [r(29n, 31n), r(13n, 17n), r(43n, 47n), r(37n, 41n)];
		const ortho = dotProductRationalRecursive(u, v);
		assertCanonicalRational(ortho);
		assert.deepEqual(ortho, r(0n, 1n));
	});

	it('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
		const vecA = [r(-12n, -18n), r(20n, -30n), r(0n, -99n)];
		const vecB = [r(27n, -18n), r(-9n, -12n), r(50n, -25n)];
		const snapshotA = vecA.map((x) => ({ ...x }));
		const snapshotB = vecB.map((x) => ({ ...x }));

		// (2/3)*(-3/2) + (-2/3)*(3/4) + 0 = -1 - 1/2 = -3/2
		const res = dotProductRationalRecursive(vecA, vecB);
		assertCanonicalRational(res);
		assert.deepEqual(res, r(-3n, 2n));
		assert.deepEqual(vecA, snapshotA);
		assert.deepEqual(vecB, snapshotB);
	});

	it('handles very large BigInt numerators and denominators accurately', () => {
		const bigA = 10n ** 60n + 7n;
		const bigB = 10n ** 60n + 9n;
		const bigC = 10n ** 55n + 3n;
		const bigD = 10n ** 55n + 11n;

		const vecA = [r(bigA, bigB), r(bigC, bigD), r(-bigA, bigB)];
		const vecB = [r(bigB, bigA), r(bigD, bigC), r(bigB, bigA)];
		// Term 0 = 1, Term 1 = 1, Term 2 = -1 => exact sum = 1
		const res = dotProductRationalRecursive(vecA, vecB);
		assertCanonicalRational(res);
		assert.deepEqual(res, r(1n, 1n));

		// Non-cancelling huge rationals cross-checked against iterative reference
		const hugeA = [r(10n ** 40n + 1n, 3n ** 35n), r(-(7n ** 30n), 11n ** 25n), r(13n ** 28n, 17n ** 20n)];
		const hugeB = [r(5n ** 30n, 2n ** 40n), r(19n ** 22n, 23n ** 18n), r(-(29n ** 15n), 31n ** 15n)];
		const hugeRes = dotProductRationalRecursive(hugeA, hugeB);
		assertCanonicalRational(hugeRes);
		assert.deepEqual(hugeRes, iterativeReferenceDot(hugeA, hugeB));
	});

	it('cross-checks against an independent iterative reference and floating-point arithmetic', () => {
		// Deterministic LCG PRNG for reproducible tests
		let seed = 42n;
		const nextInt = (min, max) => {
			seed = (seed * 1103515245n + 12345n) & 0x7fffffffn;
			return min + Number(seed % BigInt(max - min + 1));
		};

		for (const len of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 31, 32]) {
			const vecA = [];
			const vecB = [];
			for (let i = 0; i < len; i++) {
				const numA = BigInt(nextInt(-25, 25));
				let denA = BigInt(nextInt(-20, 20));
				if (denA === 0n) denA = 1n;
				const numB = BigInt(nextInt(-25, 25));
				let denB = BigInt(nextInt(-20, 20));
				if (denB === 0n) denB = 1n;
				vecA.push(r(numA, denA));
				vecB.push(r(numB, denB));
			}

			const actual = dotProductRationalRecursive(vecA, vecB);
			const expected = iterativeReferenceDot(vecA, vecB);
			assertCanonicalRational(actual);
			assert.deepEqual(actual, expected, `Mismatch for vector length ${len}`);

			// Floating-point cross-check via Number
			const floatExpected = vecA.reduce(
				(acc, a, i) => acc + (Number(a.num) / Number(a.den)) * (Number(vecB[i].num) / Number(vecB[i].den)),
				0,
			);
			const floatActual = Number(actual.num) / Number(actual.den);
			assert.ok(
				Math.abs(floatActual - floatExpected) <= 1e-10 * (1 + Math.abs(floatExpected)),
				`Float cross-check failed for length ${len}: ${floatActual} vs ${floatExpected}`,
			);
		}
	});

	it('satisfies algebraic vector dot-product identities (commutativity, bilinearity, Cauchy-Schwarz)', () => {
		const u = [r(3n, 7n), r(-5n, 11n), r(2n, 3n), r(-1n, 4n), r(8n, 9n)];
		const v = [r(-2n, 5n), r(7n, 13n), r(4n, 9n), r(5n, 6n), r(-3n, 7n)];
		const w = [r(1n, 2n), r(-1n, 3n), r(3n, 5n), r(-7n, 8n), r(2n, 11n)];
		const scalar = r(-7n, 12n);

		// Commutativity: u . v == v . u
		const uv = dotProductRationalRecursive(u, v);
		const vu = dotProductRationalRecursive(v, u);
		assertCanonicalRational(uv);
		assert.deepEqual(uv, vu);

		// Distributivity: u . (v + w) == (u . v) + (u . w)
		const vPlusW = v.map((vi, i) => ratAdd(vi, w[i]));
		const leftDist = dotProductRationalRecursive(u, vPlusW);
		const rightDist = ratAdd(uv, dotProductRationalRecursive(u, w));
		assertCanonicalRational(leftDist);
		assert.deepEqual(leftDist, rightDist);

		// Scalar homogeneity: (c * u) . v == c * (u . v)
		const cU = u.map((ui) => ratMul(scalar, ui));
		const leftHomog = dotProductRationalRecursive(cU, v);
		const rightHomog = ratMul(scalar, uv);
		assertCanonicalRational(leftHomog);
		assert.deepEqual(leftHomog, rightHomog);

		// Exact Cauchy-Schwarz inequality: (u . v)^2 <= (u . u) * (v . v)
		const uu = dotProductRationalRecursive(u, u);
		const vv = dotProductRationalRecursive(v, v);
		assert.ok(uu.num > 0n);
		assert.ok(vv.num > 0n);
		const lhs = ratMul(uv, uv);
		const rhs = ratMul(uu, vv);
		assert.ok(
			lhs.num * rhs.den <= rhs.num * lhs.den,
			'Cauchy-Schwarz inequality violated',
		);
	});

	it('performs efficiently on larger vectors', () => {
		const n = 256;
		const u = Array.from({ length: n }, (_, i) => r(1n, BigInt(i + 1)));
		const v = Array.from({ length: n }, (_, i) => r(1n, BigInt(i + 2)));
		const res = dotProductRationalRecursive(u, v);
		assertCanonicalRational(res);
		// Telescoping sum_{k=1}^{256} 1/(k*(k+1)) = 256/257
		assert.deepEqual(res, r(256n, 257n));
	});

	it('throws TypeError for non-array inputs', () => {
		const invalidValues = [null, undefined, 42, 'vector', {}, new Int32Array([1])];
		for (const bad of invalidValues) {
			assert.throws(() => dotProductRationalRecursive(bad, []), TypeError);
			assert.throws(() => dotProductRationalRecursive([], bad), TypeError);
		}
	});

	it('throws RangeError for mismatched vector lengths', () => {
		assert.throws(() => dotProductRationalRecursive([r(1n, 1n)], []), RangeError);
		assert.throws(() => dotProductRationalRecursive([], [r(1n, 1n)]), RangeError);
		assert.throws(
			() => dotProductRationalRecursive([r(1n, 2n), r(3n, 4n)], [r(1n, 2n)]),
			RangeError,
		);
	});

	it('throws TypeError for malformed rational elements and sparse arrays', () => {
		const malformed = [
			null,
			undefined,
			1,
			1n,
			'1/2',
			{},
			{ num: 1n },
			{ den: 1n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: NaN, den: 1n },
		];
		for (const bad of malformed) {
			assert.throws(() => dotProductRationalRecursive([bad], [r(1n, 1n)]), TypeError);
			assert.throws(() => dotProductRationalRecursive([r(1n, 1n)], [bad]), TypeError);
		}

		// Sparse array hole
		const sparseA = new Array(2);
		sparseA[0] = r(1n, 1n);
		assert.throws(
			() => dotProductRationalRecursive(sparseA, [r(1n, 1n), r(2n, 1n)]),
			TypeError,
		);
	});

	it('throws RangeError for zero denominators anywhere in either vector', () => {
		assert.throws(
			() => dotProductRationalRecursive([r(1n, 0n)], [r(1n, 1n)]),
			RangeError,
		);
		assert.throws(
			() => dotProductRationalRecursive([r(1n, 1n)], [r(0n, 0n)]),
			RangeError,
		);
		// Ensure late invalid element is still caught even when paired with zero
		assert.throws(
			() =>
				dotProductRationalRecursive(
					[r(0n, 1n), r(0n, 1n), r(0n, 1n)],
					[r(1n, 2n), r(3n, 4n), r(5n, 0n)],
				),
			RangeError,
		);
	});
});
