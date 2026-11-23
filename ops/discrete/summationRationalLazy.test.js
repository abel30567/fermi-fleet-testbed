import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationRationalLazy } from './summationRationalLazy.js';

/**
 * Helper to construct a rational object concisely in tests.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
const r = (num, den = 1n) => ({ num, den });

/**
 * Independent BigInt GCD for verifying lowest-terms invariants.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		[a, b] = [b, a % b];
	}
	return a;
}

/**
 * Asserts that a rational is strictly in canonical lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} q
 */
function assertCanonical(q) {
	assert.equal(typeof q.num, 'bigint');
	assert.equal(typeof q.den, 'bigint');
	assert.ok(q.den > 0n, `expected positive denominator, got ${q.den}`);
	if (q.num === 0n) {
		assert.equal(q.den, 1n, `expected 0/1 for zero, got 0/${q.den}`);
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `expected reduced fraction, got ${q.num}/${q.den}`);
	}
}

describe('summationRationalLazy', () => {
	describe('normal cases', () => {
		it('yields exact reduced running sums for a finite array of rationals', () => {
			const sums = [...summationRationalLazy([r(1n, 2n), r(1n, 3n), r(1n, 6n)])];
			assert.deepEqual(sums, [r(1n, 2n), r(5n, 6n), r(1n, 1n)]);
			for (const s of sums) assertCanonical(s);
		});

		it('handles negative terms, cancellation, and zero sums cleanly', () => {
			const input = [r(3n, 4n), r(-1n, 2n), r(-1n, 4n), r(-5n, 6n), r(5n, 6n)];
			const sums = [...summationRationalLazy(input)];
			assert.deepEqual(sums, [
				r(3n, 4n),
				r(1n, 4n),
				r(0n, 1n),
				r(-5n, 6n),
				r(0n, 1n),
			]);
			for (const s of sums) assertCanonical(s);
		});

		it('normalizes unreduced inputs and negative denominators', () => {
			const input = [r(2n, 4n), r(6n, -18n), r(-10n, -60n), r(0n, -99n)];
			const sums = [...summationRationalLazy(input)];
			// 1/2, 1/2 - 1/3 = 1/6, 1/6 + 1/6 = 1/3, 1/3 + 0 = 1/3
			assert.deepEqual(sums, [r(1n, 2n), r(1n, 6n), r(1n, 3n), r(1n, 3n)]);
			for (const s of sums) assertCanonical(s);
		});

		it('avoids floating-point inaccuracy (0.1 + 0.2 === 0.3 exactly)', () => {
			const sums = [...summationRationalLazy([r(1n, 10n), r(2n, 10n)])];
			assert.deepEqual(sums, [r(1n, 10n), r(3n, 10n)]);
		});

		it('supports custom initial accumulator and includeInitial option', () => {
			const sumsWithInit = [
				...summationRationalLazy([r(1n, 3n), r(1n, 6n)], {
					initial: r(2n, 4n),
					includeInitial: true,
				}),
			];
			assert.deepEqual(sumsWithInit, [r(1n, 2n), r(5n, 6n), r(1n, 1n)]);

			const sumsNoEmit = [
				...summationRationalLazy([r(1n, 3n), r(1n, 6n)], {
					initial: r(2n, 4n),
					includeInitial: false,
				}),
			];
			assert.deepEqual(sumsNoEmit, [r(5n, 6n), r(1n, 1n)]);
		});

		it('works with arbitrary iterables (Set, generator, custom iterable)', () => {
			const set = new Set([r(1n, 4n), r(1n, 4n), r(1n, 2n)]);
			assert.deepEqual([...summationRationalLazy(set)], [r(1n, 4n), r(1n, 2n), r(1n, 1n)]);

			function* gen() {
				yield r(1n, 5n);
				yield r(2n, 5n);
				yield r(7n, 5n);
			}
			assert.deepEqual([...summationRationalLazy(gen())], [r(1n, 5n), r(3n, 5n), r(2n, 1n)]);
		});
	});

	describe('laziness and streaming semantics', () => {
		it('consumes input strictly lazily (one pull per next() call)', () => {
			let pulled = 0;
			const source = {
				[Symbol.iterator]() {
					return {
						next() {
							pulled += 1;
							return { value: r(1n, BigInt(pulled)), done: false };
						},
					};
				},
			};

			const stream = summationRationalLazy(source);
			assert.equal(pulled, 0, 'must not pull before first .next()');

			assert.deepEqual(stream.next(), { value: r(1n, 1n), done: false });
			assert.equal(pulled, 1);

			assert.deepEqual(stream.next(), { value: r(3n, 2n), done: false });
			assert.equal(pulled, 2);

			assert.deepEqual(stream.next(), { value: r(11n, 6n), done: false });
			assert.equal(pulled, 3);
		});

		it('with includeInitial: true, yields initial before pulling from source', () => {
			let pulled = 0;
			function* source() {
				pulled += 1;
				yield r(3n, 5n);
			}

			const stream = summationRationalLazy(source(), { includeInitial: true });
			assert.equal(pulled, 0);
			assert.deepEqual(stream.next(), { value: r(0n, 1n), done: false });
			assert.equal(pulled, 0);
			assert.deepEqual(stream.next(), { value: r(3n, 5n), done: false });
			assert.equal(pulled, 1);
			assert.deepEqual(stream.next(), { value: undefined, done: true });
		});

		it('closes upstream iterator cleanly on early termination (break / return)', () => {
			let cleanedUp = false;
			function* infiniteOnes() {
				try {
					while (true) {
						yield r(1n, 1n);
					}
				} finally {
					cleanedUp = true;
				}
			}

			const collected = [];
			for (const sum of summationRationalLazy(infiniteOnes())) {
				collected.push(sum);
				if (collected.length === 4) break;
			}

			assert.deepEqual(collected, [r(1n, 1n), r(2n, 1n), r(3n, 1n), r(4n, 1n)]);
			assert.equal(cleanedUp, true);
		});

		it('yielded objects are isolated from internal accumulator state', () => {
			const stream = summationRationalLazy([r(1n, 2n), r(1n, 2n)]);
			const first = stream.next().value;
			first.num = 999n;
			first.den = 777n;
			const second = stream.next().value;
			assert.deepEqual(second, r(1n, 1n));
		});
	});

	describe('edge cases', () => {
		it('handles empty iterable with and without includeInitial', () => {
			assert.deepEqual([...summationRationalLazy([])], []);
			assert.deepEqual(
				[...summationRationalLazy([], { includeInitial: true })],
				[r(0n, 1n)],
			);
			assert.deepEqual(
				[...summationRationalLazy([], { initial: r(-4n, -6n), includeInitial: true })],
				[r(2n, 3n)],
			);
		});

		it('handles single-element sequences including zero', () => {
			assert.deepEqual([...summationRationalLazy([r(0n, 7n)])], [r(0n, 1n)]);
			assert.deepEqual([...summationRationalLazy([r(-14n, 21n)])], [r(-2n, 3n)]);
		});

		it('handles very large BigInt numerators and denominators accurately', () => {
			const p = 10n ** 60n + 7n;
			const q = 10n ** 60n + 9n;
			const sums = [...summationRationalLazy([r(1n, p), r(1n, q), r(-1n, p)])];
			assert.deepEqual(sums[2], r(1n, q));
			for (const s of sums) assertCanonical(s);
		});
	});

	describe('input validation', () => {
		it('throws TypeError eagerly for non-iterable or string terms', () => {
			for (const bad of [null, undefined, 42, true, {}, '1/2']) {
				assert.throws(() => summationRationalLazy(bad), TypeError);
			}
		});

		it('throws eagerly for invalid options', () => {
			assert.throws(() => summationRationalLazy([], null), TypeError);
			assert.throws(() => summationRationalLazy([], []), TypeError);
			assert.throws(() => summationRationalLazy([], 'opt'), TypeError);
			assert.throws(() => summationRationalLazy([], { includeInitial: 1 }), TypeError);
			assert.throws(() => summationRationalLazy([], { initial: { num: 1, den: 2n } }), TypeError);
			assert.throws(() => summationRationalLazy([], { initial: r(1n, 0n) }), RangeError);
		});

		it('throws lazily when an invalid rational element is reached', () => {
			const badSeq = [r(1n, 2n), { num: 1, den: 2n }];
			const stream = summationRationalLazy(badSeq);
			assert.deepEqual(stream.next(), { value: r(1n, 2n), done: false });
			assert.throws(() => stream.next(), TypeError);
		});

		it('throws RangeError when encountering a zero denominator term', () => {
			const stream = summationRationalLazy([r(1n, 3n), r(5n, 0n)]);
			assert.deepEqual(stream.next(), { value: r(1n, 3n), done: false });
			assert.throws(() => stream.next(), RangeError);
		});

		it('rejects null, primitive, and array elements in the stream', () => {
			for (const badElem of [null, undefined, 1n, [1n, 2n], '1/2']) {
				const stream = summationRationalLazy([badElem]);
				assert.throws(() => stream.next(), TypeError);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches closed form of telescoping series sum_{k=1..n} 1/(k(k+1)) = n/(n+1)', () => {
			function* telescoping() {
				for (let k = 1n; ; k += 1n) {
					yield r(1n, k * (k + 1n));
				}
			}

			const stream = summationRationalLazy(telescoping());
			for (let n = 1n; n <= 200n; n += 1n) {
				const { value, done } = stream.next();
				assert.equal(done, false);
				assertCanonical(value);
				assert.deepEqual(value, r(n, n + 1n));
			}
			stream.return();
		});

		it('matches closed form of geometric series sum_{k=0..n} (p/q)^k', () => {
			const cases = [
				{ p: 1n, q: 2n, terms: 60 },
				{ p: 2n, q: 3n, terms: 40 },
				{ p: -1n, q: 3n, terms: 40 },
			];

			for (const { p, q, terms } of cases) {
				function* geom() {
					let num = 1n;
					let den = 1n;
					while (true) {
						yield r(num, den);
						num *= p;
						den *= q;
					}
				}

				const stream = summationRationalLazy(geom());
				for (let n = 0; n < terms; n += 1) {
					const { value } = stream.next();
					assertCanonical(value);

					// Closed form: (q^(n+1) - p^(n+1)) / (q^n * (q - p))
					const exp = BigInt(n);
					const rawNum = q ** (exp + 1n) - p ** (exp + 1n);
					const rawDen = q ** exp * (q - p);
					const g = gcd(rawNum, rawDen);
					const sign = rawDen < 0n ? -1n : 1n;
					const expected = r((rawNum * sign) / g, (rawDen * sign) / g);

					assert.deepEqual(value, expected);
				}
				stream.return();
			}
		});

		it('matches Faulhaber formula sum_{k=1..n} k^2 / 7 = n(n+1)(2n+1) / 42', () => {
			const nMax = 100n;
			function* scaledSquares() {
				for (let k = 1n; k <= nMax; k += 1n) {
					yield r(k * k, 7n);
				}
			}

			let n = 0n;
			for (const sum of summationRationalLazy(scaledSquares())) {
				n += 1n;
				assertCanonical(sum);
				const rawNum = n * (n + 1n) * (2n * n + 1n);
				const rawDen = 42n;
				const g = gcd(rawNum, rawDen);
				assert.deepEqual(sum, r(rawNum / g, rawDen / g));
			}
			assert.equal(n, nMax);
		});

		it('cross-checks against an independent product-denominator batch sum on mixed rationals', () => {
			// Deterministic mixed-sign sequence with coprime and shared-factor denominators
			const seq = [];
			for (let i = 1n; i <= 35n; i += 1n) {
				const num = (i % 2n === 0n ? -1n : 1n) * (i * 17n - 5n);
				const den = i * 3n + (i % 5n) + 1n;
				seq.push(r(num, den));
			}

			// Independent calculation using full product denominator D = prod(den_i)
			const D = seq.reduce((acc, q) => acc * q.den, 1n);
			const totalNum = seq.reduce((acc, q) => acc + q.num * (D / q.den), 0n);
			const g = gcd(totalNum, D);
			const expectedFinal = totalNum === 0n ? r(0n, 1n) : r(totalNum / g, D / g);

			let last = null;
			for (const partial of summationRationalLazy(seq)) {
				assertCanonical(partial);
				last = partial;
			}
			assert.deepEqual(last, expectedFinal);
		});
	});
});
