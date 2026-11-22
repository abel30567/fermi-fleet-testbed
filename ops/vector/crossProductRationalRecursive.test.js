import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductRationalRecursive } from './crossProductRationalRecursive.js';

/** Helper to construct a rational literal */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Iterative Euclidean GCD for independent test verification */
function gcdIter(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/** Asserts lowest-terms canonical rational invariant */
function assertCanonicalRational(q) {
	assert.equal(typeof q, 'object');
	assert.notEqual(q, null);
	assert.equal(typeof q.num, 'bigint');
	assert.equal(typeof q.den, 'bigint');
	assert.ok(q.den > 0n, `expected den > 0n, got ${q.den}`);
	if (q.num === 0n) {
		assert.equal(q.den, 1n, `expected zero to have den === 1n, got ${q.den}`);
	} else {
		assert.equal(
			gcdIter(q.num, q.den),
			1n,
			`expected lowest terms for ${q.num}/${q.den}`
		);
	}
}

/** Asserts every component of a 3D rational vector satisfies the canonical invariant */
function assertCanonicalVector(vec) {
	assert.ok(Array.isArray(vec));
	assert.equal(vec.length, 3);
	for (const comp of vec) {
		assertCanonicalRational(comp);
	}
}

/** Independent iterative rational helpers for algebraic identity checks */
function normRef(num, den) {
	if (num === 0n) return { num: 0n, den: 1n };
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdIter(n, d);
	return { num: n / g, den: d / g };
}

function addRef(a, b) {
	return normRef(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subRef(a, b) {
	return normRef(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulRef(a, b) {
	return normRef(a.num * b.num, a.den * b.den);
}

function dotRef(u, v) {
	return addRef(addRef(mulRef(u[0], v[0]), mulRef(u[1], v[1])), mulRef(u[2], v[2]));
}

function addVecRef(u, v) {
	return [addRef(u[0], v[0]), addRef(u[1], v[1]), addRef(u[2], v[2])];
}

function subVecRef(u, v) {
	return [subRef(u[0], v[0]), subRef(u[1], v[1]), subRef(u[2], v[2])];
}

function scaleVecRef(s, v) {
	return [mulRef(s, v[0]), mulRef(s, v[1]), mulRef(s, v[2])];
}

/** Independent direct (non-recursive) cross-product reference */
function crossRef(u, v) {
	return [
		subRef(mulRef(u[1], v[2]), mulRef(u[2], v[1])),
		subRef(mulRef(u[2], v[0]), mulRef(u[0], v[2])),
		subRef(mulRef(u[0], v[1]), mulRef(u[1], v[0])),
	];
}

describe('crossProductRationalRecursive', () => {
	describe('standard basis and normal cases', () => {
		const i = [r(1), r(0), r(0)];
		const j = [r(0), r(1), r(0)];
		const k = [r(0), r(0), r(1)];

		it('satisfies right-hand rule on standard basis vectors', () => {
			assert.deepEqual(crossProductRationalRecursive(i, j), k);
			assert.deepEqual(crossProductRationalRecursive(j, k), i);
			assert.deepEqual(crossProductRationalRecursive(k, i), j);
			assert.deepEqual(crossProductRationalRecursive(j, i), [r(0), r(0), r(-1)]);
			assert.deepEqual(crossProductRationalRecursive(k, j), [r(-1), r(0), r(0)]);
			assert.deepEqual(crossProductRationalRecursive(i, k), [r(0), r(-1), r(0)]);
		});

		it('computes exact cross product of integer vectors', () => {
			const a = [r(2), r(3), r(4)];
			const b = [r(5), r(6), r(7)];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			// (3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5) = (-3, 6, -3)
			assert.deepEqual(res, [r(-3), r(6), r(-3)]);
		});

		it('computes exact cross product of fractional vectors in lowest terms', () => {
			const a = [r(1, 2), r(-2, 3), r(3, 4)];
			const b = [r(4, 5), r(5, 6), r(-6, 7)];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			// c0 = (-2/3)(-6/7) - (3/4)(5/6) = 4/7 - 5/8 = -3/56
			// c1 = (3/4)(4/5) - (1/2)(-6/7) = 3/5 + 3/7 = 36/35
			// c2 = (1/2)(5/6) - (-2/3)(4/5) = 5/12 + 8/15 = 19/20
			assert.deepEqual(res, [r(-3, 56), r(36, 35), r(19, 20)]);
		});
	});

	describe('edge cases', () => {
		const zero = [r(0), r(0), r(0)];

		it('returns canonical zero vector when either or both inputs are zero', () => {
			const v = [r(7, 11), r(-13, 17), r(19, 23)];
			for (const [u, w] of [
				[zero, v],
				[v, zero],
				[zero, zero],
			]) {
				const res = crossProductRationalRecursive(u, w);
				assertCanonicalVector(res);
				assert.deepEqual(res, zero);
			}
		});

		it('returns canonical zero vector for identical and collinear vectors', () => {
			const v = [r(5, 6), r(-7, 8), r(9, 10)];
			const scaled = [r(-15, 4), r(63, 16), r(-81, 20)]; // (-9/2) * v
			const resSelf = crossProductRationalRecursive(v, v);
			const resCollinear = crossProductRationalRecursive(v, scaled);
			assertCanonicalVector(resSelf);
			assertCanonicalVector(resCollinear);
			assert.deepEqual(resSelf, zero);
			assert.deepEqual(resCollinear, zero);
		});

		it('normalizes unreduced inputs and negative denominators', () => {
			const a = [
				{ num: 6n, den: 12n },     // 1/2
				{ num: 4n, den: -6n },     // -2/3
				{ num: -9n, den: -12n },   // 3/4
			];
			const b = [
				{ num: -8n, den: -10n },   // 4/5
				{ num: 25n, den: 30n },    // 5/6
				{ num: 18n, den: -21n },   // -6/7
			];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			assert.deepEqual(res, [r(-3, 56), r(36, 35), r(19, 20)]);
		});

		it('handles zero numerators with arbitrary negative/non-unit denominators', () => {
			const a = [
				{ num: 0n, den: -99n },
				{ num: 4n, den: -8n }, // -1/2
				{ num: 0n, den: 77n },
			];
			const b = [
				{ num: 0n, den: -3n },
				{ num: 0n, den: 5n },
				{ num: -6n, den: -9n }, // 2/3
			];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			assert.deepEqual(res, [r(-1, 3), r(0, 1), r(0, 1)]);
		});

		it('accepts null-prototype rational objects', () => {
			const mkNullProto = (num, den) =>
				Object.assign(Object.create(null), { num, den });
			const a = [mkNullProto(1n, 1n), mkNullProto(0n, 1n), mkNullProto(0n, 1n)];
			const b = [mkNullProto(0n, 1n), mkNullProto(1n, 1n), mkNullProto(0n, 1n)];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			assert.deepEqual(res, [r(0), r(0), r(1)]);
		});

		it('handles very large BigInt numerators and denominators accurately', () => {
			const p = 10n ** 60n + 7n;
			const q = 10n ** 60n + 9n;
			const k = 10n ** 50n + 3n;
			// Construct a and b with huge common factors and non-trivial cancellation
			const a = [
				{ num: p * k, den: q * k },
				{ num: -2n * p, den: 3n * q },
				{ num: 5n * k, den: 7n * k },
			];
			const b = [
				{ num: 3n * q, den: 5n * p },
				{ num: 11n * k, den: 13n * k },
				{ num: -q, den: 2n * p },
			];
			const res = crossProductRationalRecursive(a, b);
			assertCanonicalVector(res);
			assert.deepEqual(res, crossRef(a, b));
		});

		it('does not mutate inputs and returns fresh non-aliased Rational objects', () => {
			const a = [r(2, 4), r(0, -3), r(1, 1)];
			const b = [r(0, 5), r(3, 6), r(0, 1)];
			const aSnapshot = a.map((q) => ({ ...q }));
			const bSnapshot = b.map((q) => ({ ...q }));

			const res = crossProductRationalRecursive(a, b);
			assert.deepEqual(a, aSnapshot);
			assert.deepEqual(b, bSnapshot);

			// Returned objects must not alias inputs or each other
			for (const out of res) {
				for (const inp of [...a, ...b]) {
					assert.notEqual(out, inp);
				}
			}
			assert.notEqual(res[0], res[1]);
			assert.notEqual(res[1], res[2]);
			assert.notEqual(res[0], res[2]);
		});
	});

	describe('input validation', () => {
		const validVec = [r(1), r(2), r(3)];

		it('throws TypeError when a or b is not an Array', () => {
			const nonArrays = [
				null,
				undefined,
				42,
				'123',
				{ 0: r(1), 1: r(2), 2: r(3), length: 3 },
				new Float64Array([1, 2, 3]),
				new BigInt64Array([1n, 2n, 3n]),
			];
			for (const bad of nonArrays) {
				assert.throws(() => crossProductRationalRecursive(bad, validVec), TypeError);
				assert.throws(() => crossProductRationalRecursive(validVec, bad), TypeError);
			}
		});

		it('throws RangeError when a or b does not have length 3', () => {
			const badLengths = [[], [r(1)], [r(1), r(2)], [r(1), r(2), r(3), r(4)]];
			for (const bad of badLengths) {
				assert.throws(() => crossProductRationalRecursive(bad, validVec), RangeError);
				assert.throws(() => crossProductRationalRecursive(validVec, bad), RangeError);
			}
		});

		it('throws TypeError for sparse arrays', () => {
			const sparse1 = new Array(3);
			// eslint-disable-next-line no-sparse-arrays
			const sparse2 = [r(1), , r(3)];
			assert.throws(() => crossProductRationalRecursive(sparse1, validVec), TypeError);
			assert.throws(() => crossProductRationalRecursive(validVec, sparse2), TypeError);
		});

		it('throws TypeError for invalid rational component shapes or non-BigInt fields', () => {
			const arrWithProps = [1n, 2n];
			arrWithProps.num = 1n;
			arrWithProps.den = 2n;

			const badRationals = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				arrWithProps,
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: null },
				{ num: NaN, den: 1n },
				{ num: 1n },
				{ den: 1n },
			];
			for (const bad of badRationals) {
				assert.throws(
					() => crossProductRationalRecursive([bad, r(1), r(1)], validVec),
					TypeError
				);
				assert.throws(
					() => crossProductRationalRecursive(validVec, [r(1), bad, r(1)]),
					TypeError
				);
				assert.throws(
					() => crossProductRationalRecursive(validVec, [r(1), r(1), bad]),
					TypeError
				);
			}
		});

		it('throws RangeError when any component has den === 0n', () => {
			const zeroDen = { num: 1n, den: 0n };
			const zeroZero = { num: 0n, den: 0n };
			for (const idx of [0, 1, 2]) {
				const vA = [...validVec];
				vA[idx] = zeroDen;
				assert.throws(() => crossProductRationalRecursive(vA, validVec), RangeError);

				const vB = [...validVec];
				vB[idx] = zeroZero;
				assert.throws(() => crossProductRationalRecursive(validVec, vB), RangeError);
			}
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches independent direct formula and floating-point cross product across deterministic test vectors', () => {
			// Deterministic LCG for repeatable pseudo-random rational vectors
			let seed = 123456789n;
			const nextInt = (maxAbs) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				return Number(seed % BigInt(2 * maxAbs + 1)) - maxAbs;
			};
			const nextRat = () => {
				const num = BigInt(nextInt(50));
				let den = BigInt(nextInt(25));
				if (den === 0n) den = 1n;
				return { num, den };
			};
			const toFloat = (q) => Number(q.num) / Number(q.den);

			for (let t = 0; t < 40; t++) {
				const a = [nextRat(), nextRat(), nextRat()];
				const b = [nextRat(), nextRat(), nextRat()];
				const got = crossProductRationalRecursive(a, b);
				const expected = crossRef(a, b);

				assertCanonicalVector(got);
				assert.deepEqual(got, expected);

				// Cross-check against standard IEEE-754 floating-point formula
				const af = a.map(toFloat);
				const bf = b.map(toFloat);
				const fpCross = [
					af[1] * bf[2] - af[2] * bf[1],
					af[2] * bf[0] - af[0] * bf[2],
					af[0] * bf[1] - af[1] * bf[0],
				];
				for (let c = 0; c < 3; c++) {
					assert.ok(
						Math.abs(toFloat(got[c]) - fpCross[c]) < 1e-11,
						`float mismatch at trial ${t}, comp ${c}`
					);
				}
			}
		});

		it('satisfies anticommutativity, orthogonality, bilinearity, Jacobi, BAC-CAB, and Lagrange identities', () => {
			const a = [r(3, 5), r(-7, 4), r(11, 6)];
			const b = [r(-2, 3), r(5, 8), r(-13, 7)];
			const c = [r(4, 9), r(1, 2), r(3, 11)];
			const scalar = r(-17, 13);

			const axb = crossProductRationalRecursive(a, b);
			const bxa = crossProductRationalRecursive(b, a);
			assertCanonicalVector(axb);
			assertCanonicalVector(bxa);

			// 1. Anticommutativity: a x b = -(b x a)
			assert.deepEqual(axb, scaleVecRef(r(-1), bxa));

			// 2. Orthogonality: a · (a x b) = 0 and b · (a x b) = 0
			assert.deepEqual(dotRef(a, axb), r(0));
			assert.deepEqual(dotRef(b, axb), r(0));

			// 3. Bilinearity: a x (b + c) = (a x b) + (a x c), (s*a) x b = s*(a x b)
			const lhsDist = crossProductRationalRecursive(a, addVecRef(b, c));
			const rhsDist = addVecRef(axb, crossProductRationalRecursive(a, c));
			assert.deepEqual(lhsDist, rhsDist);

			const lhsScale = crossProductRationalRecursive(scaleVecRef(scalar, a), b);
			const rhsScale = scaleVecRef(scalar, axb);
			assert.deepEqual(lhsScale, rhsScale);

			// 4. Jacobi identity: a x (b x c) + b x (c x a) + c x (a x b) = 0
			const t1 = crossProductRationalRecursive(a, crossProductRationalRecursive(b, c));
			const t2 = crossProductRationalRecursive(b, crossProductRationalRecursive(c, a));
			const t3 = crossProductRationalRecursive(c, axb);
			assert.deepEqual(addVecRef(addVecRef(t1, t2), t3), [r(0), r(0), r(0)]);

			// 5. BAC-CAB identity: a x (b x c) = (a · c) b - (a · b) c
			const bacCab = subVecRef(
				scaleVecRef(dotRef(a, c), b),
				scaleVecRef(dotRef(a, b), c)
			);
			assert.deepEqual(t1, bacCab);

			// 6. Lagrange's identity: |a x b|^2 + (a · b)^2 = |a|^2 |b|^2
			const normSqCross = dotRef(axb, axb);
			const dotAB = dotRef(a, b);
			const lhsLagrange = addRef(normSqCross, mulRef(dotAB, dotAB));
			const rhsLagrange = mulRef(dotRef(a, a), dotRef(b, b));
			assert.deepEqual(lhsLagrange, rhsLagrange);
		});
	});
});
