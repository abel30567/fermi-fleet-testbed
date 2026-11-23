import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orMultisetIterative } from './orMultisetIterative.js';

/**
 * Independent reference oracle for multiset OR via tagged-occurrence set union:
 * represents each multiset M as the ordinary set {(v, i) | 1 <= i <= M(v)},
 * takes the standard set union of tagged occurrences, and recounts per value.
 *
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {Map<string, number>}
 */
function referenceOrViaTaggedSetUnion(a, b) {
	const taggedUnion = new Set();

	for (const [value, count] of a) {
		for (let i = 1; i <= count; i++) {
			taggedUnion.add(`${value}\0${i}`);
		}
	}

	for (const [value, count] of b) {
		for (let i = 1; i <= count; i++) {
			taggedUnion.add(`${value}\0${i}`);
		}
	}

	const result = new Map();
	for (const token of taggedUnion) {
		const sepIndex = token.lastIndexOf('\0');
		const value = token.slice(0, sepIndex);
		result.set(value, (result.get(value) ?? 0) + 1);
	}
	return result;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
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

describe('orMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes element-wise max for overlapping and disjoint keys', () => {
			const a = new Map([
				['apple', 3],
				['banana', 1],
				['cherry', 2],
			]);
			const b = new Map([
				['banana', 4],
				['cherry', 2],
				['date', 5],
			]);

			const result = orMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					['apple', 3],
					['banana', 4],
					['cherry', 2],
					['date', 5],
				])
			);
		});

		it('handles completely disjoint multisets', () => {
			const a = new Map([
				['x', 2],
				['y', 1],
			]);
			const b = new Map([
				['z', 3],
				['w', 4],
			]);

			const result = orMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					['x', 2],
					['y', 1],
					['z', 3],
					['w', 4],
				])
			);
		});

		it('handles completely overlapping multisets where first dominates and vice versa', () => {
			const a = new Map([
				['k1', 10],
				['k2', 2],
			]);
			const b = new Map([
				['k1', 4],
				['k2', 9],
			]);

			assert.deepEqual(
				orMultisetIterative(a, b),
				new Map([
					['k1', 10],
					['k2', 9],
				])
			);
		});

		it('does not mutate either input Map and returns a new Map instance', () => {
			const a = new Map([
				['a', 2],
				['b', 1],
			]);
			const b = new Map([
				['b', 5],
				['c', 3],
			]);

			const result = orMultisetIterative(a, b);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
			assert.deepEqual(
				a,
				new Map([
					['a', 2],
					['b', 1],
				])
			);
			assert.deepEqual(
				b,
				new Map([
					['b', 5],
					['c', 3],
				])
			);

			result.set('a', 99);
			assert.equal(a.get('a'), 2);
		});

		it('works cleanly with Array.prototype.reduce over multiple multisets', () => {
			const multisets = [
				new Map([
					['a', 1],
					['b', 3],
				]),
				new Map([
					['b', 2],
					['c', 4],
				]),
				new Map([
					['a', 5],
					['d', 1],
				]),
			];

			const combined = multisets.reduce(orMultisetIterative);
			assert.deepEqual(
				combined,
				new Map([
					['a', 5],
					['b', 3],
					['c', 4],
					['d', 1],
				])
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty multisets', () => {
			const empty = new Map();
			const nonEmpty = new Map([
				['a', 2],
				['b', 1],
			]);

			assert.deepEqual(orMultisetIterative(empty, empty), new Map());
			assert.deepEqual(orMultisetIterative(nonEmpty, empty), new Map(nonEmpty));
			assert.deepEqual(orMultisetIterative(empty, nonEmpty), new Map(nonEmpty));
		});

		it('omits entries with zero or negative-zero counts from the result', () => {
			const a = new Map([
				['zeroOnly', 0],
				['negZeroOnly', -0],
				['zeroVsPos', 0],
				['posVsZero', 3],
			]);
			const b = new Map([
				['zeroOnly', 0],
				['zeroVsPos', 2],
				['posVsZero', 0],
				['bZeroOnly', -0],
			]);

			const result = orMultisetIterative(a, b);
			assert.deepEqual(
				result,
				new Map([
					['posVsZero', 3],
					['zeroVsPos', 2],
				])
			);
			assert.equal(result.has('zeroOnly'), false);
			assert.equal(result.has('negZeroOnly'), false);
			assert.equal(result.has('bZeroOnly'), false);
		});

		it('handles same Map reference passed as both arguments', () => {
			const a = new Map([
				['x', 3],
				['y', 0],
			]);
			const result = orMultisetIterative(a, a);
			assert.notEqual(result, a);
			assert.deepEqual(result, new Map([['x', 3]]));
		});

		it('supports arbitrary Map key types (objects, symbols, NaN, null, undefined, -0/+0)', () => {
			const objKey = { id: 1 };
			const nullProtoKey = Object.create(null);
			const symKey = Symbol('tag');

			const a = new Map([
				[objKey, 2],
				[nullProtoKey, 1],
				[symKey, 4],
				[NaN, 1],
				[null, 3],
				[undefined, 2],
				[-0, 5],
			]);
			const b = new Map([
				[objKey, 5],
				[nullProtoKey, 1],
				[symKey, 2],
				[NaN, 6],
				[null, 1],
				[+0, 3],
			]);

			const result = orMultisetIterative(a, b);
			assert.equal(result.get(objKey), 5);
			assert.equal(result.get(nullProtoKey), 1);
			assert.equal(result.get(symKey), 4);
			assert.equal(result.get(NaN), 6);
			assert.equal(result.get(null), 3);
			assert.equal(result.get(undefined), 2);
			assert.equal(result.get(0), 5);
			assert.equal(result.size, 7);
		});

		it('handles Number.MAX_SAFE_INTEGER counts accurately without overflow', () => {
			const a = new Map([['big', Number.MAX_SAFE_INTEGER]]);
			const b = new Map([['big', Number.MAX_SAFE_INTEGER - 1]]);

			const result = orMultisetIterative(a, b);
			assert.equal(result.get('big'), Number.MAX_SAFE_INTEGER);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not a Map', () => {
			const valid = new Map([['a', 1]]);

			for (const bad of [null, undefined, {}, [], new Set(), 'map', 42, true]) {
				assert.throws(() => orMultisetIterative(bad, valid), TypeError);
				assert.throws(() => orMultisetIterative(valid, bad), TypeError);
			}
		});

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map();

			for (const badCount of ['1', null, undefined, true, 1n, {}, []]) {
				assert.throws(
					() => orMultisetIterative(new Map([['k', badCount]]), valid),
					TypeError
				);
				assert.throws(
					() => orMultisetIterative(valid, new Map([['k', badCount]])),
					TypeError
				);
			}
		});

		it('throws RangeError when any count is negative, fractional, non-finite, or unsafe', () => {
			const valid = new Map();

			for (const badCount of [
				-1,
				-100,
				0.5,
				1.25,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(
					() => orMultisetIterative(new Map([['k', badCount]]), valid),
					RangeError
				);
				assert.throws(
					() => orMultisetIterative(valid, new Map([['k', badCount]])),
					RangeError
				);
			}
		});

		it('handles unprintable keys (Object.create(null)) cleanly in validation errors', () => {
			const badMap = new Map([[Object.create(null), -5]]);
			assert.throws(() => orMultisetIterative(badMap, new Map()), RangeError);
		});
	});

	describe('independent cross-checks and algebraic properties', () => {
		it('matches independent tagged-occurrence Set union oracle across random multisets', () => {
			const rng = createRng(20261123);
			const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

			for (let trial = 0; trial < 100; trial++) {
				const a = new Map();
				const b = new Map();

				for (const key of alphabet) {
					if (rng() < 0.65) {
						a.set(key, Math.floor(rng() * 8));
					}
					if (rng() < 0.65) {
						b.set(key, Math.floor(rng() * 8));
					}
				}

				const actual = orMultisetIterative(a, b);
				const expected = referenceOrViaTaggedSetUnion(a, b);

				assert.equal(actual.size, expected.size, `size mismatch on trial ${trial}`);
				for (const [k, v] of expected) {
					assert.equal(actual.get(k), v, `count mismatch for key ${k} on trial ${trial}`);
				}
			}
		});

		it('reduces to standard boolean Set union when all counts are in {0, 1}', () => {
			const setA = new Set(['p', 'q', 'r']);
			const setB = new Set(['q', 's', 't']);

			const mapA = new Map([...setA].map((x) => [x, 1]));
			const mapB = new Map([...setB].map((x) => [x, 1]));

			const result = orMultisetIterative(mapA, mapB);
			const expectedUnion = new Set([...setA, ...setB]);

			assert.deepEqual(new Set(result.keys()), expectedUnion);
			for (const count of result.values()) {
				assert.equal(count, 1);
			}
		});

		it('satisfies commutativity, associativity, idempotence, and identity laws', () => {
			const a = new Map([
				['a', 2],
				['b', 5],
				['c', 0],
			]);
			const b = new Map([
				['b', 3],
				['c', 4],
				['d', 1],
			]);
			const c = new Map([
				['a', 7],
				['d', 1],
				['e', 2],
			]);
			const empty = new Map();

			// Commutativity: A OR B = B OR A
			assert.deepEqual(orMultisetIterative(a, b), orMultisetIterative(b, a));

			// Associativity: (A OR B) OR C = A OR (B OR C)
			assert.deepEqual(
				orMultisetIterative(orMultisetIterative(a, b), c),
				orMultisetIterative(a, orMultisetIterative(b, c))
			);

			// Idempotence: A OR A = canonical(A)
			assert.deepEqual(
				orMultisetIterative(a, a),
				new Map([
					['a', 2],
					['b', 5],
				])
			);

			// Identity: A OR empty = canonical(A)
			assert.deepEqual(orMultisetIterative(a, empty), orMultisetIterative(a, a));
		});
	});
});
