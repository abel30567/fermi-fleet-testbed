import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDualMemo } from './addDualMemo.js';

describe('addDualMemo', () => {
	beforeEach(() => {
		addDualMemo.clearCache();
	});

	describe('normal cases', () => {
		it('adds positive integer dual numbers', () => {
			assert.deepStrictEqual(addDualMemo({ v: 2, d: 3 }, { v: 4, d: 5 }), { v: 6, d: 8 });
		});

		it('adds negative and mixed-sign dual numbers', () => {
			assert.deepStrictEqual(addDualMemo({ v: -7, d: 12 }, { v: 3, d: -15 }), { v: -4, d: -3 });
			assert.deepStrictEqual(addDualMemo({ v: -10, d: -6 }, { v: -4, d: -9 }), { v: -14, d: -15 });
		});

		it('adds floating-point dual numbers outside the integer table', () => {
			const res = addDualMemo({ v: 1.25, d: -0.5 }, { v: 2.5, d: 1.75 });
			assert.deepStrictEqual(res, { v: 3.75, d: 1.25 });
		});

		it('adds large integer dual numbers outside the precomputed table', () => {
			assert.deepStrictEqual(addDualMemo({ v: 1000, d: -500 }, { v: 250, d: 125 }), {
				v: 1250,
				d: -375,
			});
		});

		it('accepts null-prototype objects and objects with extra properties', () => {
			const a = Object.assign(Object.create(null), { v: 3, d: 4 });
			const b = { v: 5, d: 6, label: 'ignored' };
			assert.deepStrictEqual(addDualMemo(a, b), { v: 8, d: 10 });
		});

		it('does not mutate input operands', () => {
			const a = { v: 1, d: 2 };
			const b = { v: 3, d: 4 };
			addDualMemo(a, b);
			assert.deepStrictEqual(a, { v: 1, d: 2 });
			assert.deepStrictEqual(b, { v: 3, d: 4 });
		});
	});

	describe('edge cases', () => {
		it('handles additive identity { v: 0, d: 0 }', () => {
			const x = { v: 42.5, d: -3.25 };
			const zero = { v: 0, d: 0 };
			assert.deepStrictEqual(addDualMemo(x, zero), x);
			assert.deepStrictEqual(addDualMemo(zero, x), x);
		});

		it('preserves IEEE-754 signed zero semantics', () => {
			const negZero = { v: -0, d: -0 };
			const posZero = { v: 0, d: 0 };

			const rNeg = addDualMemo(negZero, negZero);
			assert.equal(Object.is(rNeg.v, -0), true);
			assert.equal(Object.is(rNeg.d, -0), true);

			const rMixed1 = addDualMemo(negZero, posZero);
			assert.equal(Object.is(rMixed1.v, 0), true);
			assert.equal(Object.is(rMixed1.d, 0), true);

			const rMixed2 = addDualMemo(posZero, negZero);
			assert.equal(Object.is(rMixed2.v, 0), true);
			assert.equal(Object.is(rMixed2.d, 0), true);

			// Verify -0 and +0 do not collide in the memo cache
			const rNegAgain = addDualMemo({ v: -0, d: -0 }, { v: -0, d: -0 });
			assert.equal(rNegAgain, rNeg);
			assert.equal(Object.is(rNegAgain.v, -0), true);
			assert.notEqual(rNeg, rMixed1);
		});

		it('handles exact table boundary values (-17, -16, 16, 17)', () => {
			assert.deepStrictEqual(addDualMemo({ v: -16, d: 16 }, { v: -16, d: 16 }), {
				v: -32,
				d: 32,
			});
			assert.deepStrictEqual(addDualMemo({ v: -17, d: 17 }, { v: 16, d: -16 }), {
				v: -1,
				d: 1,
			});
			assert.deepStrictEqual(addDualMemo({ v: -16, d: -17 }, { v: 17, d: 16 }), {
				v: 1,
				d: -1,
			});
		});

		it('handles subnormal numbers and MAX_SAFE_INTEGER', () => {
			const sub = addDualMemo(
				{ v: Number.MIN_VALUE, d: -Number.MIN_VALUE },
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE }
			);
			assert.equal(sub.v, Number.MIN_VALUE + Number.MIN_VALUE);
			assert.equal(sub.d, 0);

			const safe = addDualMemo(
				{ v: Number.MAX_SAFE_INTEGER, d: -Number.MAX_SAFE_INTEGER },
				{ v: 0, d: 1 }
			);
			assert.deepStrictEqual(safe, {
				v: Number.MAX_SAFE_INTEGER,
				d: -Number.MAX_SAFE_INTEGER + 1,
			});
		});

		it('follows IEEE-754 overflow for finite extreme inputs', () => {
			const res = addDualMemo(
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE }
			);
			assert.equal(res.v, Infinity);
			assert.equal(res.d, -Infinity);
		});

		it('returns frozen objects so callers cannot corrupt the memo cache', () => {
			const res = addDualMemo({ v: 1, d: 2 }, { v: 3, d: 4 });
			assert.equal(Object.isFrozen(res), true);
			assert.throws(() => {
				res.v = 999;
			}, TypeError);
			assert.deepStrictEqual(addDualMemo({ v: 1, d: 2 }, { v: 3, d: 4 }), { v: 4, d: 6 });
		});
	});

	describe('memoization and precomputed table behavior', () => {
		it('caches repeated calls and returns identical references on cache hit', () => {
			const r1 = addDualMemo({ v: 3.5, d: 1.25 }, { v: -2.5, d: 4.75 });
			const r2 = addDualMemo({ v: 3.5, d: 1.25 }, { v: -2.5, d: 4.75 });

			assert.equal(r1, r2);
			assert.deepStrictEqual(addDualMemo.getStats(), {
				hits: 1,
				misses: 1,
				evictions: 0,
				tableLookups: 0,
				size: 1,
				maxSize: addDualMemo.MAX_CACHE_SIZE,
			});
		});

		it('reuses cache entries across commuted operand orders', () => {
			const a = { v: 10.5, d: -3.25 };
			const b = { v: -4.5, d: 7.75 };
			const r1 = addDualMemo(a, b);
			const r2 = addDualMemo(b, a);

			assert.equal(r1, r2);
			assert.equal(addDualMemo.getStats().hits, 1);
			assert.equal(addDualMemo.getStats().misses, 1);
			assert.equal(addDualMemo.getStats().size, 1);
		});

		it('uses the precomputed table for integer components in [-16, 16]', () => {
			// Both v and d are within [-16, 16] => 2 table lookups on miss
			addDualMemo({ v: -16, d: 5 }, { v: 16, d: -12 });
			assert.equal(addDualMemo.getStats().tableLookups, 2);

			// Mixed: v in table, d outside table => +1 table lookup
			addDualMemo({ v: 1, d: 100 }, { v: 2, d: 200 });
			assert.equal(addDualMemo.getStats().tableLookups, 3);

			// Non-integers => +0 table lookups
			addDualMemo({ v: 1.5, d: 2.5 }, { v: 3.5, d: 4.5 });
			assert.equal(addDualMemo.getStats().tableLookups, 3);

			// Cache hit should not trigger additional table lookups
			addDualMemo({ v: -16, d: 5 }, { v: 16, d: -12 });
			assert.equal(addDualMemo.getStats().tableLookups, 3);
			assert.equal(addDualMemo.getStats().hits, 1);
		});

		it('evicts least-recently-used entries when cache exceeds MAX_CACHE_SIZE', () => {
			const max = addDualMemo.MAX_CACHE_SIZE;

			// Insert entry 0 and entry 1, then fill up to max
			const first = addDualMemo({ v: 0, d: 0 }, { v: 0, d: 0 });
			const second = addDualMemo({ v: 1, d: 0 }, { v: 0, d: 0 });
			for (let i = 2; i < max; i += 1) {
				addDualMemo({ v: i, d: 0 }, { v: 0, d: 0 });
			}
			assert.equal(addDualMemo.getStats().size, max);
			assert.equal(addDualMemo.getStats().evictions, 0);

			// Touch entry 0 so entry 1 becomes least-recently-used
			assert.equal(addDualMemo({ v: 0, d: 0 }, { v: 0, d: 0 }), first);

			// Inserting one more unique entry should evict entry 1, not entry 0
			addDualMemo({ v: max, d: 0 }, { v: 0, d: 0 });
			assert.equal(addDualMemo.getStats().size, max);
			assert.equal(addDualMemo.getStats().evictions, 1);

			// Entry 0 should still be a cache hit (same reference)
			assert.equal(addDualMemo({ v: 0, d: 0 }, { v: 0, d: 0 }), first);

			// Entry 1 was evicted, so recomputing creates a fresh object reference
			const secondRecomputed = addDualMemo({ v: 1, d: 0 }, { v: 0, d: 0 });
			assert.notEqual(secondRecomputed, second);
			assert.deepStrictEqual(secondRecomputed, second);
		});

		it('resets entries and counters on clearCache()', () => {
			const r1 = addDualMemo({ v: 2, d: 3 }, { v: 4, d: 5 });
			addDualMemo.clearCache();
			assert.deepStrictEqual(addDualMemo.getStats(), {
				hits: 0,
				misses: 0,
				evictions: 0,
				tableLookups: 0,
				size: 0,
				maxSize: addDualMemo.MAX_CACHE_SIZE,
			});
			const r2 = addDualMemo({ v: 2, d: 3 }, { v: 4, d: 5 });
			assert.notEqual(r1, r2);
			assert.deepStrictEqual(r2, { v: 6, d: 8 });
		});
	});

	describe('error handling', () => {
		it('throws TypeError for missing or non-object operands', () => {
			const valid = { v: 1, d: 1 };
			const badInputs = [undefined, null, 0, 42, '1', true, [1, 2], () => ({ v: 1, d: 1 })];
			for (const bad of badInputs) {
				assert.throws(() => addDualMemo(bad, valid), TypeError);
				assert.throws(() => addDualMemo(valid, bad), TypeError);
			}
			assert.throws(() => addDualMemo(), TypeError);
			assert.throws(() => addDualMemo(valid), TypeError);
		});

		it('throws TypeError when v or d is missing or not a number', () => {
			const valid = { v: 1, d: 1 };
			const malformed = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: null, d: 1 },
				{ v: 1, d: undefined },
				{ v: true, d: 1 },
				{ v: 1n, d: 2 },
				{ v: 1, d: {} },
			];
			for (const bad of malformed) {
				assert.throws(() => addDualMemo(bad, valid), TypeError);
				assert.throws(() => addDualMemo(valid, bad), TypeError);
			}
		});

		it('throws RangeError for non-finite components (NaN, ±Infinity)', () => {
			const valid = { v: 1, d: 1 };
			const nonFinite = [
				{ v: NaN, d: 0 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 0 },
				{ v: 0, d: -Infinity },
				{ v: -Infinity, d: Infinity },
			];
			for (const bad of nonFinite) {
				assert.throws(() => addDualMemo(bad, valid), RangeError);
				assert.throws(() => addDualMemo(valid, bad), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for h(x) = f(x) + g(x)', () => {
			// f(x) = sin(x) + x^3, f'(x) = cos(x) + 3x^2
			const f = (x) => Math.sin(x) + x ** 3;
			const df = (x) => Math.cos(x) + 3 * x ** 2;

			// g(x) = exp(0.25x) - 2x^2, g'(x) = 0.25*exp(0.25x) - 4x
			const g = (x) => Math.exp(0.25 * x) - 2 * x ** 2;
			const dg = (x) => 0.25 * Math.exp(0.25 * x) - 4 * x;

			const h = (x) => f(x) + g(x);
			const eps = 1e-6;

			for (const x of [-2.5, -1, 0, 0.75, 2.25]) {
				const res = addDualMemo({ v: f(x), d: df(x) }, { v: g(x), d: dg(x) });
				const numericalDeriv = (h(x + eps) - h(x - eps)) / (2 * eps);

				assert.ok(
					Math.abs(res.v - h(x)) < 1e-12,
					`value mismatch at x=${x}: got ${res.v}, expected ${h(x)}`
				);
				assert.ok(
					Math.abs(res.d - numericalDeriv) < 1e-7,
					`derivative mismatch at x=${x}: got ${res.d}, expected ${numericalDeriv}`
				);
			}
		});

		it('matches 2x2 upper-triangular matrix addition isomorphism and group axioms', () => {
			// Dual number (v, d) is isomorphic to [[v, d], [0, v]]
			const toMatrix = ({ v, d }) => [
				[v, d],
				[0, v],
			];
			const addMatrix = (A, B) => [
				[A[0][0] + B[0][0], A[0][1] + B[0][1]],
				[A[1][0] + B[1][0], A[1][1] + B[1][1]],
			];

			const samples = [
				{ v: -16, d: 16 },
				{ v: -3, d: 7 },
				{ v: 0, d: 0 },
				{ v: 5, d: -11 },
				{ v: 12.5, d: -4.25 },
				{ v: 100, d: -250 },
			];

			for (const a of samples) {
				for (const b of samples) {
					const sum = addDualMemo(a, b);
					const matSum = addMatrix(toMatrix(a), toMatrix(b));

					assert.equal(sum.v, matSum[0][0]);
					assert.equal(sum.d, matSum[0][1]);
					assert.equal(sum.v, matSum[1][1]);
					assert.equal(matSum[1][0], 0);

					// Commutativity: a + b === b + a
					assert.deepStrictEqual(sum, addDualMemo(b, a));

					// Additive inverse: a + (-a) === { v: 0, d: 0 }
					const negA = { v: -a.v, d: -a.d };
					const zeroRes = addDualMemo(a, negA);
					assert.equal(zeroRes.v, 0);
					assert.equal(zeroRes.d, 0);
				}
			}

			// Associativity on exact integer / dyadic samples: (a + b) + c === a + (b + c)
			for (let i = 0; i < samples.length - 2; i += 1) {
				const a = samples[i];
				const b = samples[i + 1];
				const c = samples[i + 2];
				assert.deepStrictEqual(
					addDualMemo(addDualMemo(a, b), c),
					addDualMemo(a, addDualMemo(b, c))
				);
			}
		});
	});
});
