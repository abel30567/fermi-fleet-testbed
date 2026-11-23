import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloFloatLazy } from './moduloFloatLazy.js';

describe('moduloFloatLazy', () => {
	describe('normal cases', () => {
		it('computes floored modulo for iterable dividends with scalar divisor', () => {
			const res = [...moduloFloatLazy([7, -1, 0, 5.5, -2.25, 9], 3)];
			assert.deepEqual(res, [1, 2, 0, 2.5, 0.75, 0]);
		});

		it('computes floored modulo for scalar dividend with iterable divisors', () => {
			const res = [...moduloFloatLazy(10, [3, 4, 6, 10, -3])];
			assert.deepEqual(res, [1, 2, 4, 0, -2]);
		});

		it('computes pairwise floored modulo for two iterables', () => {
			const res = [...moduloFloatLazy([10, -7, 5.5, -5], [3, 4, 2, -3])];
			assert.deepEqual(res, [1, 1, 1.5, -2]);
		});

		it('supports scalar-scalar inputs by yielding a single value', () => {
			const gen = moduloFloatLazy(-7, 4);
			assert.deepEqual(gen.next(), { value: 1, done: false });
			assert.deepEqual(gen.next(), { value: undefined, done: true });
		});

		it('supports TypedArrays, Sets, and custom iterables', () => {
			const typed = new Float64Array([10.5, -1.5, 4]);
			const set = new Set([3, 2, 4]);
			assert.deepEqual([...moduloFloatLazy(typed, set)], [1.5, 0.5, 0]);
		});

		it('supports euclidean and truncated modulo modes', () => {
			// Negative divisor distinguishes floored, euclidean, and truncated
			assert.deepEqual(
				[...moduloFloatLazy([5, -5, 6, -6], -3, { mode: 'floored' })],
				[-1, -2, 0, 0],
			);
			assert.deepEqual(
				[...moduloFloatLazy([5, -5, 6, -6], -3, { mode: 'euclidean' })],
				[2, 1, 0, 0],
			);
			assert.deepEqual(
				[...moduloFloatLazy([5, -5, 6, -6], -3, { mode: 'truncated' })],
				[2, -2, 0, 0],
			);
		});
	});

	describe('edge cases and IEEE-754 float64 behavior', () => {
		it('normalizes -0 to +0 across all modes', () => {
			for (const mode of ['floored', 'euclidean', 'truncated']) {
				const results = [
					...moduloFloatLazy([-0, -6, 6, -0], [3, 3, -3, -3], { mode }),
				];
				for (const value of results) {
					assert.ok(Object.is(value, 0), `expected +0 for mode=${mode}, got ${value}`);
				}
			}
		});

		it('preserves tiny positive float64 remainders without losing precision', () => {
			const tiny = 1e-17;
			const [res] = moduloFloatLazy([tiny, Number.MIN_VALUE], 1);
			assert.equal(res, tiny);
			assert.deepEqual(
				[...moduloFloatLazy([tiny, Number.MIN_VALUE], 1)],
				[tiny, Number.MIN_VALUE],
			);
		});

		it('clamps boundary round-up (-1e-17 mod 1 -> 0) to stay strictly in [0, m)', () => {
			const [rFloored] = moduloFloatLazy([-1e-17], 1, { mode: 'floored' });
			assert.ok(Object.is(rFloored, 0));

			const [rNegDiv] = moduloFloatLazy([1e-17], -1, { mode: 'floored' });
			assert.ok(Object.is(rNegDiv, 0));

			const [rEuclidean] = moduloFloatLazy([-1e-17], -1, { mode: 'euclidean' });
			assert.ok(Object.is(rEuclidean, 0));
		});

		it('handles empty iterables and unequal-length iterables', () => {
			assert.deepEqual([...moduloFloatLazy([], 5)], []);
			assert.deepEqual([...moduloFloatLazy(5, [])], []);
			assert.deepEqual([...moduloFloatLazy([1, 2, 3, 4], [2, 3])], [1, 2]);
			assert.deepEqual([...moduloFloatLazy([10], [3, 4, 5])], [1]);
		});

		it('handles large IEEE-754 magnitudes (e.g. Number.MAX_VALUE)', () => {
			// Number.MAX_VALUE is an exact even integer in IEEE-754 float64
			const [mod2] = moduloFloatLazy(Number.MAX_VALUE, 2);
			assert.ok(Object.is(mod2, 0));
		});
	});

	describe('lazy streaming and resource cleanup', () => {
		it('consumes infinite generators lazily without buffering', () => {
			let pulled = 0;
			function* infiniteNaturals() {
				let i = 0;
				while (true) {
					pulled += 1;
					yield i++;
				}
			}

			const stream = moduloFloatLazy(infiniteNaturals(), 4);
			// No elements pulled before first .next()
			assert.equal(pulled, 0);

			const taken = [];
			for (const value of stream) {
				taken.push(value);
				assert.equal(pulled, taken.length);
				if (taken.length === 6) {
					break;
				}
			}

			assert.deepEqual(taken, [0, 1, 2, 3, 0, 1]);
			assert.equal(pulled, 6);
		});

		it('closes both upstream iterators on early termination', () => {
			let closedA = false;
			let closedB = false;

			function* genA() {
				try {
					let i = 10;
					while (true) {
						yield i++;
					}
				} finally {
					closedA = true;
				}
			}

			function* genB() {
				try {
					while (true) {
						yield 3;
					}
				} finally {
					closedB = true;
				}
			}

			const out = [];
			for (const v of moduloFloatLazy(genA(), genB())) {
				out.push(v);
				if (out.length === 3) {
					break;
				}
			}

			assert.deepEqual(out, [1, 2, 0]);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('does not over-pull from second iterable when first iterable ends', () => {
			let pullsB = 0;
			function* genB() {
				while (true) {
					pullsB += 1;
					yield 5;
				}
			}

			const out = [...moduloFloatLazy([7, 8], genB())];
			assert.deepEqual(out, [2, 3]);
			assert.equal(pullsB, 2);
		});
	});

	describe('validation errors', () => {
		it('rejects non-number, non-iterable, and string top-level inputs eagerly', () => {
			assert.throws(() => moduloFloatLazy('123', 3), TypeError);
			assert.throws(() => moduloFloatLazy(10, '3'), TypeError);
			assert.throws(() => moduloFloatLazy(null, 3), TypeError);
			assert.throws(() => moduloFloatLazy(undefined, 3), TypeError);
			assert.throws(() => moduloFloatLazy({}, 3), TypeError);
			assert.throws(() => moduloFloatLazy(10, true), TypeError);
			assert.throws(() => moduloFloatLazy(10n, 3), TypeError);
		});

		it('rejects non-finite and zero scalar inputs eagerly', () => {
			assert.throws(() => moduloFloatLazy(NaN, 3), RangeError);
			assert.throws(() => moduloFloatLazy(Infinity, 3), RangeError);
			assert.throws(() => moduloFloatLazy(-Infinity, 3), RangeError);
			assert.throws(() => moduloFloatLazy(10, NaN), RangeError);
			assert.throws(() => moduloFloatLazy(10, Infinity), RangeError);
			assert.throws(() => moduloFloatLazy(10, 0), RangeError);
			assert.throws(() => moduloFloatLazy(10, -0), RangeError);
		});

		it('rejects invalid options eagerly', () => {
			assert.throws(() => moduloFloatLazy(5, 3, null), TypeError);
			assert.throws(() => moduloFloatLazy(5, 3, []), TypeError);
			assert.throws(() => moduloFloatLazy(5, 3, 'floored'), TypeError);
			assert.throws(() => moduloFloatLazy(5, 3, { mode: 'unknown' }), RangeError);
			assert.throws(() => moduloFloatLazy(5, 3, { mode: 123 }), RangeError);
		});

		it('validates streamed elements lazily and closes iterators on error', () => {
			let closed = false;
			function* badDividends() {
				try {
					yield 7;
					yield NaN;
					yield 9;
				} finally {
					closed = true;
				}
			}

			const stream = moduloFloatLazy(badDividends(), 3);
			assert.deepEqual(stream.next(), { value: 1, done: false });
			assert.throws(() => stream.next(), RangeError);
			assert.equal(closed, true);

			assert.throws(() => [...moduloFloatLazy([1, '2'], 3)], TypeError);
			assert.throws(() => [...moduloFloatLazy([1, 2], [3, 0])], RangeError);
			assert.throws(() => [...moduloFloatLazy([1, 2], [3, -0])], RangeError);
			assert.throws(() => [...moduloFloatLazy([1, 2], [3, Infinity])], RangeError);
			assert.throws(() => [...moduloFloatLazy([1, 2], [3, null])], TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches arbitrary-precision BigInt arithmetic for huge float64 integers', () => {
			const dividends = [
				1e20,
				-1e20,
				2 ** 80,
				-(2 ** 80),
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
				Number.MAX_SAFE_INTEGER,
				-Number.MAX_SAFE_INTEGER,
			];
			const divisors = [3, 7, 13, -3, -7, 97];

			function bigIntFlooredMod(aBig, mBig) {
				const r = aBig % mBig;
				if (r === 0n) return 0n;
				if ((r < 0n && mBig > 0n) || (r > 0n && mBig < 0n)) {
					return r + mBig;
				}
				return r;
			}

			for (const m of divisors) {
				const actual = [...moduloFloatLazy(dividends, m, { mode: 'floored' })];
				const expected = dividends.map((a) =>
					Number(bigIntFlooredMod(BigInt(a), BigInt(m))),
				);
				assert.deepEqual(actual, expected);
			}
		});

		it('matches exact scaled BigInt arithmetic for dyadic fractional float64 values', () => {
			// Scale exact binary fractions k / 16 into BigInt to avoid floating-point formula reuse
			const scale = 16;
			const scaleBig = 16n;
			const pairs = [
				[-37 / scale, 5 / scale],
				[37 / scale, 5 / scale],
				[-37 / scale, -5 / scale],
				[37 / scale, -5 / scale],
				[-1 / scale, 7 / scale],
				[15 / scale, 3 / scale],
				[-15 / scale, 3 / scale],
			];

			const actual = [
				...moduloFloatLazy(
					pairs.map(([a]) => a),
					pairs.map(([, m]) => m),
					{ mode: 'euclidean' },
				),
			];

			const expected = pairs.map(([a, m]) => {
				const aScaled = BigInt(Math.round(a * scale));
				const mScaled = BigInt(Math.round(m * scale));
				const absM = mScaled < 0n ? -mScaled : mScaled;
				let r = aScaled % absM;
				if (r < 0n) r += absM;
				return Number(r) / Number(scaleBig);
			});

			assert.deepEqual(actual, expected);
		});
	});
});
