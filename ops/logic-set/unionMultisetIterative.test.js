import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionMultisetIterative } from './unionMultisetIterative.js';

/**
 * Independent reference implementation using explicit key-universe aggregation.
 * Computes union via Set of all keys and Math.max over all multisets.
 */
function referenceUnion(multisets) {
	const keys = new Set();
	for (const m of multisets) {
		for (const k of m.keys()) {
			keys.add(k);
		}
	}
	const out = new Map();
	for (const k of keys) {
		let maxCount = 0;
		for (const m of multisets) {
			const c = m.get(k) ?? 0;
			if (c > maxCount) {
				maxCount = c;
			}
		}
		if (maxCount > 0) {
			out.set(k, maxCount);
		}
	}
	return out;
}

/**
 * Helper: deterministic PRNG (Mulberry32) for reproducible randomized cross-checks.
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Helper: total multiplicity (cardinality) of a multiset.
 */
function totalCardinality(multiset) {
	let sum = 0;
	for (const count of multiset.values()) {
		sum += count;
	}
	return sum;
}

describe('unionMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes max multiplicities for overlapping multisets', () => {
			const a = new Map([
				['apple', 3],
				['banana', 1],
				['cherry', 2],
			]);
			const b = new Map([
				['apple', 1],
				['banana', 4],
				['date', 2],
			]);

			const result = unionMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					['apple', 3],
					['banana', 4],
					['cherry', 2],
					['date', 2],
				])
			);
		});

		it('computes union of disjoint multisets', () => {
			const a = new Map([
				[1, 2],
				[2, 5],
			]);
			const b = new Map([
				[3, 1],
				[4, 3],
			]);

			const result = unionMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					[1, 2],
					[2, 5],
					[3, 1],
					[4, 3],
				])
			);
		});

		it('supports variadic union across three or more multisets', () => {
			const a = new Map([
				['x', 1],
				['y', 5],
			]);
			const b = new Map([
				['x', 4],
				['z', 2],
			]);
			const c = new Map([
				['x', 2],
				['y', 3],
				['w', 7],
			]);

			const result = unionMultisetIterative(a, b, c);
			assert.deepEqual(
				result,
				new Map([
					['x', 4],
					['y', 5],
					['z', 2],
					['w', 7],
				])
			);
		});

		it('does not mutate input maps and returns a new Map instance', () => {
			const a = new Map([['a', 2]]);
			const b = new Map([['b', 3]]);

			const result = unionMultisetIterative(a, b);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
			assert.deepEqual(a, new Map([['a', 2]]));
			assert.deepEqual(b, new Map([['b', 3]]));

			result.set('c', 9);
			assert.equal(a.has('c'), false);
			assert.equal(b.has('c'), false);
		});
	});

	describe('edge cases', () => {
		it('handles empty multisets', () => {
			assert.deepEqual(unionMultisetIterative(new Map(), new Map()), new Map());

			const nonEmpty = new Map([['k', 3]]);
			assert.deepEqual(unionMultisetIterative(nonEmpty, new Map()), new Map([['k', 3]]));
			assert.deepEqual(unionMultisetIterative(new Map(), nonEmpty), new Map([['k', 3]]));
		});

		it('omits zero-count entries from the canonical result', () => {
			const a = new Map([
				['zeroOnly', 0],
				['negZero', -0],
				['mixed', 0],
				['positive', 2],
			]);
			const b = new Map([
				['zeroOnly', 0],
				['mixed', 3],
				['otherZero', 0],
			]);

			const result = unionMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					['positive', 2],
					['mixed', 3],
				])
			);
			assert.equal(result.has('zeroOnly'), false);
			assert.equal(result.has('negZero'), false);
			assert.equal(result.has('otherZero'), false);
		});

		it('handles special Map keys (NaN, -0/+0, null, undefined, symbols, objects, BigInt)', () => {
			const objKey = { id: 1 };
			const symKey = Symbol('s');

			const a = new Map([
				[NaN, 2],
				[-0, 1],
				[null, 3],
				[undefined, 1],
				[symKey, 4],
				[objKey, 2],
				[10n, 5],
			]);
			const b = new Map([
				[NaN, 5],
				[+0, 3],
				[null, 1],
				[undefined, 2],
				[symKey, 2],
				[objKey, 6],
				[10n, 1],
			]);

			const result = unionMultisetIterative(a, b);
			assert.equal(result.get(NaN), 5);
			assert.equal(result.get(0), 3);
			assert.equal(result.get(null), 3);
			assert.equal(result.get(undefined), 2);
			assert.equal(result.get(symKey), 4);
			assert.equal(result.get(objKey), 6);
			assert.equal(result.get(10n), 5);
			assert.equal(result.size, 7);
		});

		it('handles Number.MAX_SAFE_INTEGER counts accurately', () => {
			const a = new Map([['big', Number.MAX_SAFE_INTEGER - 1]]);
			const b = new Map([['big', Number.MAX_SAFE_INTEGER]]);

			const result = unionMultisetIterative(a, b);
			assert.equal(result.get('big'), Number.MAX_SAFE_INTEGER);
		});

		it('handles identical references passed multiple times', () => {
			const a = new Map([
				['x', 2],
				['y', 0],
			]);
			const result = unionMultisetIterative(a, a);
			assert.notEqual(result, a);
			assert.deepEqual(result, new Map([['x', 2]]));
		});

		it('handles large multisets iteratively without stack overflow', () => {
			const a = new Map();
			const b = new Map();
			for (let i = 0; i < 20000; i++) {
				a.set(i, i % 10);
				b.set(i + 10000, (i * 3) % 10);
			}
			const result = unionMultisetIterative(a, b);
			assert.equal(result.get(0), undefined); // 0 count omitted
			assert.equal(result.get(10001), Math.max(10001 % 10, (1 * 3) % 10));
			assert.equal(result.get(29999), (19999 * 3) % 10);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when required arguments are missing or not Map instances', () => {
			const valid = new Map([['a', 1]]);

			assert.throws(() => unionMultisetIterative(), TypeError);
			assert.throws(() => unionMultisetIterative(valid), TypeError);
			assert.throws(() => unionMultisetIterative(null, valid), TypeError);
			assert.throws(() => unionMultisetIterative(valid, null), TypeError);
			assert.throws(() => unionMultisetIterative(undefined, valid), TypeError);
			assert.throws(() => unionMultisetIterative({}, valid), TypeError);
			assert.throws(() => unionMultisetIterative(valid, [['a', 1]]), TypeError);
			assert.throws(() => unionMultisetIterative(new Set(['a']), valid), TypeError);
			assert.throws(() => unionMultisetIterative(valid, valid, 'not-a-map'), TypeError);
		});

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map([['a', 1]]);

			for (const badCount of ['2', null, undefined, true, {}, [], 2n]) {
				const badMap = new Map([['a', badCount]]);
				assert.throws(() => unionMultisetIterative(badMap, valid), TypeError);
				assert.throws(() => unionMultisetIterative(valid, badMap), TypeError);
			}
		});

		it('throws RangeError when any count is negative, non-integer, NaN, infinite, or unsafe', () => {
			const valid = new Map([['a', 100]]);

			for (const badCount of [
				-1,
				-100,
				0.5,
				2.7,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				Number.MIN_SAFE_INTEGER,
			]) {
				const badMap = new Map([['a', badCount]]);
				assert.throws(() => unionMultisetIterative(badMap, valid), RangeError);
				assert.throws(() => unionMultisetIterative(valid, badMap), RangeError);
			}
		});
	});

	describe('independent cross-checks and algebraic properties', () => {
		it('matches independent key-universe reference implementation on randomized multisets', () => {
			const rng = createRng(42);
			const universe = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

			for (let trial = 0; trial < 100; trial++) {
				const numMaps = 2 + Math.floor(rng() * 3); // 2 to 4 multisets
				const maps = [];
				for (let m = 0; m < numMaps; m++) {
					const map = new Map();
					for (const key of universe) {
						if (rng() < 0.6) {
							map.set(key, Math.floor(rng() * 8)); // includes 0..7
						}
					}
					maps.push(map);
				}

				const actual = unionMultisetIterative(...maps);
				const expected = referenceUnion(maps);

				assert.equal(actual.size, expected.size);
				for (const [k, v] of expected) {
					assert.equal(actual.get(k), v);
				}
			}
		});

		it('satisfies multiset lattice laws and inclusion-exclusion cardinality identity', () => {
			const rng = createRng(2026);
			const universe = [0, 1, 2, 3, 4, 5, 6, 7];

			for (let trial = 0; trial < 50; trial++) {
				const makeMap = () => {
					const m = new Map();
					for (const k of universe) {
						if (rng() < 0.65) {
							m.set(k, Math.floor(rng() * 10));
						}
					}
					return m;
				};

				const a = makeMap();
				const b = makeMap();
				const c = makeMap();

				const ab = unionMultisetIterative(a, b);
				const ba = unionMultisetIterative(b, a);

				// Commutativity: A ∪ B = B ∪ A
				assert.equal(ab.size, ba.size);
				for (const [k, v] of ab) {
					assert.equal(ba.get(k), v);
				}

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
				const ab_c = unionMultisetIterative(ab, c);
				const a_bc = unionMultisetIterative(a, unionMultisetIterative(b, c));
				assert.equal(ab_c.size, a_bc.size);
				for (const [k, v] of ab_c) {
					assert.equal(a_bc.get(k), v);
				}

				// Idempotence: A ∪ A = canonical(A)
				const aa = unionMultisetIterative(a, a);
				for (const k of universe) {
					const expected = a.get(k) ?? 0;
					assert.equal(aa.get(k) ?? 0, expected);
				}

				// Inclusion-exclusion cardinality identity:
				// |A ∪ B| + |A ∩ B| = |A| + |B|
				let intersectionCard = 0;
				for (const k of universe) {
					intersectionCard += Math.min(a.get(k) ?? 0, b.get(k) ?? 0);
				}
				assert.equal(
					totalCardinality(ab) + intersectionCard,
					totalCardinality(a) + totalCardinality(b)
				);
			}
		});
	});
});
