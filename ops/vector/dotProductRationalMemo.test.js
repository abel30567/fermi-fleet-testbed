import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductRationalMemo } from './dotProductRationalMemo.js';

/**
 * Helper to construct a rational `{ num, den }`.
 * @param {bigint|number} num
 * @param {bigint|number} [den=1n]
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) };
}

/**
 * Independent reference gcd for BigInt (standard Euclidean algorithm).
 */
function refGcd(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		const t = a % b;
		a = b;
		b = t;
	}
	return a;
}

/**
 * Independent reference rational normalization.
 */
function refNorm(q) {
	if (q.num === 0n) return { num: 0n, den: 1n };
	let num = q.num;
	let den = q.den;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = refGcd(num, den);
	return { num: num / g, den: den / g };
}

function refAdd(a, b) {
	return refNorm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function refMul(a, b) {
	return refNorm({ num: a.num * b.num, den: a.den * b.den });
}

function scaleVec(scalar, vec) {
	return vec.map((x) => refMul(scalar, x));
}

function addVec(a, b) {
	return a.map((x, i) => refAdd(x, b[i]));
}

/**
 * Deterministic PRNG (LCG) for reproducible property cross-checks.
 */
function createRng(seed) {
	let state = BigInt(seed);
	return () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
		return Number(state >> 33n);
	};
}

