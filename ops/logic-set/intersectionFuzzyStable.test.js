import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionFuzzyStable } from './intersectionFuzzyStable.js';

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/property tests.
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

/**
 * Independent reference implementation of Zadeh complement: mu_{~A}(x) = 1 - mu_A(x)
 * over a fixed universe of keys.
 */
function zadehComplement(set, universe) {
	const out = {};
	for (const k of universe) {
		out[k] = 1 - (set[k] ?? 0);
	}
	return out;
}

/**
 * Independent reference implementation of Zadeh union: mu_{A U B}(x) = max(mu_A(x), mu_B(x))
 * over a fixed universe of keys.
 */
function zadehUnion(a, b, universe) {
	const out = {};
	for (const k of universe) {
		out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
	}
	return out;
}

describe('intersectionFuzzyStable', () => {
	describe('normal cases across representations', () => {
		it('intersects plain object fuzzy sets with Zadeh min operator', () => {
			const a = { x: 0.8, y: 0.3, onlyA: 0.9 };
			const b = { x: 0.5, y: 0.7, onlyB: 0.4 };
			assert.deepStrictEqual(intersectionFuzzyStable(a, b), { x: 0.5, y: 0.3 });
		});

		it('intersects Map fuzzy sets with arbitrary key types', () => {
			const sym = Symbol('k');
			const objKey = { id: 1 };
			const a = new Map([
				[sym, 0.9],
				[objKey, 0.2],
				['onlyA', 1.0],
			]);
			const b = new Map([
				[sym, 0.4],
				[objKey, 0.6],
				['onlyB', 0.8],
			]);
			const res = intersectionFuzzyStable(a, b);
			assert.ok(res instanceof Map);
			assert.equal(res.size, 2);
			assert.equal(res.get(sym), 0.4);
			assert.equal(res.get(objKey), 0.2);
		});

		it('intersects numeric array and TypedArray fuzzy vectors', () => {
			const a = [0.1, 0.9, 0.5, 0.0, 1.0];
			const b = [0.6, 0.2, 0.5, 0.8, 1.0];
			assert.deepStrictEqual(intersectionFuzzyStable(a, b), [0.1, 0.2, 0.5, 0, 1]);

			const fa = new Float64Array([0.75, 0.25, 1.0]);
			const fb = new Float64Array([0.5, 0.5, 0.0]);
			assert.deepStrictEqual(intersectionFuzzyStable(fa, fb), [0.5, 0.25, 0]);
		});

		it('intersects scalar membership degrees', () => {
			assert.equal(intersectionFuzzyStable(0.8, 0.3), 0.3);
			assert.equal(intersectionFuzzyStable(0.2, 0.9), 0.2);
			assert.equal(intersectionFuzzyStable(0, 1), 0);
			assert.equal(intersectionFuzzyStable(1, 1), 1);
		});

		it('supports N-ary intersection of 3+ fuzzy sets', () => {
			const sets = [
				{ a: 0.9, b: 0.4, c: 0.8 },
				{ a: 0.6, b: 0.7, c: 0.2 },
				{ a: 0.7, b: 0.3, d: 1.0 },
			];
			assert.deepStrictEqual(intersectionFuzzyStable(sets), { a: 0.6, b: 0.3 });

			const vecs = [
				[0.9, 0.4, 0.8],
				[0.6, 0.7, 0.2],
				[0.7, 0.3, 0.5],
			];
			assert.deepStrictEqual(intersectionFuzzyStable(vecs), [0.6, 0.3, 0.2]);

			// Single set N-ary intersection is identity (with zero pruning)
			assert.deepStrictEqual(intersectionFuzzyStable([{ a: 0.5, b: 0 }]), { a: 0.5 });
		});

		it('supports product and Lukasiewicz t-norms', () => {
			const a = { x: 0.8, y: 0.4 };
			const b = { x: 0.5, y: 0.3 };

			const prod = intersectionFuzzyStable(a, b, { tNorm: 'product' });
			assert.ok(Math.abs(prod.x - 0.4) < 1e-15);
			assert.ok(Math.abs(prod.y - 0.12) < 1e-15);

			const luk = intersectionFuzzyStable(a, b, { tNorm: 'lukasiewicz' });
			assert.ok(Math.abs(luk.x - 0.3) < 1e-15);
			assert.equal('y' in luk, false); // max(0, 0.4 + 0.3 - 1) = 0, pruned
		});
	});

	describe('edge cases and numerical robustness', () => {
		it('handles empty sets, disjoint sets, and explicit zero pruning options', () => {
			assert.deepStrictEqual(intersectionFuzzyStable({}, { a: 0.5 }), {});
			assert.deepStrictEqual(intersectionFuzzyStable({ a: 0.5 }, { b: 0.5 }), {});
			assert.deepStrictEqual(intersectionFuzzyStable([], []), []);
			assert.deepStrictEqual(intersectionFuzzyStable(new Map(), new Map([['a', 0.5]])), new Map());

			// pruneZeros: false keeps explicit zeros on shared keys
			assert.deepStrictEqual(
				intersectionFuzzyStable({ a: 0, b: 0.5 }, { a: 0.8, b: 0.2 }, { pruneZeros: false }),
				{ a: 0, b: 0.2 }
			);
		});

		it('canonicalizes -0 to +0 everywhere', () => {
			const scalarRes = intersectionFuzzyStable(-0, 0);
			assert.ok(Object.is(scalarRes, 0));

			const vecRes = intersectionFuzzyStable([-0, 0.5], [0, -0]);
			assert.ok(Object.is(vecRes[0], 0));
			assert.ok(Object.is(vecRes[1], 0));

			const objRes = intersectionFuzzyStable({ a: -0 }, { a: 0.5 }, { pruneZeros: false });
			assert.ok(Object.is(objRes.a, 0));
		});

		it('clamps slight boundary overshoot when clampTolerance is configured and tracks perturbation', () => {
			const a = { x: 1 + 1e-15, y: -1e-15 };
			const b = { x: 1, y: 0.5 };
			const metrics = intersectionFuzzyStable(a, b, {
				clampTolerance: 1e-12,
				pruneZeros: false,
				withMetrics: true,
			});
			assert.deepStrictEqual(metrics.result, { x: 1, y: 0 });
			assert.ok(metrics.maxPerturbation >= 1e-15 - 1e-30);
			assert.ok(metrics.maxPerturbation <= 2e-15);
			assert.equal(metrics.supportSize, 1);
			assert.equal(metrics.height, 1);
			assert.equal(metrics.cardinality, 1);
		});

		it('snaps sub-threshold numerical noise with zeroThreshold', () => {
			const a = { x: 0.5, noise: 1e-14 };
			const b = { x: 0.4, noise: 2e-14 };
			assert.deepStrictEqual(
				intersectionFuzzyStable(a, b, { zeroThreshold: 1e-12 }),
				{ x: 0.4 }
			);
		});

		it('eliminates catastrophic cancellation in Lukasiewicz t-norm near boundary', () => {
			// Naive (a + b) - 1 gives 0 because (1 - 2^-53) + 2^-52 rounds to 1.0 in IEEE 754!
			const a = 1 - 2 ** -53;
			const b = 2 ** -52;
			const naive = Math.max(0, (a + b) - 1);
			assert.equal(naive, 0); // Demonstrates naive floating-point failure

			const stable = intersectionFuzzyStable(a, b, { tNorm: 'lukasiewicz' });
			assert.equal(stable, 2 ** -53); // Exact mathematical answer!
		});

		it('maintains accuracy for N-ary Lukasiewicz over 1000 sets near 1', () => {
			// 1000 sets, each with membership 1 - 2^-40
			// Exact answer: 1 - 1000 * 2^-40
			const delta = 2 ** -40;
			const n = 1000;
			const sets = Array.from({ length: n }, () => ({ k: 1 - delta }));
			const metrics = intersectionFuzzyStable(sets, {
				tNorm: 'lukasiewicz',
				withMetrics: true,
			});
			const exact = 1 - n * delta;
			assert.ok(Math.abs(metrics.result.k - exact) <= metrics.maxPerturbation + 1e-16);
			assert.equal(metrics.result.k, exact);
		});

		it('maintains high accuracy for N-ary product t-norm via log1p compensated summation', () => {
			// 200 sets, each with membership 1 - 1e-12
			const eps = 1e-12;
			const n = 200;
			const sets = Array.from({ length: n }, () => ({ k: 1 - eps }));
			const metrics = intersectionFuzzyStable(sets, {
				tNorm: 'product',
				withMetrics: true,
			});
			// High-precision expansion: (1 - eps)^n = exp(n * ln(1 - eps))
			const expected = Math.exp(n * Math.log1p(-eps));
			assert.ok(Math.abs(metrics.result.k - expected) <= metrics.maxPerturbation + 1e-15);
		});

		it('uses Neumaier compensated summation for fuzzy cardinality without losing tiny terms', () => {
			// Classic compensated summation stress test: 1.0 followed by 100,000 copies of 2^-54
			// Naive summation adds 2^-54 to 1.0 -> swallowed completely (gives 1.0)!
			const tiny = 2 ** -54;
			const count = 100_000;
			const a = new Array(count + 1);
			const b = new Array(count + 1);
			a[0] = 1.0;
			b[0] = 1.0;
			for (let i = 1; i <= count; i++) {
				a[i] = tiny;
				b[i] = 1.0;
			}

			// Verify naive summation fails completely
			let naiveSum = 0;
			for (let i = 0; i < a.length; i++) naiveSum += Math.min(a[i], b[i]);
			assert.equal(naiveSum, 1.0);

			// Verify compensated cardinality matches exact mathematical sum
			const metrics = intersectionFuzzyStable(a, b, { withMetrics: true });
			const exactCardinality = 1 + count * tiny;
			const actualError = Math.abs(metrics.cardinality - exactCardinality);
			assert.ok(actualError <= metrics.cardinalityErrorBound, `error ${actualError} > bound ${metrics.cardinalityErrorBound}`);
			assert.ok(actualError < 1e-15);
			assert.equal(metrics.supportSize, count + 1);
			assert.equal(metrics.height, 1);
		});

		it('is safe against prototype pollution (__proto__ key)', () => {
			const a = Object.create(null);
			const b = Object.create(null);
			a['__proto__'] = 0.6;
			b['__proto__'] = 0.4;
			const res = intersectionFuzzyStable(a, b);
			assert.equal(Object.getPrototypeOf(res), Object.prototype);
			assert.equal(Object.prototype.hasOwnProperty.call(res, '__proto__'), true);
			assert.equal(res['__proto__'], 0.4);
		});
	});

	describe('input validation', () => {
		it('rejects out-of-range, NaN, Infinity, and non-numeric memberships', () => {
			assert.throws(() => intersectionFuzzyStable({ a: -0.01 }, { a: 0.5 }), RangeError);
			assert.throws(() => intersectionFuzzyStable({ a: 1.01 }, { a: 0.5 }), RangeError);
			assert.throws(() => intersectionFuzzyStable({ a: NaN }, { a: 0.5 }), RangeError);
			assert.throws(() => intersectionFuzzyStable({ a: Infinity }, { a: 0.5 }), RangeError);
			assert.throws(() => intersectionFuzzyStable({ a: -Infinity }, { a: 0.5 }), RangeError);
			assert.throws(() => intersectionFuzzyStable({ a: '0.5' }, { a: 0.5 }), TypeError);

			// Invalid membership on a non-overlapping key is still rejected!
			assert.throws(() => intersectionFuzzyStable({ a: 0.5, bad: 2.0 }, { a: 0.3 }), RangeError);
			assert.throws(() => intersectionFuzzyStable(new Map([['bad', -1]]), new Map()), RangeError);
		});

		it('rejects invalid argument shapes, mismatched types, length mismatches, and bad options', () => {
			assert.throws(() => intersectionFuzzyStable(), TypeError);
			assert.throws(() => intersectionFuzzyStable({ a: 0.5 }), TypeError);
			assert.throws(() => intersectionFuzzyStable([]), RangeError);
			assert.throws(() => intersectionFuzzyStable([0.5, 0.3]), TypeError);
			assert.throws(() => intersectionFuzzyStable({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);
			assert.throws(() => intersectionFuzzyStable([0.5, 0.3], [0.2]), RangeError);
			assert.throws(() => intersectionFuzzyStable(new Set([1]), new Set([1])), TypeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, { tNorm: 'invalid' }), RangeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, { clampTolerance: -1 }), RangeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, { zeroThreshold: 2 }), RangeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, { pruneZeros: 'yes' }), TypeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, { withMetrics: 1 }), TypeError);
			assert.throws(() => intersectionFuzzyStable(0.5, 0.3, 'bad-options'), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies De Morgan duality A ∩ B = ~(~A U ~B) and lattice axioms over randomized fuzzy sets', () => {
			const rand = createRng(0x5eed1234);
			const universe = Array.from({ length: 20 }, (_, i) => `u${i}`);
			const U = Object.fromEntries(universe.map((k) => [k, 1]));

			for (let trial = 0; trial < 40; trial++) {
				const A = {};
				const B = {};
				const C = {};
				for (const k of universe) {
					if (rand() > 0.2) A[k] = Math.round(rand() * 1e6) / 1e6;
					if (rand() > 0.2) B[k] = Math.round(rand() * 1e6) / 1e6;
					if (rand() > 0.2) C[k] = Math.round(rand() * 1e6) / 1e6;
				}

				const ab = intersectionFuzzyStable(A, B);
				const ba = intersectionFuzzyStable(B, A);

				// Commutativity: A ∩ B == B ∩ A
				assert.deepStrictEqual(ab, ba);

				// Idempotence: A ∩ A == A (ignoring explicit zeros)
				const aa = intersectionFuzzyStable(A, A);
				for (const k of universe) {
					assert.equal(aa[k] ?? 0, A[k] ?? 0);
				}

				// Identity & Annihilation: A ∩ U == A, A ∩ ∅ == ∅
				const aU = intersectionFuzzyStable(A, U);
				for (const k of universe) {
					assert.equal(aU[k] ?? 0, A[k] ?? 0);
				}
				assert.deepStrictEqual(intersectionFuzzyStable(A, {}), {});

				// Associativity: (A ∩ B) ∩ C == A ∩ (B ∩ C) == ∩(A, B, C)
				const ab_c = intersectionFuzzyStable(ab, C);
				const a_bc = intersectionFuzzyStable(A, intersectionFuzzyStable(B, C));
				const abc = intersectionFuzzyStable([A, B, C]);
				assert.deepStrictEqual(ab_c, a_bc);
				assert.deepStrictEqual(ab_c, abc);

				// De Morgan cross-check: A ∩ B = ~(~A U ~B)
				const compA = zadehComplement(A, universe);
				const compB = zadehComplement(B, universe);
				const deMorgan = zadehComplement(zadehUnion(compA, compB, universe), universe);
				for (const k of universe) {
					const actual = ab[k] ?? 0;
					const expected = deMorgan[k] ?? 0;
					assert.ok(
						Math.abs(actual - expected) <= 1e-15,
						`De Morgan mismatch at ${k}: actual=${actual}, expected=${expected}`
					);
				}

				// T-norm ordering: Lukasiewicz <= Product <= Zadeh
				const abProd = intersectionFuzzyStable(A, B, { tNorm: 'product' });
				const abLuk = intersectionFuzzyStable(A, B, { tNorm: 'lukasiewicz' });
				for (const k of universe) {
					const vz = ab[k] ?? 0;
					const vp = abProd[k] ?? 0;
					const vl = abLuk[k] ?? 0;
					assert.ok(vl <= vp + 1e-15 && vp <= vz + 1e-15);
				}
			}
		});

		it('matches exact BigInt rational reference for cardinality and Lukasiewicz intersection', () => {
			// Exact arithmetic using fixed denominator D = 2^30 (dyadic rationals are exact in IEEE 754!)
			const SHIFT = 30n;
			const DENOM = 1n << SHIFT;
			const rand = createRng(0xcafebabe);
			const n = 500;

			const numA = new Array(n);
			const numB = new Array(n);
			const vecA = new Array(n);
			const vecB = new Array(n);

			let exactZadehSum = 0n;
			let exactLukSum = 0n;

			for (let i = 0; i < n; i++) {
				// Mix large and tiny dyadic rationals to stress compensated summation
				const aInt = i % 10 === 0
					? BigInt(Math.floor(rand() * Number(DENOM)))
					: BigInt(Math.floor(rand() * 1024));
				const bInt = i % 10 === 0
					? BigInt(Math.floor(rand() * Number(DENOM)))
					: BigInt(Math.floor(rand() * 1024));
				numA[i] = aInt;
				numB[i] = bInt;
				vecA[i] = Number(aInt) / Number(DENOM);
				vecB[i] = Number(bInt) / Number(DENOM);

				exactZadehSum += aInt < bInt ? aInt : bInt;
				const luk = aInt + bInt > DENOM ? aInt + bInt - DENOM : 0n;
				exactLukSum += luk;
			}

			const zadehMetrics = intersectionFuzzyStable(vecA, vecB, { withMetrics: true });
			const exactZadehCard = Number(exactZadehSum) / Number(DENOM);
			assert.ok(
				Math.abs(zadehMetrics.cardinality - exactZadehCard) <= zadehMetrics.cardinalityErrorBound + 1e-15
			);

			const lukMetrics = intersectionFuzzyStable(vecA, vecB, {
				tNorm: 'lukasiewicz',
				withMetrics: true,
			});
			const exactLukCard = Number(exactLukSum) / Number(DENOM);
			assert.ok(
				Math.abs(lukMetrics.cardinality - exactLukCard) <= lukMetrics.cardinalityErrorBound + 1e-15
			);
		});
	});
});
