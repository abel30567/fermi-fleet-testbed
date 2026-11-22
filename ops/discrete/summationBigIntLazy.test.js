import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	summationBigIntLazy,
	FIXED_POINT_SCALE,
} from './summationBigIntLazy.js';

function* naturalsFrom(start = 1n) {
	let n = start;
	while (true) {
		yield n;
		n += 1n;
	}
}

function take(iterable, count) {
	const out = [];
	let remaining = count;
	if (remaining <= 0) return out;
	for (const value of iterable) {
		out.push(value);
		remaining -= 1;
		if (remaining === 0) break;
	}
	return out;
}

describe('summationBigIntLazy', () => {
	test('computes running partial sums over basic BigInt arrays', () => {
		const result = [...summationBigIntLazy([1n, 2n, 3n, 4n, 5n])];
		assert.deepEqual(result, [1n, 3n, 6n, 10n, 15n]);
	});

	test('supports initial accumulator as BigInt or options object', () => {
		assert.deepEqual(
			[...summationBigIntLazy([1n, 2n, 3n], 10n)],
			[11n, 13n, 16n]
		);
		assert.deepEqual(
			[...summationBigIntLazy([1n, 2n, 3n], { initial: -10n })],
			[-9n, -7n, -4n]
		);
		assert.deepEqual(
			[...summationBigIntLazy([1n, 2n, 3n], {})],
			[1n, 3n, 6n]
		);
	});

	test('supports options.term transform with BigInt index', () => {
		const seenIndices = [];
		const result = [
			...summationBigIntLazy(['a', 'bb', 'ccc', 'dddd'], {
				initial: 100n,
				term: (str, idx) => {
					seenIndices.push(idx);
					return BigInt(str.length) * (idx + 1n);
				},
			}),
		];
		assert.deepEqual(seenIndices, [0n, 1n, 2n, 3n]);
		// 100 + 1*1 = 101, + 2*2 = 105, + 3*3 = 114, + 4*4 = 130
		assert.deepEqual(result, [101n, 105n, 114n, 130n]);
	});

	test('works with diverse iterable types (Set, TypedArray, custom iterable, generator)', () => {
		assert.deepEqual(
			[...summationBigIntLazy(new Set([2n, 5n, 8n]))],
			[2n, 7n, 15n]
		);
		assert.deepEqual(
			[...summationBigIntLazy(new BigInt64Array([10n, -3n, 7n]))],
			[10n, 7n, 14n]
		);
		assert.deepEqual(
			[...summationBigIntLazy(new BigUint64Array([1n, 2n, 3n]))],
			[1n, 3n, 6n]
		);

		const customIterable = {
			*[Symbol.iterator]() {
				yield 4n;
				yield -1n;
				yield 9n;
			},
		};
		assert.deepEqual([...summationBigIntLazy(customIterable)], [4n, 3n, 12n]);
	});

	test('handles empty iterables, singletons, zeros, and negative/alternating values', () => {
		function* emptyGen() {}

		assert.deepEqual([...summationBigIntLazy([])], []);
		assert.deepEqual([...summationBigIntLazy([], 42n)], []);
		assert.deepEqual([...summationBigIntLazy(emptyGen())], []);
		assert.deepEqual([...summationBigIntLazy(new Set())], []);

		assert.deepEqual([...summationBigIntLazy([7n])], [7n]);
		assert.deepEqual([...summationBigIntLazy([0n, 0n, 0n])], [0n, 0n, 0n]);
		assert.deepEqual(
			[...summationBigIntLazy([-5n, 3n, -2n, 4n, -10n])],
			[-5n, -2n, -4n, 0n, -10n]
		);
	});

	test('preserves exact precision for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const huge = 10n ** 120n;
		const result = [
			...summationBigIntLazy([huge, 1n, -huge, 2n ** 256n - 1n, 1n]),
		];
		assert.deepEqual(result, [
			huge,
			huge + 1n,
			1n,
			2n ** 256n,
			2n ** 256n + 1n,
		]);
	});

	test('supports fixed-point BigInt series scaled by 10^18 exactly', () => {
		assert.equal(FIXED_POINT_SCALE, 10n ** 18n);

		// Dyadic geometric series: sum_{k=0}^{n} (1/2)^k * 10^18
		// For k <= 18, 2^k divides 10^18 exactly, so every term is exact in 10^18 fixed-point.
		function* dyadicTerms() {
			let term = FIXED_POINT_SCALE;
			for (let k = 0; k <= 18; k += 1) {
				yield term;
				term /= 2n;
			}
		}

		const partials = [...summationBigIntLazy(dyadicTerms())];
		assert.equal(partials.length, 19);

		// Independent closed-form check: sum_{k=0}^{n} 2^{-k} = 2 - 2^{-n}
		for (let n = 0; n <= 18; n += 1) {
			const expected =
				2n * FIXED_POINT_SCALE - FIXED_POINT_SCALE / 2n ** BigInt(n);
			assert.equal(partials[n], expected);
		}
	});

	test('consumes iterables lazily without eager materialization and propagates cleanup', () => {
		let iteratorRequested = false;
		let pulledCount = 0;
		let cleanedUp = false;

		const trackedInfiniteSource = {
			[Symbol.iterator]() {
				iteratorRequested = true;
				return (function* () {
					try {
						let k = 1n;
						while (true) {
							pulledCount += 1;
							yield k * 10n;
							k += 1n;
						}
					} finally {
						cleanedUp = true;
					}
				})();
			},
		};

		// Creating the generator must not even call [Symbol.iterator]()
		const gen = summationBigIntLazy(trackedInfiniteSource);
		assert.equal(iteratorRequested, false);
		assert.equal(pulledCount, 0);

		// Pulling step-by-step pulls strictly one element per .next()
		assert.deepEqual(gen.next(), { value: 10n, done: false });
		assert.equal(iteratorRequested, true);
		assert.equal(pulledCount, 1);

		assert.deepEqual(gen.next(), { value: 30n, done: false });
		assert.equal(pulledCount, 2);

		assert.deepEqual(gen.next(), { value: 60n, done: false });
		assert.equal(pulledCount, 3);
		assert.equal(cleanedUp, false);

		// Breaking/returning closes the underlying iterator cleanly
		assert.deepEqual(gen.return(), { value: undefined, done: true });
		assert.equal(cleanedUp, true);
		assert.equal(pulledCount, 3);
	});

	test('does not touch elements past early termination (poison tail test)', () => {
		const seqWithPoisonTail = [10n, 20n, 30n, 'not-a-bigint'];
		const firstThree = take(summationBigIntLazy(seqWithPoisonTail), 3);
		assert.deepEqual(firstThree, [10n, 30n, 60n]);
	});

	test('throws TypeError eagerly on invalid iterable or options', () => {
		const invalidIterables = [
			null,
			undefined,
			123,
			123n,
			true,
			false,
			{},
			() => {},
			Symbol('iter'),
			'',
			'123',
			new String('123'),
		];

		for (const bad of invalidIterables) {
			assert.throws(() => summationBigIntLazy(bad), TypeError);
		}

		const invalidSecondArgs = [
			null,
			0,
			42,
			'0',
			true,
			[],
			() => 0n,
			{ initial: 0 },
			{ initial: '0' },
			{ initial: null },
			{ term: 123 },
			{ term: null },
			{ term: 'fn' },
		];

		for (const badOpt of invalidSecondArgs) {
			assert.throws(() => summationBigIntLazy([1n], badOpt), TypeError);
		}
	});

	test('throws TypeError lazily when an element or term result is not a BigInt', () => {
		const gen = summationBigIntLazy([1n, 2n, 3, 4n]);
		assert.deepEqual(gen.next(), { value: 1n, done: false });
		assert.deepEqual(gen.next(), { value: 3n, done: false });
		assert.throws(() => gen.next(), TypeError);

		const genTerm = summationBigIntLazy([1n, 2n, 3n], {
			term: (x) => (x === 2n ? Number(x) : x),
		});
		assert.deepEqual(genTerm.next(), { value: 1n, done: false });
		assert.throws(() => genTerm.next(), TypeError);
	});

	test('cross-check: Faulhaber closed-form identities for sum k, sum k^2, sum k^3', () => {
		const N = 200;
		const sumK = take(summationBigIntLazy(naturalsFrom(1n)), N);
		const sumK2 = take(
			summationBigIntLazy(naturalsFrom(1n), { term: (k) => k * k }),
			N
		);
		const sumK3 = take(
			summationBigIntLazy(naturalsFrom(1n), { term: (k) => k * k * k }),
			N
		);

		for (let i = 0; i < N; i += 1) {
			const n = BigInt(i + 1);
			const expectedSumK = (n * (n + 1n)) / 2n;
			const expectedSumK2 = (n * (n + 1n) * (2n * n + 1n)) / 6n;
			const expectedSumK3 = expectedSumK * expectedSumK;

			assert.equal(sumK[i], expectedSumK);
			assert.equal(sumK2[i], expectedSumK2);
			assert.equal(sumK3[i], expectedSumK3);
		}
	});

	test('cross-check: exact geometric series closed form for huge powers', () => {
		const r = 3n;
		const count = 45;
		const partials = take(
			summationBigIntLazy(naturalsFrom(0n), { term: (k) => r ** k }),
			count
		);

		for (let n = 0; n < count; n += 1) {
			const expected = (r ** BigInt(n + 1) - 1n) / (r - 1n);
			assert.equal(partials[n], expected);
		}
	});

	test('cross-check: discrete Fundamental Theorem of Calculus (telescoping forward differences)', () => {
		const f = (k) => k ** 4n - 7n * k ** 2n + 3n * k + 11n;
		const count = 100;

		const recovered = take(
			summationBigIntLazy(naturalsFrom(0n), {
				initial: f(0n),
				term: (k) => f(k + 1n) - f(k),
			}),
			count
		);

		for (let i = 0; i < count; i += 1) {
			const n = BigInt(i + 1);
			assert.equal(recovered[i], f(n));
		}
	});

	test('cross-check: algebraic linearity of discrete summation', () => {
		const a = 7n;
		const b = -13n;
		const xs = [3n, -5n, 11n, 0n, 10n ** 30n, -42n];
		const ys = [-2n, 9n, 4n, 17n, -(10n ** 29n), 8n];

		const sumX = [...summationBigIntLazy(xs)];
		const sumY = [...summationBigIntLazy(ys)];
		const combined = xs.map((x, i) => a * x + b * ys[i]);
		const sumCombined = [...summationBigIntLazy(combined)];

		for (let i = 0; i < xs.length; i += 1) {
			assert.equal(sumCombined[i], a * sumX[i] + b * sumY[i]);
		}
	});
});