describe('dotProductRationalMemo', () => {
	describe('normal cases', () => {
		it('computes dot product of integer-valued rational vectors', () => {
			const u = [r(1), r(2), r(3)];
			const v = [r(4), r(5), r(6)];
			assert.deepEqual(dotProductRationalMemo(u, v), r(32, 1));
		});

		it('computes dot product of fractional vectors in lowest terms', () => {
			// (1/2)*(2/3) + (3/4)*(4/5) + (5/6)*(6/7) = 1/3 + 3/5 + 5/7 = (35 + 63 + 75) / 105 = 173/105
			const u = [r(1, 2), r(3, 4), r(5, 6)];
			const v = [r(2, 3), r(4, 5), r(6, 7)];
			assert.deepEqual(dotProductRationalMemo(u, v), r(173, 105));
		});

		it('reduces final sum to lowest terms when terms share common factors', () => {
			// (1/6)*(1/1) + (1/6)*(2/1) = 3/6 = 1/2
			const u = [r(1, 6), r(1, 6)];
			const v = [r(1, 1), r(2, 1)];
			assert.deepEqual(dotProductRationalMemo(u, v), r(1, 2));
		});

		it('handles mixed positive and negative rationals', () => {
			// (-3/4)*(2/9) + (5/6)*(-3/10) = -1/6 - 1/4 = -5/12
			const u = [r(-3, 4), r(5, 6)];
			const v = [r(2, 9), r(-3, 10)];
			assert.deepEqual(dotProductRationalMemo(u, v), r(-5, 12));
		});

		it('handles exact huge BigInt numerators and denominators without precision loss', () => {
			const big = 10n ** 30n;
			const u = [
				{ num: big + 1n, den: big },
				{ num: -1n, den: big },
			];
			const v = [
				{ num: 1n, den: 1n },
				{ num: 1n, den: 1n },
			];
			// (big + 1)/big - 1/big = big/big = 1/1
			assert.deepEqual(dotProductRationalMemo(u, v), { num: 1n, den: 1n });
		});

		it('handles values exceeding the small-GCD lookup table limit (> 64)', () => {
			// gcd(143, 187) = 11, gcd(221, 247) = 13
			const u = [r(143, 221), r(187, 247)];
			const v = [r(247, 187), r(221, 143)];
			// (143/221)*(247/187) = (13/17)*(19/17) = 247/289? Wait: 143/187 = 13/17, 247/221 = 19/17 => 247/289
			// second term: (187/247)*(221/143) = 289/247
			// sum: (247^2 + 289^2) / (289*247) = (61009 + 83521) / 71383 = 144530 / 71383
			assert.deepEqual(dotProductRationalMemo(u, v), r(144530, 71383));
		});
	});

	describe('edge cases', () => {
		it('returns 0/1 for empty vectors', () => {
			assert.deepEqual(dotProductRationalMemo([], []), r(0, 1));
		});

		it('returns 0/1 for orthogonal vectors', () => {
			const u = [r(3, 7), r(-5, 11)];
			const v = [r(5, 11), r(3, 7)];
			assert.deepEqual(dotProductRationalMemo(u, v), r(0, 1));
		});

		it('returns 0/1 for zero vectors and negative-denominator zeros', () => {
			const u = [r(0, -5), r(0, 100)];
			const v = [r(7, -3), r(-9, 2)];
			const res = dotProductRationalMemo(u, v);
			assert.deepEqual(res, { num: 0n, den: 1n });
			assert.equal(res.den > 0n, true);
		});

		it('handles single-element vectors', () => {
			assert.deepEqual(dotProductRationalMemo([r(-6, -9)], [r(15, -10)]), r(-1, 1));
		});

		it('normalizes negative denominators and unreduced inputs', () => {
			// (6/-12) * (-10/15) + (-14/-21) * (9/-12)
			// = (-1/2) * (-2/3) + (2/3) * (-3/4)
			// = 1/3 - 1/2 = -1/6
			const u = [r(6, -12), r(-14, -21)];
			const v = [r(-10, 15), r(9, -12)];
			const res = dotProductRationalMemo(u, v);
			assert.deepEqual(res, { num: -1n, den: 6n });
			assert.equal(res.den > 0n, true);
		});
	});

	describe('input validation', () => {
		it('throws RangeError on mismatched vector lengths', () => {
			assert.throws(
				() => dotProductRationalMemo([r(1, 2)], [r(1, 2), r(3, 4)]),
				RangeError,
			);
			assert.throws(() => dotProductRationalMemo([], [r(0, 1)]), RangeError);
		});

		it('throws TypeError when inputs are not arrays', () => {
			for (const bad of [null, undefined, 42, '1/2', {}, new Set()]) {
				assert.throws(() => dotProductRationalMemo(bad, []), TypeError);
				assert.throws(() => dotProductRationalMemo([], bad), TypeError);
			}
		});

		it('throws TypeError on sparse arrays', () => {
			const sparse = new Array(2);
			sparse[0] = r(1, 2);
			assert.throws(() => dotProductRationalMemo(sparse, [r(1, 1), r(1, 1)]), TypeError);
			assert.throws(() => dotProductRationalMemo([r(1, 1), r(1, 1)], sparse), TypeError);
		});

		it('throws TypeError on invalid rational elements', () => {
			const badElements = [
				null,
				undefined,
				1,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1n },
				{ den: 2n },
				{ num: NaN, den: 1n },
			];
			for (const bad of badElements) {
				assert.throws(() => dotProductRationalMemo([bad], [r(1, 1)]), TypeError);
				assert.throws(() => dotProductRationalMemo([r(1, 1)], [bad]), TypeError);
			}
		});

		it('throws RangeError on zero denominators even when paired with zero', () => {
			assert.throws(() => dotProductRationalMemo([r(1, 0)], [r(0, 1)]), RangeError);
			assert.throws(() => dotProductRationalMemo([r(0, 1)], [r(0, 0)]), RangeError);
			assert.throws(
				() => dotProductRationalMemo([r(1, 2), r(0, 1)], [r(3, 4), r(5, 0)]),
				RangeError,
			);
		});
	});

	describe('memoization hit consistency and immutability', () => {
		it('returns consistent results across repeated, unreduced-equivalent, and commuted calls', () => {
			const u1 = [r(1, 2), r(-2, 3), r(5, 7)];
			const v1 = [r(3, 5), r(9, 4), r(-14, 15)];

			const u2 = [r(-4, -8), r(6, -9), r(15, 21)];
			const v2 = [r(9, 15), r(-18, -8), r(28, -30)];

			const res1 = dotProductRationalMemo(u1, v1);
			const res2 = dotProductRationalMemo(u1, v1);
			const res3 = dotProductRationalMemo(u2, v2);
			const resCommuted = dotProductRationalMemo(v1, u1);

			assert.deepEqual(res1, res2);
			assert.deepEqual(res1, res3);
			assert.deepEqual(res1, resCommuted);
			assert.notEqual(res1, res2);
			assert.notEqual(res1, resCommuted);
		});

		it('protects memoized entries from caller mutation of returned objects', () => {
			const u = [r(7, 11), r(13, 17)];
			const v = [r(19, 23), r(29, 31)];

			const first = dotProductRationalMemo(u, v);
			const expected = { num: first.num, den: first.den };

			// Mutate returned object aggressively
			first.num = 999999n;
			first.den = -1n;

			const second = dotProductRationalMemo(u, v);
			assert.deepEqual(second, expected);
			assert.notEqual(second, first);
		});

		it('protects memoized entries from caller mutation of input vectors after call', () => {
			const u = [r(2, 5), r(3, 7)];
			const v = [r(11, 13), r(17, 19)];

			const before = dotProductRationalMemo(u, v);

			// Mutate input objects in place
			u[0].num = 100n;
			v[1].den = 3n;

			const mutatedCall = dotProductRationalMemo(u, v);
			assert.notDeepEqual(mutatedCall, before);

			// Calling again with fresh objects equal to original values still returns original result
			const restored = dotProductRationalMemo([r(2, 5), r(3, 7)], [r(11, 13), r(17, 19)]);
			assert.deepEqual(restored, before);
		});

		it('handles cache eviction gracefully beyond cache capacity', () => {
			// Exceed MAX_DOT_CACHE_SIZE (1024) with distinct pairs
			for (let i = 1; i <= 1150; i++) {
				const res = dotProductRationalMemo([r(i, i + 1), r(1, 2)], [r(i + 1, 1), r(2, 1)]);
				// i + 1 = (i + 1) / 1
				assert.deepEqual(res, r(i + 1, 1));
			}
			// Re-query early entry after eviction
			assert.deepEqual(dotProductRationalMemo([r(1, 2), r(1, 2)], [r(2, 1), r(2, 1)]), r(2, 1));
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies commutativity (u·v == v·u) across pseudo-random rational vectors', () => {
			const next = createRng(42);
			for (let trial = 0; trial < 30; trial++) {
				const dim = (next() % 7) + 1;
				const u = [];
				const v = [];
				for (let i = 0; i < dim; i++) {
					const uNum = (next() % 41) - 20;
					const uDen = ((next() % 20) + 1) * (next() % 2 === 0 ? 1 : -1);
					const vNum = (next() % 41) - 20;
					const vDen = ((next() % 20) + 1) * (next() % 2 === 0 ? 1 : -1);
					u.push(r(uNum, uDen));
					v.push(r(vNum, vDen));
				}

				const uv = dotProductRationalMemo(u, v);
				const vu = dotProductRationalMemo(v, u);
				assert.deepEqual(uv, vu);
				assert.equal(uv.den > 0n, true);
				assert.equal(refGcd(uv.num, uv.den), 1n);
			}
		});

		it('satisfies bilinearity: (a*u + b*w)·v == a*(u·v) + b*(w·v) and right-linearity', () => {
			const a = r(-5, 7);
			const b = r(11, 13);
			const u = [r(1, 3), r(-4, 5), r(7, 8), r(0, 1)];
			const w = [r(-2, 9), r(3, 4), r(-5, 6), r(13, 17)];
			const v = [r(6, 11), r(5, -12), r(8, 15), r(-3, 7)];

			// Left linearity: (a*u + b*w) · v == a*(u·v) + b*(w·v)
			const lhsLeft = dotProductRationalMemo(addVec(scaleVec(a, u), scaleVec(b, w)), v);
			const rhsLeft = refAdd(
				refMul(a, dotProductRationalMemo(u, v)),
				refMul(b, dotProductRationalMemo(w, v)),
			);
			assert.deepEqual(lhsLeft, rhsLeft);

			// Right linearity: u · (a*v + b*w) == a*(u·v) + b*(u·w)
			const lhsRight = dotProductRationalMemo(u, addVec(scaleVec(a, v), scaleVec(b, w)));
			const rhsRight = refAdd(
				refMul(a, dotProductRationalMemo(u, v)),
				refMul(b, dotProductRationalMemo(u, w)),
			);
			assert.deepEqual(lhsRight, rhsRight);
		});

		it('satisfies Cauchy-Schwarz inequality (u·v)^2 <= (u·u)*(v·v) and positive-definiteness', () => {
			const u = [r(3, 5), r(-7, 4), r(2, 9), r(11, 6)];
			const v = [r(-2, 3), r(5, 8), r(13, 7), r(-4, 5)];

			const uv = dotProductRationalMemo(u, v);
			const uu = dotProductRationalMemo(u, u);
			const vv = dotProductRationalMemo(v, v);

			assert.equal(uu.num > 0n, true);
			assert.equal(vv.num > 0n, true);

			const lhs = refMul(uv, uv);
			const rhs = refMul(uu, vv);
			// lhs <= rhs  <=>  lhs.num * rhs.den <= rhs.num * lhs.den
			assert.equal(lhs.num * rhs.den <= rhs.num * lhs.den, true);
		});

		it('matches IEEE-754 floating-point dot product within tight tolerance', () => {
			const next = createRng(1337);
			for (let trial = 0; trial < 20; trial++) {
				const dim = 6;
				const u = [];
				const v = [];
				let floatDot = 0;
				for (let i = 0; i < dim; i++) {
					const un = (next() % 201) - 100;
					const ud = (next() % 50) + 1;
					const vn = (next() % 201) - 100;
					const vd = (next() % 50) + 1;
					u.push(r(un, ud));
					v.push(r(vn, vd));
					floatDot += (un / ud) * (vn / vd);
				}

				const exact = dotProductRationalMemo(u, v);
				const exactAsFloat = Number(exact.num) / Number(exact.den);
				assert.ok(
					Math.abs(exactAsFloat - floatDot) < 1e-11,
					`Expected ${exactAsFloat} to match ${floatDot}`,
				);
			}
		});
	});
});
