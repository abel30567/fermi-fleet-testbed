import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddFloatMemo } from './vectorAddFloatMemo.js';

describe('vectorAddFloatMemo', () => {
	it('adds standard float64 and integer vectors', () => {
		assert.deepStrictEqual(vectorAddFloatMemo([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
		assert.deepStrictEqual(
			vectorAddFloatMemo([-16, 0, 16], [16, -16, 16]),
			[0, -16, 32]
		);
		assert.deepStrictEqual(
			vectorAddFloatMemo([1.5, -2.25, 0.125], [0.5, 2.25, 0.875]),
			[2, 0, 1]
		);
		assert.deepStrictEqual(
			vectorAddFloatMemo([0.1, 0.2], [0.2, 0.1]),
			[0.1 + 0.2, 0.2 + 0.1]
		);
	});

	it('accepts Float64Array inputs and mixed Array/Float64Array inputs', () => {
		const a = new Float64Array([1.25, -3.5, 100]);
		const b = new Float64Array([2.75, 3.5, -50.5]);
		assert.deepStrictEqual(vectorAddFloatMemo(a, b), [4, 0, 49.5]);
		assert.deepStrictEqual(vectorAddFloatMemo(a, [0, 1, 2]), [1.25, -2.5, 102]);
	});

	it('handles empty vectors and single-element vectors', () => {
		assert.deepStrictEqual(vectorAddFloatMemo([], []), []);
		assert.deepStrictEqual(vectorAddFloatMemo([42.5], [-0.5]), [42]);
	});

	it('preserves IEEE-754 special values (-0, +0, NaN, Infinity, subnormals, overflow)', () => {
		const negZeros = vectorAddFloatMemo([-0, -0, 0], [-0, 0, -0]);
		assert.strictEqual(Object.is(negZeros[0], -0), true);
		assert.strictEqual(Object.is(negZeros[1], 0), true);
		assert.strictEqual(Object.is(negZeros[2], 0), true);

		// Calling again ensures memoization preserves -0 vs +0 distinction.
		const posZeros = vectorAddFloatMemo([0, 0, 0], [0, 0, 0]);
		assert.strictEqual(Object.is(posZeros[0], 0), true);
		const negZerosCached = vectorAddFloatMemo([-0, -0, 0], [-0, 0, -0]);
		assert.strictEqual(Object.is(negZerosCached[0], -0), true);

		const specials = vectorAddFloatMemo(
			[Infinity, -Infinity, Infinity, NaN, Number.MAX_VALUE, Number.MIN_VALUE],
			[1, -1, -Infinity, 5, Number.MAX_VALUE, Number.MIN_VALUE]
		);
		assert.strictEqual(specials[0], Infinity);
		assert.strictEqual(specials[1], -Infinity);
		assert.strictEqual(Number.isNaN(specials[2]), true);
		assert.strictEqual(Number.isNaN(specials[3]), true);
		assert.strictEqual(specials[4], Infinity);
		assert.strictEqual(specials[5], Number.MIN_VALUE + Number.MIN_VALUE);
	});

	it('returns defensive copies so mutating results does not corrupt memoized cache', () => {
		const first = vectorAddFloatMemo([3, 4, 5], [6, 7, 8]);
		assert.deepStrictEqual(first, [9, 11, 13]);
		first[0] = 9999;

		const second = vectorAddFloatMemo([3, 4, 5], [6, 7, 8]);
		assert.deepStrictEqual(second, [9, 11, 13]);
		assert.notStrictEqual(first, second);
	});

	it('evicts entries cleanly beyond cache capacity without losing correctness', () => {
		for (let i = 0; i < 1100; i += 1) {
			const res = vectorAddFloatMemo([i, -i], [1.5, 2.5]);
			assert.deepStrictEqual(res, [i + 1.5, -i + 2.5]);
		}
		assert.deepStrictEqual(vectorAddFloatMemo([0, 0], [1.5, 2.5]), [1.5, 2.5]);
	});

	it('throws TypeError or RangeError on invalid inputs', () => {
		assert.throws(() => vectorAddFloatMemo(null, [1]), TypeError);
		assert.throws(() => vectorAddFloatMemo([1], undefined), TypeError);
		assert.throws(() => vectorAddFloatMemo('123', [1, 2, 3]), TypeError);
		assert.throws(() => vectorAddFloatMemo({}, []), TypeError);
		assert.throws(() => vectorAddFloatMemo([1, '2'], [3, 4]), TypeError);
		assert.throws(() => vectorAddFloatMemo([1, 2], [3, null]), TypeError);
		assert.throws(() => vectorAddFloatMemo([1, 2n], [3, 4]), TypeError);
		// Sparse array hole
		const sparse = new Array(2);
		sparse[0] = 1;
		assert.throws(() => vectorAddFloatMemo(sparse, [1, 2]), TypeError);
		// Length mismatch
		assert.throws(() => vectorAddFloatMemo([1, 2], [1]), RangeError);
		assert.throws(() => vectorAddFloatMemo([], [0]), RangeError);
	});

	it('matches an independent reference implementation and satisfies algebraic identities', () => {
		// Deterministic PRNG (Mulberry32) for reproducible cross-checking.
		let state = 0x5f3759df;
		const nextFloat = () => {
			state = (state + 0x6d2b79f5) | 0;
			let t = Math.imul(state ^ (state >>> 15), 1 | state);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};

		// Independent reference implementation using Float64Array + loop.
		const referenceAdd = (u, v) => {
			const out = new Float64Array(u.length);
			for (let i = 0; i < u.length; i += 1) {
				out[i] = u[i] + v[i];
			}
			return Array.from(out);
		};

		for (let trial = 0; trial < 50; trial += 1) {
			const len = (trial % 25) + 1;
			const u = new Array(len);
			const v = new Array(len);
			for (let i = 0; i < len; i += 1) {
				// Mix small integers (table path) and general float64 values.
				if (i % 3 === 0) {
					u[i] = Math.floor(nextFloat() * 33) - 16;
					v[i] = Math.floor(nextFloat() * 33) - 16;
				} else {
					u[i] = (nextFloat() - 0.5) * 1e6;
					v[i] = (nextFloat() - 0.5) * 1e6;
				}
			}

			const actual = vectorAddFloatMemo(u, v);
			const expected = referenceAdd(u, v);
			assert.deepStrictEqual(actual, expected);

			// Commutativity: u + v === v + u
			assert.deepStrictEqual(vectorAddFloatMemo(v, u), actual);

			// Additive identity: u + 0 === u (for non -0 entries)
			const zeros = new Array(len).fill(0);
			assert.deepStrictEqual(vectorAddFloatMemo(u, zeros), u.map((x) => x + 0));

			// Additive inverse: u + (-u) === 0
			const negU = u.map((x) => -x);
			assert.deepStrictEqual(vectorAddFloatMemo(u, negU), zeros);
		}
	});
});
