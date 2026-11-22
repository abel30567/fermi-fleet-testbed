import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionRationalRecursive } from './projectionRationalRecursive.js';

/** Helper to construct a rational literal cleanly. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

function absBigInt(n) {
	return n < 0n ? -n : n;
}

function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

/** Asserts every component of a rational vector satisfies the lowest-terms invariant. */
function assertLowestTermsVector(vec) {
	assert.ok(Array.isArray(vec), 'Result must be an array');
	for (let i = 0; i < vec.length; i++) {
		const r = vec[i];
		assert.equal(typeof r.num, 'bigint', `result[${i}].num must be bigint`);
		assert.equal(typeof r.den, 'bigint', `result[${i}].den must be bigint`);
		assert.ok(r.den > 0n, `result[${i}].den must be > 0n, got ${r.den}`);
		assert.equal(
			gcdBigInt(r.num, r.den),
			1n,
			`result[${i}] = ${r.num}/${r.den} is not in lowest terms`,
		);
		if (r.num === 0n) {
			assert.equal(r.den, 1n, `result[${i}] zero must have den === 1n`);
		}
	}
}

/** Independent iterative exact rational helpers for cross-checking. */
function iterNormalize(r) {
	if (r.num === 0n) return { num: 0n, den: 1n };
	let num = r.num;
	let den = r.den;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

function iterAdd(a, b) {
	return iterNormalize({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function iterSub(a, b) {
	return iterNormalize({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}

function iterMul(a, b) {
	return iterNormalize({ num: a.num * b.num, den: a.den * b.den });
}

function iterDiv(a, b) {
	return iterNormalize({ num: a.num * b.den, den: a.den * b.num });
}

function iterDot(a, b) {
	let sum = { num: 0n, den: 1n };
	for (let i = 0; i < a.length; i++) {
		sum = iterAdd(sum, iterMul(iterNormalize(a[i]), iterNormalize(b[i])));
	}
	return sum;
}

function iterProjectionReference(u, v) {
	const uDotV = iterDot(u, v);
	const vDotV = iterDot(v, v);
	const c = iterDiv(uDotV, vDotV);
	return v.map((vi) => iterMul(c, iterNormalize(vi)));
}

describe('projectionRationalRecursive', () => {
	describe('normal cases', () => {
		it('projects 2D vectors onto coordinate axes and arbitrary lines', () => {
			const p1 = projectionRationalRecursive([q(3), q(4)], [q(1), q(0)]);
			assertLowestTermsVector(p1);
			assert.deepEqual(p1, [q(3), q(0)]);

			// u = (3, 4), v = (1, 2) => u·v = 11, v·v = 5 => (11/5, 22/5)
			const p2 = projectionRationalRecursive([q(3), q(4)], [q(1), q(2)]);
			assertLowestTermsVector(p2);
			assert.deepEqual(p2, [q(11, 5), q(22, 5)]);
		});

		it('projects 3D vectors with fractional and negative components', () => {
			const u = [q(1, 2), q(-2, 3), q(3, 4)];
			const v = [q(2, 5), q(1, 3), q(-1, 2)];
			// u·v = 1/5 - 2/9 - 3/8 = (72 - 80 - 135) / 360 = -143/360
			// v·v = 4/25 + 1/9 + 1/4 = (144 + 100 + 225) / 900 = 469/900
			// c = (-143/360) / (469/900) = (-143 * 5) / (469 * 2) = -715/938
			// proj = c * v = [-143/469, -715/2814, 715/1876]
			const result = projectionRationalRecursive(u, v);
			assertLowestTermsVector(result);
			assert.deepEqual(result, [q(-143, 469), q(-715, 2814), q(715, 1876)]);
		});

		it('handles odd and even higher dimensions cleanly', () => {
			for (const dim of [1, 2, 3, 5, 7, 8, 13, 16]) {
				const u = Array.from({ length: dim }, (_, i) =>
					q((i % 2 === 0 ? 1 : -1) * (i + 2), i + 3),
				);
				const v = Array.from({ length: dim }, (_, i) => q(i + 1, i + 2));
				const actual = projectionRationalRecursive(u, v);
				const expected = iterProjectionReference(u, v);
				assertLowestTermsVector(actual);
				assert.deepEqual(actual, expected);
			}
		});
	});

	describe('edge cases', () => {
		it('returns u for 1D vectors regardless of non-zero v', () => {
			const res = projectionRationalRecursive([q(-7, 12)], [q(-5, 3)]);
			assertLowestTermsVector(res);
			assert.deepEqual(res, [q(-7, 12)]);
		});

		it('returns the exact zero vector when u is zero', () => {
			const res = projectionRationalRecursive(
				[q(0, 5), q(0, -3), q(0, 1)],
				[q(2, 3), q(-4, 5), q(7, 2)],
			);
			assertLowestTermsVector(res);
			assert.deepEqual(res, [q(0), q(0), q(0)]);
		});

		it('returns the exact zero vector when u and v are orthogonal', () => {
			const res = projectionRationalRecursive(
				[q(2, 3), q(1, 2), q(-1, 6)],
				[q(1, 2), q(-1, 3), q(1, 1)],
			);
			// u·v = 1/3 - 1/6 - 1/6 = 0
			assertLowestTermsVector(res);
			assert.deepEqual(res, [q(0), q(0), q(0)]);
		});

		it('returns u in lowest terms when u is parallel or antiparallel to v', () => {
			const v = [q(2, 3), q(-4, 5), q(6, 7)];
			const uParallel = [q(4, 3), q(-8, 5), q(12, 7)];
			const uAntiParallel = [q(-6, 9), q(12, 15), q(-18, 21)];

			const p1 = projectionRationalRecursive(uParallel, v);
			assertLowestTermsVector(p1);
			assert.deepEqual(p1, uParallel);

			const p2 = projectionRationalRecursive(uAntiParallel, v);
			assertLowestTermsVector(p2);
			assert.deepEqual(p2, [q(-2, 3), q(4, 5), q(-6, 7)]);
		});

		it('normalizes unreduced inputs and negative denominators', () => {
			const u = [
				{ num: 6n, den: -9n },
				{ num: -10n, den: -15n },
				{ num: 0n, den: -7n },
			];
			const v = [
				{ num: -4n, den: 8n },
				{ num: 6n, den: -12n },
				{ num: -9n, den: -3n },
			];
			const actual = projectionRationalRecursive(u, v);
			const expected = iterProjectionReference(u, v);
			assertLowestTermsVector(actual);
			assert.deepEqual(actual, expected);
		});

		it('preserves exactness for very large BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 40n + 7n;
			const big2 = 10n ** 40n + 13n;
			const big3 = 10n ** 35n + 3n;
			const u = [
				{ num: big1, den: 3n },
				{ num: -big2, den: 5n },
				{ num: big3, den: 7n },
			];
			const v = [
				{ num: big2, den: 11n },
				{ num: big1, den: 13n },
				{ num: -big3, den: 17n },
			];
			const actual = projectionRationalRecursive(u, v);
			const expected = iterProjectionReference(u, v);
			assertLowestTermsVector(actual);
			assert.deepEqual(actual, expected);
		});

		it('does not mutate input vectors or their rational objects', () => {
			const u = [
				{ num: 4n, den: -6n },
				{ num: 9n, den: 3n },
			];
			const v = [
				{ num: -2n, den: -4n },
				{ num: 6n, den: 9n },
			];
			const uSnapshot = u.map((r) => ({ ...r }));
			const vSnapshot = v.map((r) => ({ ...r }));

			projectionRationalRecursive(u, v);

			assert.deepEqual(u, uSnapshot);
			assert.deepEqual(v, vSnapshot);
		});
	});

	describe('algebraic identities and floating-point cross-checks', () => {
		it('satisfies idempotence, residual orthogonality, scale invariance, and Pythagorean theorem', () => {
			const u = [q(5, 7), q(-11, 13), q(3, 4), q(17, 6), q(-2, 9)];
			const v = [q(-3, 5), q(2, 7), q(4, 11), q(-1, 2), q(5, 3)];

			const p = projectionRationalRecursive(u, v);
			assertLowestTermsVector(p);

			// 1. Idempotence: proj_v(proj_v(u)) === proj_v(u)
			const pp = projectionRationalRecursive(p, v);
			assertLowestTermsVector(pp);
			assert.deepEqual(pp, p);

			// 2. Orthogonality of residual: (u - proj_v(u)) · v === 0
			const residual = u.map((ui, i) => iterSub(ui, p[i]));
			assert.deepEqual(iterDot(residual, v), q(0));

			// 3. Scale invariance in v: proj_{k*v}(u) === proj_v(u) for positive and negative k
			for (const k of [q(7, 3), q(-19, 11)]) {
				const kv = v.map((vi) => iterMul(k, vi));
				const pScaled = projectionRationalRecursive(u, kv);
				assertLowestTermsVector(pScaled);
				assert.deepEqual(pScaled, p);
			}

			// 4. Pythagorean theorem: ||u||^2 === ||proj_v(u)||^2 + ||u - proj_v(u)||^2
			const normSqU = iterDot(u, u);
			const normSqP = iterDot(p, p);
			const normSqR = iterDot(residual, residual);
			assert.deepEqual(iterAdd(normSqP, normSqR), normSqU);
		});

		it('satisfies linearity in u: proj_v(a*u1 + b*u2) === a*proj_v(u1) + b*proj_v(u2)', () => {
			const u1 = [q(1, 2), q(-3, 4), q(5, 6), q(-7, 8)];
			const u2 = [q(-2, 3), q(4, 5), q(-6, 7), q(8, 9)];
			const v = [q(3, 2), q(-1, 5), q(2, 3), q(7, 4)];
			const a = q(5, 3);
			const b = q(-7, 4);

			const combinedU = u1.map((x, i) => iterAdd(iterMul(a, x), iterMul(b, u2[i])));
			const lhs = projectionRationalRecursive(combinedU, v);

			const p1 = projectionRationalRecursive(u1, v);
			const p2 = projectionRationalRecursive(u2, v);
			const rhs = p1.map((x, i) => iterAdd(iterMul(a, x), iterMul(b, p2[i])));

			assertLowestTermsVector(lhs);
			assert.deepEqual(lhs, rhs);
		});

		it('matches floating-point projection within 1e-12', () => {
			const u = [q(7, 3), q(-11, 5), q(13, 7), q(-17, 9), q(19, 11)];
			const v = [q(-2, 3), q(5, 7), q(-8, 9), q(11, 13), q(-14, 15)];

			const exact = projectionRationalRecursive(u, v);
			assertLowestTermsVector(exact);

			const uFloat = u.map((r) => Number(r.num) / Number(r.den));
			const vFloat = v.map((r) => Number(r.num) / Number(r.den));
			const uv = uFloat.reduce((acc, x, i) => acc + x * vFloat[i], 0);
			const vv = vFloat.reduce((acc, x) => acc + x * x, 0);
			const scale = uv / vv;
			const floatProj = vFloat.map((x) => scale * x);

			for (let i = 0; i < exact.length; i++) {
				const exactFloat = Number(exact[i].num) / Number(exact[i].den);
				assert.ok(
					Math.abs(exactFloat - floatProj[i]) < 1e-12,
					`Component ${i} mismatch: exact=${exactFloat}, float=${floatProj[i]}`,
				);
			}
		});
	});

	describe('input validation and errors', () => {
		it('throws TypeError if u or v is not an array', () => {
			assert.throws(() => projectionRationalRecursive(null, [q(1)]), TypeError);
			assert.throws(() => projectionRationalRecursive([q(1)], undefined), TypeError);
			assert.throws(() => projectionRationalRecursive('123', [q(1)]), TypeError);
			assert.throws(() => projectionRationalRecursive([q(1)], { num: 1n, den: 1n }), TypeError);
		});

		it('throws RangeError if u or v is empty or lengths differ', () => {
			assert.throws(() => projectionRationalRecursive([], []), RangeError);
			assert.throws(() => projectionRationalRecursive([], [q(1)]), RangeError);
			assert.throws(() => projectionRationalRecursive([q(1)], []), RangeError);
			assert.throws(() => projectionRationalRecursive([q(1), q(2)], [q(1)]), RangeError);
			assert.throws(() => projectionRationalRecursive([q(1)], [q(1), q(2)]), RangeError);
		});

		it('throws TypeError for malformed rational elements or sparse arrays', () => {
			assert.throws(() => projectionRationalRecursive([null], [q(1)]), TypeError);
			assert.throws(() => projectionRationalRecursive([q(1)], [undefined]), TypeError);
			assert.throws(() => projectionRationalRecursive([1], [q(1)]), TypeError);
			assert.throws(() => projectionRationalRecursive([{ num: 1, den: 2n }], [q(1)]), TypeError);
			assert.throws(() => projectionRationalRecursive([q(1)], [{ num: 1n, den: 2 }]), TypeError);
			assert.throws(() => projectionRationalRecursive([{ num: 1n }], [q(1)]), TypeError);

			// Sparse array
			const sparse = new Array(2);
			sparse[0] = q(1);
			assert.throws(() => projectionRationalRecursive(sparse, [q(1), q(2)]), TypeError);
		});

		it('throws RangeError when any rational has zero denominator', () => {
			assert.throws(
				() => projectionRationalRecursive([{ num: 1n, den: 0n }], [q(1)]),
				RangeError,
			);
			assert.throws(
				() => projectionRationalRecursive([q(1)], [{ num: 0n, den: 0n }]),
				RangeError,
			);
		});

		it('throws RangeError when v is the zero vector', () => {
			assert.throws(() => projectionRationalRecursive([q(1)], [q(0)]), RangeError);
			assert.throws(
				() =>
					projectionRationalRecursive(
						[q(1), q(2), q(3)],
						[{ num: 0n, den: -3n }, { num: 0n, den: 5n }, { num: 0n, den: 1n }],
					),
				RangeError,
			);
		});

		it('validates u elements even when v is the zero vector', () => {
			assert.throws(
				() => projectionRationalRecursive([{ num: 'bad', den: 1n }], [q(0)]),
				TypeError,
			);
		});
	});
});
