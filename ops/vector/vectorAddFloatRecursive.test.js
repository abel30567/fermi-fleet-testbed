import { describe, it } from 'node:test';
import assert from 'node:assert';
import { vectorAddFloatRecursive } from './vectorAddFloatRecursive.js';

describe('vectorAddFloatRecursive', () => {
	it('adds standard vectors of positive and negative integers and floats', () => {
		assert.deepStrictEqual(
			vectorAddFloatRecursive([1, 2, 3], [4, 5, 6]),
			[5, 7, 9],
		);
		assert.deepStrictEqual(
			vectorAddFloatRecursive([-1.5, 0, 2.25, -4.75], [1.5, -0.5, 3.75, -1.25]),
			[0, -0.5, 6, -6],
		);
	});

	it('handles empty vectors', () => {
		assert.deepStrictEqual(vectorAddFloatRecursive([], []), []);
	});

	it('handles single-element vectors', () => {
		assert.deepStrictEqual(vectorAddFloatRecursive([42.5], [-12.25]), [30.25]);
		assert.deepStrictEqual(vectorAddFloatRecursive([0], [0]), [0]);
	});

	it('handles odd and even lengths across multiple recursion depths', () => {
		for (const len of [2, 3, 5, 7, 8, 15, 16, 17, 31, 32, 33]) {
			const a = Array.from({ length: len }, (_, i) => i * 0.5 - len / 4);
			const b = Array.from({ length: len }, (_, i) => (len - i) * 0.25);
			const expected = a.map((v, i) => v + b[i]);
			assert.deepStrictEqual(vectorAddFloatRecursive(a, b), expected);
		}
	});

	it('preserves IEEE-754 float64 semantics for fractional, subnormal, and signed-zero values', () => {
		const res = vectorAddFloatRecursive(
			[0.1, -0, Number.MIN_VALUE, 1e-15],
			[0.2, -0, Number.MIN_VALUE, -1e-15],
		);
		assert.strictEqual(res[0], 0.1 + 0.2);
		assert.ok(Object.is(res[1], -0));
		assert.strictEqual(res[2], Number.MIN_VALUE + Number.MIN_VALUE);
		assert.strictEqual(res[3], 0);
	});

	it('does not mutate input arrays', () => {
		const a = [1.5, -2.5, 3.5];
		const b = [4.5, 5.5, -6.5];
		const aCopy = [...a];
		const bCopy = [...b];

		const out = vectorAddFloatRecursive(a, b);
		assert.notStrictEqual(out, a);
		assert.notStrictEqual(out, b);
		assert.deepStrictEqual(a, aCopy);
		assert.deepStrictEqual(b, bCopy);
	});

	it('handles large vectors without stack overflow and matches iterative reference', () => {
		const n = 50_000;
		const a = new Array(n);
		const b = new Array(n);
		for (let i = 0; i < n; i++) {
			a[i] = Math.sin(i) * 1000;
			b[i] = Math.cos(i) * 1000;
		}

		const actual = vectorAddFloatRecursive(a, b);
		const expected = a.map((v, i) => v + b[i]);
		assert.deepStrictEqual(actual, expected);
	});

	it('satisfies commutativity, additive identity, and associativity cross-checks', () => {
		// Use exact dyadic rationals so float64 associativity holds without rounding drift
		const a = [-3.5, 0.25, 1.125, -8.75, 16.5, 0, 4.0625];
		const b = [2.25, -0.5, 3.875, 4.25, -16.5, 1.5, -2.0625];
		const c = [1.25, 0.25, -5.0, 4.5, 0.75, -1.5, 8.0];
		const zero = new Array(a.length).fill(0);

		// Cross-check against independent iterative map
		assert.deepStrictEqual(
			vectorAddFloatRecursive(a, b),
			a.map((v, i) => v + b[i]),
		);

		// Commutativity: a + b === b + a
		assert.deepStrictEqual(
			vectorAddFloatRecursive(a, b),
			vectorAddFloatRecursive(b, a),
		);

		// Additive identity: a + 0 === a
		assert.deepStrictEqual(vectorAddFloatRecursive(a, zero), a);

		// Additive inverse: a + (-a) === 0
		const negA = a.map((v) => (v === 0 ? 0 : -v));
		assert.deepStrictEqual(vectorAddFloatRecursive(a, negA), zero);

		// Associativity: (a + b) + c === a + (b + c)
		assert.deepStrictEqual(
			vectorAddFloatRecursive(vectorAddFloatRecursive(a, b), c),
			vectorAddFloatRecursive(a, vectorAddFloatRecursive(b, c)),
		);
	});

	it('throws TypeError when inputs are not arrays', () => {
		assert.throws(() => vectorAddFloatRecursive(null, [1]), TypeError);
		assert.throws(() => vectorAddFloatRecursive([1], null), TypeError);
		assert.throws(() => vectorAddFloatRecursive(undefined, []), TypeError);
		assert.throws(() => vectorAddFloatRecursive('123', [1, 2, 3]), TypeError);
		assert.throws(
			() => vectorAddFloatRecursive(new Float64Array([1, 2]), [1, 2]),
			TypeError,
		);
		assert.throws(() => vectorAddFloatRecursive({ 0: 1, length: 1 }, [1]), TypeError);
	});

	it('throws RangeError when vector lengths differ', () => {
		assert.throws(() => vectorAddFloatRecursive([1, 2], [1]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([], [0]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([1, 2, 3], [1, 2, 3, 4]), RangeError);
	});

	it('throws TypeError when elements are not numbers or array is sparse', () => {
		assert.throws(() => vectorAddFloatRecursive(['1'], [1]), TypeError);
		assert.throws(() => vectorAddFloatRecursive([1, null], [1, 2]), TypeError);
		assert.throws(() => vectorAddFloatRecursive([1, 2], [1, undefined]), TypeError);
		assert.throws(() => vectorAddFloatRecursive([1, true], [1, 2]), TypeError);
		assert.throws(() => vectorAddFloatRecursive([1n], [1]), TypeError);
		// Sparse array with an empty slot
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => vectorAddFloatRecursive([1, , 3], [1, 2, 3]), TypeError);
	});

	it('throws RangeError when elements are NaN or Infinity', () => {
		assert.throws(() => vectorAddFloatRecursive([NaN], [1]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([1, 2], [1, NaN]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([Infinity], [1]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([1, -Infinity], [1, 2]), RangeError);
		assert.throws(() => vectorAddFloatRecursive([1, 2], [Infinity, 2]), RangeError);
	});
});
