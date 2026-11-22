import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { unionMultisetSeries } from './unionMultisetSeries.js';

/**
 * Independent helper: total cardinality |M| = Σ_x m_M(x).
 *
 * @template T
 * @param {Map<T, number>} multiset
 * @returns {number}
 */
function cardinality(multiset) {
	let total = 0;
	for (const count of multiset.values()) {
		total += count;
	}
	return total;
}

/**
 * Independent helper: multiset intersection m_{A ∩ B}(x) = min(m_A(x), m_B(x)).
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function intersectionReference(a, b) {
	const result = new Map();
	for (const [key, countA] of a.entries()) {
		if (b.has(key)) {
			const count = Math.min(countA, b.get(key));
			if (count > 0) {
				result.set(key, count);
			}
		}
	}
	return result;
}

describe('unionMultisetSeries', () => {
	describe('normal cases', () => {
		test('computes pairwise multiset union via pointwise maximum (distinct from multiset sum)', () => {
			const a = new Map([
				['x', 2],
				['y', 1],
				['z', 4],
			]);
			const b = new Map([
				['x', 5],
				['y', 1],
				['w', 3],
			]);

			const result = unionMultisetSeries(a, b);
			assert.deepEqual(
				result,
				new Map([
					['x', 5], // max(2, 5) = 5, not multiset sum 7
					['y', 1], // max(1, 1) = 1, not multiset sum 2
					['z', 4],
					['w', 3],
				]),
			);
		});

		test('supports variadic union over three or more multisets', () => {
			const a = new Map([
				['a', 1],
				['b', 4],
			]);
			const b = new Map([
				['a', 3],
				['c', 2],
			]);
			const c = new Map([
				['a', 2],
				['b', 1],
				['d', 7],
			]);
			const d = new Map([
				['c', 5],
				['d', 3],
			]);

			const result = unionMultisetSeries(a, b, c, d);
			assert.deepEqual(
				result,
				new Map([
					['a', 3],
					['b', 4],
					['c', 5],
					['d', 7],
				]),
			);
		});

		test('supports arbitrary Map key types (objects, symbols, primitives, NaN)', () => {
			const objKey = { id: 1 };
			const symKey = Symbol('token');
			const a = new Map([
				[objKey, 2],
				[symKey, 3],
				[null, 1],
				[undefined, 4],
				[Number.NaN, 2],
				[42, 1],
			]);
			const b = new Map([
				[objKey, 5],
				[symKey, 1],
				[null, 2],
				[Number.NaN, 6],
				[false, 3],
			]);

			const result = unionMultisetSeries(a, b);
			assert.equal(result.get(objKey), 5);
			assert.equal(result.get(symKey), 3);
			assert.equal(result.get(null), 2);
			assert.equal(result.get(undefined), 4);
			assert.equal(result.get(Number.NaN), 6);
			assert.equal(result.get(42), 1);
			assert.equal(result.get(false), 3);
			assert.equal(result.size, 7);
		});

		test('does not mutate input maps and returns a new Map instance', () => {
			const a = new Map([['k', 2]]);
			const b = new Map([['k', 3]]);

			const result = unionMultisetSeries(a, b);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
			assert.deepEqual(a, new Map([['k', 2]]));
			assert.deepEqual(b, new Map([['k', 3]]));

			result.set('k', 99);
			assert.equal(a.get('k'), 2);
			assert.equal(b.get('k'), 3);
		});
	});

	describe('edge cases', () => {
		test('returns an empty Map when called with no arguments', () => {
			const result = unionMultisetSeries();
			assert.ok(result instanceof Map);
			assert.equal(result.size, 0);
		});

		test('returns a normalized copy for a single multiset argument', () => {
			const a = new Map([
				['keep', 3],
				['dropZero', 0],
				['dropNegZero', -0],
			]);

			const result = unionMultisetSeries(a);
			assert.notEqual(result, a);
			assert.deepEqual(result, new Map([['keep', 3]]));
			assert.equal(result.has('dropZero'), false);
			assert.equal(result.has('dropNegZero'), false);
		});

		test('handles empty maps and identity element behavior', () => {
			const empty = new Map();
			const a = new Map([
				['a', 2],
				['b', 5],
			]);

			assert.deepEqual(unionMultisetSeries(empty, empty), new Map());
			assert.deepEqual(unionMultisetSeries(a, empty), a);
			assert.deepEqual(unionMultisetSeries(empty, a), a);
		});

		test('omits zero-count keys from output across pairwise and variadic inputs', () => {
			const a = new Map([
				['zeroBoth', 0],
				['zeroLeft', 0],
				['positive', 2],
			]);
			const b = new Map([
				['zeroBoth', -0],
				['zeroLeft', 3],
				['zeroRight', 0],
			]);

			const result = unionMultisetSeries(a, b);
			assert.deepEqual(
				result,
				new Map([
					['zeroLeft', 3],
					['positive', 2],
				]),
			);
			assert.equal(result.has('zeroBoth'), false);
			assert.equal(result.has('zeroRight'), false);
		});

		test('handles disjoint multisets', () => {
			const a = new Map([
				['alpha', 2],
				['beta', 1],
			]);
			const b = new Map([
				['gamma', 3],
				['delta', 4],
			]);

			assert.deepEqual(
				unionMultisetSeries(a, b),
				new Map([
					['alpha', 2],
					['beta', 1],
					['gamma', 3],
					['delta', 4],
				]),
			);
		});

		test('preserves exact counts up to Number.MAX_SAFE_INTEGER without intermediate overflow', () => {
			const max = Number.MAX_SAFE_INTEGER;
			const nearMax = max - 1;
			const a = new Map([
				['maxBoth', max],
				['maxLeft', max],
				['maxRight', nearMax],
			]);
			const b = new Map([
				['maxBoth', max],
				['maxLeft', nearMax],
				['maxRight', max],
			]);

			const result = unionMultisetSeries(a, b);
			assert.equal(result.get('maxBoth'), max);
			assert.equal(result.get('maxLeft'), max);
			assert.equal(result.get('maxRight'), max);
		});
	});

	describe('algebraic properties', () => {
		const a = new Map([
			['a', 3],
			['b', 1],
			['c', 0],
		]);
		const b = new Map([
			['a', 1],
			['b', 4],
			['d', 2],
		]);
		const c = new Map([
			['b', 2],
			['c', 5],
			['d', 2],
			['e', 1],
		]);

		test('idempotence: A ∪ A = A', () => {
			const normalizedA = new Map([
				['a', 3],
				['b', 1],
			]);
			assert.deepEqual(unionMultisetSeries(a, a), normalizedA);
			assert.deepEqual(unionMultisetSeries(a, a, a), normalizedA);
		});

		test('commutativity: A ∪ B = B ∪ A', () => {
			assert.deepEqual(unionMultisetSeries(a, b), unionMultisetSeries(b, a));
		});

		test('associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = unionMultisetSeries(A, B, C)', () => {
			const leftAssoc = unionMultisetSeries(unionMultisetSeries(a, b), c);
			const rightAssoc = unionMultisetSeries(a, unionMultisetSeries(b, c));
			const variadic = unionMultisetSeries(a, b, c);

			assert.deepEqual(leftAssoc, rightAssoc);
			assert.deepEqual(leftAssoc, variadic);
		});
	});

	describe('input validation', () => {
		test('throws TypeError for non-Map arguments', () => {
			const valid = new Map([['a', 1]]);
			const invalidInputs = [null, undefined, {}, [['a', 1]], new Set(['a']), 'abc', 123];

			for (const bad of invalidInputs) {
				assert.throws(() => unionMultisetSeries(bad), TypeError);
				assert.throws(() => unionMultisetSeries(valid, bad), TypeError);
				assert.throws(() => unionMultisetSeries(valid, valid, bad), TypeError);
			}
		});

		test('throws TypeError for non-number counts', () => {
			const nonNumberCounts = ['2', null, undefined, 2n, {}, [], true];

			for (const badCount of nonNumberCounts) {
				assert.throws(
					() => unionMultisetSeries(new Map([['x', badCount]])),
					TypeError,
				);
			}
		});

		test('throws RangeError for negative, non-integer, non-finite, or unsafe integer counts', () => {
			const badNumericCounts = [
				-1,
				-42,
				0.5,
				2.75,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				Number.MIN_SAFE_INTEGER,
			];

			for (const badCount of badNumericCounts) {
				assert.throws(
					() => unionMultisetSeries(new Map([['x', badCount]])),
					RangeError,
				);
				assert.throws(
					() => unionMultisetSeries(new Map([['ok', 1]]), new Map([['x', badCount]])),
					RangeError,
				);
			}
		});
	});

	describe('inclusion-exclusion and cardinality cross-checks', () => {
		test('satisfies pairwise inclusion-exclusion |A ∪ B| + |A ∩ B| = |A| + |B| across test family', () => {
			const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'];

			// Deterministic LCG for reproducible coverage over diverse multiplicities.
			let seed = 0x1234567;
			const nextInt = (maxExclusive) => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				return seed % maxExclusive;
			};

			const buildRandomMultiset = () => {
				const map = new Map();
				for (const key of keys) {
					const roll = nextInt(6);
					if (roll > 0) {
						map.set(key, roll - 1); // includes explicit 0 counts and counts 1..4
					}
				}
				return map;
			};

			for (let trial = 0; trial < 50; trial += 1) {
				const a = buildRandomMultiset();
				const b = buildRandomMultiset();

				const unionAB = unionMultisetSeries(a, b);
				const interAB = intersectionReference(a, b);

				assert.equal(
					cardinality(unionAB) + cardinality(interAB),
					cardinality(a) + cardinality(b),
					`Pairwise inclusion-exclusion failed on trial ${trial}`,
				);
			}
		});

		test('satisfies three-way inclusion-exclusion |A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |A∩C| - |B∩C| + |A∩B∩C|', () => {
			const a = new Map([
				['p', 4],
				['q', 2],
				['r', 1],
			]);
			const b = new Map([
				['p', 1],
				['q', 5],
				['s', 3],
			]);
			const c = new Map([
				['p', 3],
				['q', 2],
				['r', 6],
				['s', 1],
			]);

			const unionABC = unionMultisetSeries(a, b, c);
			const interAB = intersectionReference(a, b);
			const interAC = intersectionReference(a, c);
			const interBC = intersectionReference(b, c);
			const interABC = intersectionReference(interAB, c);

			const expectedCardinality =
				cardinality(a) +
				cardinality(b) +
				cardinality(c) -
				cardinality(interAB) -
				cardinality(interAC) -
				cardinality(interBC) +
				cardinality(interABC);

			assert.equal(cardinality(unionABC), expectedCardinality);
		});
	});
});
