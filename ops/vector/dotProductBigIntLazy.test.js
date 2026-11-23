import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductBigIntLazy } from './dotProductBigIntLazy.js';

function* genFrom(values) {
	for (const v of values) {
		yield v;
	}
}

describe('dotProductBigIntLazy', () => {
	it('computes exact dot product for basic BigInt arrays', () => {
		assert.equal(dotProductBigIntLazy([1n, 2n, 3n], [4n, 5n, 6n]), 32n);
		assert.equal(dotProductBigIntLazy([-1n, 2n, -3n], [4n, -5n, 6n]), -32n);
		assert.equal(dotProductBigIntLazy([42n], [-3n]), -126n);
	});

	it('returns 0n for empty vectors', () => {
		assert.equal(dotProductBigIntLazy([], []), 0n);
		assert.equal(dotProductBigIntLazy(genFrom([]), genFrom([])), 0n);
	});

	it('returns 0n for orthogonal vectors', () => {
		assert.equal(dotProductBigIntLazy([1n, 0n, -1n], [1n, 999n, 1n]), 0n);
		assert.equal(dotProductBigIntLazy([3n, -4n], [4n, 3n]), 0n);
		assert.equal(dotProductBigIntLazy([0n, 0n, 0n], [10n, 20n, 30n]), 0n);
	});

	it('handles huge BigInts without precision loss', () => {
		const big = 10n ** 50n;
		const a = [big + 1n, -(big + 2n), 10n ** 100n];
		const b = [big - 1n, big - 2n, 2n];
		// (big+1)(big-1) - (big+2)(big-2) + 2*10^100
		// = (big^2 - 1) - (big^2 - 4) + 2*10^100 = 3 + 2*10^100
		const expected = 3n + 2n * 10n ** 100n;
		assert.equal(dotProductBigIntLazy(a, b), expected);
	});

	it('works with diverse iterable types (generators, Sets, BigInt TypedArrays, custom iterables)', () => {
		const setA = new Set([2n, 3n, 5n]);
		const typedB = new BigInt64Array([7n, 11n, 13n]);
		assert.equal(dotProductBigIntLazy(setA, typedB), 14n + 33n + 65n);

		const customIterable = {
			[Symbol.iterator]() {
				let i = 0;
				const vals = [10n, 20n, 30n];
				return {
					next() {
						return i < vals.length
							? { value: vals[i++], done: false }
							: { value: undefined, done: true };
					}
				};
			}
		};
		assert.equal(dotProductBigIntLazy(customIterable, genFrom([1n, 2n, 3n])), 140n);
	});

	it('consumes iterables lazily in lockstep in a single pass and closes iterators on early abort', () => {
		const events = [];
		let aClosed = false;
		let bClosed = false;

		function* trackedA() {
			try {
				events.push('a:0');
				yield 2n;
				events.push('a:1');
				yield 3n;
				events.push('a:2');
				yield 5n;
			} finally {
				aClosed = true;
			}
		}

		function* trackedB() {
			try {
				events.push('b:0');
				yield 10n;
				events.push('b:1');
				yield 20n;
				events.push('b:2');
				yield 30n;
			} finally {
				bClosed = true;
			}
		}

		const result = dotProductBigIntLazy(trackedA(), trackedB());
		assert.equal(result, 20n + 60n + 150n);
		// Strictly interleaved lockstep consumption (never drains one iterable before the other)
		assert.deepEqual(events, ['a:0', 'b:0', 'a:1', 'b:1', 'a:2', 'b:2']);
		assert.equal(aClosed, true);
		assert.equal(bClosed, true);

		// Verify infinite generator is closed promptly on length mismatch
		let infiniteClosed = false;
		let pulledCount = 0;
		function* infiniteOnes() {
			try {
				while (true) {
					pulledCount += 1;
					yield 1n;
				}
			} finally {
				infiniteClosed = true;
			}
		}

		assert.throws(() => dotProductBigIntLazy(infiniteOnes(), [1n, 2n, 3n]), RangeError);
		assert.equal(pulledCount, 4);
		assert.equal(infiniteClosed, true);
	});

	it('streams large sequences in O(1) memory', () => {
		const n = 50_000n;
		function* range(limit) {
			for (let i = 1n; i <= limit; i += 1n) {
				yield i;
			}
		}
		// sum_{i=1}^n i^2 = n(n+1)(2n+1)/6
		const expected = (n * (n + 1n) * (2n * n + 1n)) / 6n;
		assert.equal(dotProductBigIntLazy(range(n), range(n)), expected);
	});

	it('throws RangeError on mismatched vector lengths', () => {
		assert.throws(() => dotProductBigIntLazy([1n, 2n], [1n]), RangeError);
		assert.throws(() => dotProductBigIntLazy([1n], [1n, 2n]), RangeError);
		assert.throws(() => dotProductBigIntLazy([], [1n]), RangeError);
		assert.throws(() => dotProductBigIntLazy(genFrom([1n, 2n, 3n]), genFrom([1n, 2n])), RangeError);
	});

	it('throws TypeError on invalid iterable inputs or non-BigInt elements', () => {
		for (const bad of [null, undefined, 123, 123n, true, {}, '123', '', new String('abc')]) {
			assert.throws(() => dotProductBigIntLazy(bad, []), TypeError);
			assert.throws(() => dotProductBigIntLazy([], bad), TypeError);
		}

		assert.throws(() => dotProductBigIntLazy([1, 2], [3n, 4n]), TypeError);
		assert.throws(() => dotProductBigIntLazy([1n, 2n], [3n, 4]), TypeError);
		assert.throws(() => dotProductBigIntLazy([1n, '2'], [3n, 4n]), TypeError);
		assert.throws(() => dotProductBigIntLazy([1n, null], [3n, 4n]), TypeError);
		assert.throws(() => dotProductBigIntLazy([1n, undefined], [3n, 4n]), TypeError);
		assert.throws(() => dotProductBigIntLazy([1n, NaN], [3n, 4n]), TypeError);

		// Reject passing the same single-pass iterator instance for both arguments
		const singleGen = genFrom([1n, 2n, 3n, 4n]);
		assert.throws(() => dotProductBigIntLazy(singleGen, singleGen), TypeError);

		// Reject broken iterable whose [Symbol.iterator]() does not return an iterator
		const brokenIterable = { [Symbol.iterator]: () => ({}) };
		assert.throws(() => dotProductBigIntLazy(brokenIterable, []), TypeError);
	});

	it('satisfies algebraic properties: commutativity, bilinearity, and Cauchy-Schwarz', () => {
		const vectors = [
			[
				[3n, -7n, 11n, 0n, 42n],
				[-5n, 2n, 13n, 99n, -17n]
			],
			[
				[10n ** 25n + 7n, -(10n ** 24n), 3n ** 40n],
				[-(10n ** 25n) + 11n, 5n * 10n ** 24n, -(2n ** 60n)]
			],
			[
				[1n, 1n, 1n, 1n],
				[2n, 2n, 2n, 2n]
			]
		];

		for (const [a, b] of vectors) {
			const ab = dotProductBigIntLazy(genFrom(a), genFrom(b));
			const ba = dotProductBigIntLazy(genFrom(b), genFrom(a));
			assert.equal(ab, ba, 'commutativity: a·b === b·a');

			const aa = dotProductBigIntLazy(a, a);
			const bb = dotProductBigIntLazy(b, b);
			assert.ok(aa >= 0n && bb >= 0n, 'positive semi-definiteness');
			assert.ok(ab * ab <= aa * bb, 'Cauchy-Schwarz: (a·b)^2 <= (a·a)(b·b)');

			// Scaling linearity: (k*a)·b === k * (a·b)
			const k = -17n;
			const scaledA = a.map((x) => k * x);
			assert.equal(dotProductBigIntLazy(scaledA, b), k * ab, 'scalar linearity');
		}

		// Distributivity: (a + b)·c === a·c + b·c
		const a = [3n, -8n, 15n, 10n ** 18n];
		const b = [-9n, 4n, 21n, -(3n * 10n ** 18n)];
		const c = [7n, 11n, -2n, 5n * 10n ** 18n];
		const aPlusB = a.map((v, i) => v + b[i]);
		assert.equal(
			dotProductBigIntLazy(aPlusB, c),
			dotProductBigIntLazy(a, c) + dotProductBigIntLazy(b, c)
		);
	});
});
