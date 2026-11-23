import test from 'node:test';
import assert from 'node:assert/strict';
import { permutationsTypedIterative } from './permutationsTypedIterative.js';

test('computes standard element-wise permutations over Float64Array', () => {
	const n = new Float64Array([0, 5, 5, 5, 5, 5, 10, 12]);
	const k = new Float64Array([0, 0, 1, 2, 3, 5, 4, 5]);
	const out = permutationsTypedIterative(n, k);

	assert.ok(out instanceof Float64Array);
	assert.equal(out.length, n.length);
	assert.deepEqual(
		Array.from(out),
		[1, 1, 5, 20, 60, 120, 5040, 95040]
	);
	// Does not mutate input arrays
	assert.deepEqual(Array.from(n), [0, 5, 5, 5, 5, 5, 10, 12]);
	assert.deepEqual(Array.from(k), [0, 0, 1, 2, 3, 5, 4, 5]);
});

test('handles edge cases: empty arrays, k > n, k === 0, -0, large n with small k, and overflow', () => {
	// Empty inputs
	const emptyOut = permutationsTypedIterative(
		new Float64Array(0),
		new Float64Array(0)
	);
	assert.ok(emptyOut instanceof Float64Array);
	assert.equal(emptyOut.length, 0);

	// k > n returns 0, including very large k
	const kGtN = permutationsTypedIterative(
		new Float64Array([0, 3, 5]),
		new Float64Array([1, 5, 1e9])
	);
	assert.deepEqual(Array.from(kGtN), [0, 0, 0]);

	// -0 treated as 0 and produces positive 0 / 1
	const negZero = permutationsTypedIterative(
		new Float64Array([-0, -0, 5]),
		new Float64Array([-0, 1, -0])
	);
	assert.deepEqual(Array.from(negZero), [1, 0, 1]);
	assert.ok(!Object.is(negZero[1], -0));

	// Large n with small k avoids factorial intermediate overflow
	const largeNSmallK = permutationsTypedIterative(
		new Float64Array([200, 1000, 1e6]),
		new Float64Array([2, 3, 0])
	);
	assert.deepEqual(Array.from(largeNSmallK), [39800, 997002000, 1]);

	// Overflow to Infinity terminates promptly
	const overflow = permutationsTypedIterative(
		new Float64Array([170, 171, 1e9]),
		new Float64Array([170, 171, 1e9])
	);
	assert.ok(Number.isFinite(overflow[0]));
	assert.equal(overflow[1], Infinity);
	assert.equal(overflow[2], Infinity);
});

test('validates input types, array lengths, and element domains', () => {
	// Non-Float64Array inputs
	assert.throws(() => permutationsTypedIterative([5], new Float64Array([2])), TypeError);
	assert.throws(() => permutationsTypedIterative(new Float64Array([5]), [2]), TypeError);
	assert.throws(
		() => permutationsTypedIterative(new Int32Array([5]), new Float64Array([2])),
		TypeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5]), new Float32Array([2])),
		TypeError
	);
	assert.throws(() => permutationsTypedIterative(null, new Float64Array([2])), TypeError);
	assert.throws(() => permutationsTypedIterative(new Float64Array([5]), undefined), TypeError);

	// Mismatched lengths
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5, 6]), new Float64Array([2])),
		RangeError
	);

	// Invalid numeric elements: negative, fractional, NaN, Infinity
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([-1]), new Float64Array([0])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5]), new Float64Array([-2])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5.5]), new Float64Array([2])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5]), new Float64Array([1.25])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([NaN]), new Float64Array([1])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5]), new Float64Array([NaN])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([Infinity]), new Float64Array([1])),
		RangeError
	);
	assert.throws(
		() => permutationsTypedIterative(new Float64Array([5]), new Float64Array([Infinity])),
		RangeError
	);
});

test('independent cross-check against BigInt factorial formula P(n, k) = n! / (n - k)!', () => {
	const fact = (m) => {
		let res = 1n;
		for (let i = 2n; i <= BigInt(m); i++) {
			res *= i;
		}
		return res;
	};

	const ns = [];
	const ks = [];
	const expected = [];

	// Exact in IEEE-754 float64 for all 0 <= k <= n <= 18 (18! < 2^53)
	for (let n = 0; n <= 18; n++) {
		for (let k = 0; k <= n + 2; k++) {
			ns.push(n);
			ks.push(k);
			expected.push(k > n ? 0 : Number(fact(n) / fact(n - k)));
		}
	}

	const actual = permutationsTypedIterative(
		Float64Array.from(ns),
		Float64Array.from(ks)
	);
	assert.deepEqual(Array.from(actual), expected);
});

test('independent cross-check against recurrence P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)', () => {
	const ns = [];
	const ks = [];
	const nMinus1 = [];
	const kMinus1 = [];

	for (let n = 1; n <= 15; n++) {
		for (let k = 1; k <= n; k++) {
			ns.push(n);
			ks.push(k);
			nMinus1.push(n - 1);
			kMinus1.push(k - 1);
		}
	}

	const lhs = permutationsTypedIterative(
		Float64Array.from(ns),
		Float64Array.from(ks)
	);
	const term1 = permutationsTypedIterative(
		Float64Array.from(nMinus1),
		Float64Array.from(ks)
	);
	const term2 = permutationsTypedIterative(
		Float64Array.from(nMinus1),
		Float64Array.from(kMinus1)
	);

	for (let i = 0; i < lhs.length; i++) {
		assert.equal(lhs[i], term1[i] + ks[i] * term2[i]);
	}
});
