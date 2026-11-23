import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addIntervalRecursive } from './addIntervalRecursive.js';

// --- Independent exact dyadic rational arithmetic (BigInt) for cross-checks ---

const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);

/**
 * Converts a finite IEEE-754 binary64 number to an exact dyadic rational m * 2^e.
 */
function floatToDyadic(x) {
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected finite float, got ${x}`);
	}
	if (x === 0) {
		return { m: 0n, e: 0 };
	}
	_f64[0] = x;
	const bits = _u64[0];
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const expBits = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);
	if (expBits === 0) {
		return { m: sign * frac, e: -1074 };
	}
	return { m: sign * ((1n << 52n) | frac), e: expBits - 1075 };
}

function addDyadic(a, b) {
	if (a.m === 0n) return b;
	if (b.m === 0n) return a;
	if (a.e <= b.e) {
		return { m: a.m + (b.m << BigInt(b.e - a.e)), e: a.e };
	}
	return { m: (a.m << BigInt(a.e - b.e)) + b.m, e: b.e };
}

function sumDyadic(values) {
	let acc = { m: 0n, e: 0 };
	for (const v of values) {
		acc = addDyadic(acc, floatToDyadic(v));
	}
	return acc;
}

/**
 * Compares dyadic rational `a` against `b`, returning -1, 0, or 1.
 */
function cmpDyadic(a, b) {
	if (a.m === 0n && b.m === 0n) return 0;
	if (a.m === 0n) return b.m > 0n ? -1 : 1;
	if (b.m === 0n) return a.m > 0n ? 1 : -1;
	const minE = Math.min(a.e, b.e);
	const lhs = a.m << BigInt(a.e - minE);
	const rhs = b.m << BigInt(b.e - minE);
	return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/**
 * Compares an IEEE-754 number (possibly ±Infinity) against a dyadic rational.
 */
function cmpFloatToDyadic(x, d) {
	if (x === -Infinity) return -1;
	if (x === Infinity) return 1;
	return cmpDyadic(floatToDyadic(x), d);
}

/**
 * Independent nextUp / nextDown for verifying tightness of binary sums.
 */
function refNextUp(x) {
	if (x === Infinity) return Infinity;
	if (x === -Infinity) return -Number.MAX_VALUE;
	if (x === 0) return Number.MIN_VALUE;
	_f64[0] = x;
	_u64[0] = x > 0 ? _u64[0] + 1n : _u64[0] - 1n;
	return _f64[0];
}

function refNextDown(x) {
	return -refNextUp(-x);
}

/**
 * Deterministic xorshift64* PRNG for reproducible Monte Carlo testing.
 */
function makeRng(seed = 0x9e3779b97f4a7c15n) {
	let state = seed;
	return () => {
		state ^= state >> 12n;
		state ^= (state << 25n) & 0xffffffffffffffffn;
		state ^= state >> 27n;
		const out = (state * 0x2545f4914f6cdd1dn) & 0xffffffffffffffffn;
		return Number(out >> 11n) / 2 ** 53;
	};
}

describe('addIntervalRecursive', () => {
	describe('normal cases', () => {
		it('adds exact integer intervals without spurious widening', () => {
			assert.deepStrictEqual(addIntervalRecursive([1, 2], [3, 4]), [4, 6]);
			assert.deepStrictEqual(addIntervalRecursive([-5, 10], [-2, 3]), [-7, 13]);
			assert.deepStrictEqual(addIntervalRecursive([0, 0], [0, 0]), [0, 0]);
		});

		it('adds exact dyadic fraction intervals without widening', () => {
			assert.deepStrictEqual(addIntervalRecursive([0.5, 1.25], [0.25, 0.75]), [0.75, 2]);
			assert.deepStrictEqual(addIntervalRecursive([-0.125, 0.5], [0.125, 0.5]), [0, 1]);
		});

		it('supports variadic and array call forms equivalently', () => {
			const intervals = [
				[1, 2],
				[3, 4],
				[5, 6],
				[7, 8],
				[9, 10],
			];
			const variadicResult = addIntervalRecursive(...intervals);
			const arrayResult = addIntervalRecursive(intervals);
			assert.deepStrictEqual(variadicResult, [25, 30]);
			assert.deepStrictEqual(arrayResult, variadicResult);
		});

		it('supports single-element interval arrays', () => {
			const input = [-3.5, 7.25];
			const result = addIntervalRecursive([input]);
			assert.deepStrictEqual(result, [-3.5, 7.25]);
			assert.notStrictEqual(result, input);
		});

		it('does not mutate input intervals or arrays', () => {
			const a = [0.1, 0.2];
			const b = [0.3, 0.4];
			const list = [a, b];
			const res = addIntervalRecursive(list);
			assert.deepStrictEqual(a, [0.1, 0.2]);
			assert.deepStrictEqual(b, [0.3, 0.4]);
			assert.deepStrictEqual(list, [a, b]);
			assert.ok(res[0] <= res[1]);
		});
	});

	describe('edge cases and IEEE-754 outward rounding', () => {
		it('encloses inexact float sum 0.1 + 0.2 strictly', () => {
			const [lo, hi] = addIntervalRecursive([0.1, 0.1], [0.2, 0.2]);
			const exact = sumDyadic([0.1, 0.2]);
			assert.ok(cmpFloatToDyadic(lo, exact) <= 0, 'lower bound must be <= exact 0.1 + 0.2');
			assert.ok(cmpFloatToDyadic(hi, exact) >= 0, 'upper bound must be >= exact 0.1 + 0.2');
			assert.ok(lo < hi, 'inexact binary64 sum must produce non-zero width');
			// 0.1 + 0.2 rounds up in RN-even to 0.30000000000000004
			assert.strictEqual(hi, 0.1 + 0.2);
			assert.strictEqual(lo, refNextDown(0.1 + 0.2));
		});

		it('handles zero-width intervals with massive scale mismatch (absorption)', () => {
			// 1 + 2^-54 rounds to 1 in IEEE-754, so outward rounding must enclose (1, nextUp(1)]
			const tiny = 2 ** -54;
			const [lo, hi] = addIntervalRecursive([1, 1], [tiny, tiny]);
			assert.strictEqual(lo, 1);
			assert.strictEqual(hi, 1 + Number.EPSILON);

			// 1 - 2^-54 rounds to 1 in IEEE-754, so outward rounding must enclose [nextDown(1), 1]
			const [lo2, hi2] = addIntervalRecursive([1, 1], [-tiny, -tiny]);
			assert.strictEqual(lo2, refNextDown(1));
			assert.strictEqual(hi2, 1);
		});

		it('handles subnormal numbers accurately', () => {
			const min = Number.MIN_VALUE;
			// Exact subnormal addition
			assert.deepStrictEqual(addIntervalRecursive([min, min], [min, min]), [2 * min, 2 * min]);
			assert.deepStrictEqual(addIntervalRecursive([-min, min], [-min, min]), [-2 * min, 2 * min]);

			// Adding subnormal to normal 1.0
			const [lo, hi] = addIntervalRecursive([1, 1], [min, min]);
			assert.strictEqual(lo, 1);
			assert.strictEqual(hi, refNextUp(1));

			// Subtracting subnormal from normal 1.0
			const [loSub, hiSub] = addIntervalRecursive([1, 1], [-min, -min]);
			assert.strictEqual(loSub, refNextDown(1));
			assert.strictEqual(hiSub, 1);

			// Subnormal cancellation to zero
			assert.deepStrictEqual(addIntervalRecursive([min, min], [-min, -min]), [0, 0]);
		});

		it('handles negative numbers and normalizes -0 to 0', () => {
			const [lo, hi] = addIntervalRecursive([-0, -0], [-0, -0]);
			assert.ok(Object.is(lo, 0));
			assert.ok(Object.is(hi, 0));

			const [lo2, hi2] = addIntervalRecursive([-0.1, -0.1], [-0.2, -0.2]);
			const exact = sumDyadic([-0.1, -0.2]);
			assert.ok(cmpFloatToDyadic(lo2, exact) <= 0);
			assert.ok(cmpFloatToDyadic(hi2, exact) >= 0);
			assert.strictEqual(lo2, -0.1 + -0.2);
			assert.strictEqual(hi2, refNextUp(-0.1 + -0.2));
		});

		it('handles overflow near Number.MAX_VALUE while preserving enclosure', () => {
			const max = Number.MAX_VALUE;
			const [loPos, hiPos] = addIntervalRecursive([max, max], [max, max]);
			assert.strictEqual(loPos, max);
			assert.strictEqual(hiPos, Infinity);
			const exactPos = sumDyadic([max, max]);
			assert.ok(cmpFloatToDyadic(loPos, exactPos) <= 0);
			assert.ok(cmpFloatToDyadic(hiPos, exactPos) >= 0);

			const [loNeg, hiNeg] = addIntervalRecursive([-max, -max], [-max, -max]);
			assert.strictEqual(loNeg, -Infinity);
			assert.strictEqual(hiNeg, -max);
			const exactNeg = sumDyadic([-max, -max]);
			assert.ok(cmpFloatToDyadic(loNeg, exactNeg) <= 0);
			assert.ok(cmpFloatToDyadic(hiNeg, exactNeg) >= 0);

			// Large opposite-sign subtraction near MAX_VALUE (tests FastTwoSum overflow safety)
			const [loOpp, hiOpp] = addIntervalRecursive([-1e292, -1e292], [max, max]);
			const exactOpp = sumDyadic([-1e292, max]);
			assert.ok(cmpFloatToDyadic(loOpp, exactOpp) <= 0);
			assert.ok(cmpFloatToDyadic(hiOpp, exactOpp) >= 0);
			assert.ok(Number.isFinite(loOpp) && Number.isFinite(hiOpp));
		});

		it('handles multi-interval overflow followed by cancellation soundly', () => {
			const max = Number.MAX_VALUE;
			const [lo, hi] = addIntervalRecursive([max, max], [max, max], [-max, -max], [-max, -max]);
			// Exact sum is 0; enclosing interval must contain 0 even if sub-sums overflowed
			assert.ok(lo <= 0 && hi >= 0);
		});
	});

	describe('divide-and-conquer recursive properties', () => {
		it('encloses exact sum across odd, even, prime, and large counts of intervals', () => {
			for (const n of [1, 2, 3, 5, 7, 16, 31, 64, 127, 500]) {
				const intervals = [];
				const los = [];
				const his = [];
				for (let i = 0; i < n; i++) {
					const a = (i + 1) * 0.1 - 0.3 * (i % 7);
					const b = a + (i % 5) * 0.07;
					intervals.push([a, b]);
					los.push(a);
					his.push(b);
				}
				const [resLo, resHi] = addIntervalRecursive(intervals);
				assert.ok(cmpFloatToDyadic(resLo, sumDyadic(los)) <= 0, `n=${n} lower bound`);
				assert.ok(cmpFloatToDyadic(resHi, sumDyadic(his)) >= 0, `n=${n} upper bound`);
			}
		});

		it('achieves tighter enclosure than naive left-to-right folding on disparate scales', () => {
			// Summing [1e15, 1e15] followed by 1024 copies of [0.1, 0.1]
			const intervals = [[1e15, 1e15]];
			for (let i = 0; i < 1024; i++) {
				intervals.push([0.1, 0.1]);
			}

			const [dcLo, dcHi] = addIntervalRecursive(intervals);
			const exact = sumDyadic(intervals.map((iv) => iv[0]));
			assert.ok(cmpFloatToDyadic(dcLo, exact) <= 0);
			assert.ok(cmpFloatToDyadic(dcHi, exact) >= 0);

			// Naive left-to-right fold accumulates ~1024 ULPs at 1e15 scale
			let fold = intervals[0];
			for (let i = 1; i < intervals.length; i++) {
				fold = addIntervalRecursive(fold, intervals[i]);
			}
			const dcWidth = dcHi - dcLo;
			const foldWidth = fold[1] - fold[0];
			assert.ok(
				dcWidth < foldWidth / 100,
				`expected divide-and-conquer width (${dcWidth}) << fold width (${foldWidth})`
			);
		});
	});

	describe('input validation', () => {
		it('rejects missing or empty inputs', () => {
			assert.throws(() => addIntervalRecursive(), RangeError);
			assert.throws(() => addIntervalRecursive([]), RangeError);
		});

		it('rejects non-array inputs and single non-nested interval', () => {
			assert.throws(() => addIntervalRecursive(1), TypeError);
			assert.throws(() => addIntervalRecursive(null), TypeError);
			assert.throws(() => addIntervalRecursive([1, 2]), TypeError);
			assert.throws(() => addIntervalRecursive([1, 2], 'bad'), TypeError);
			assert.throws(() => addIntervalRecursive({ lo: 1, hi: 2 }, [3, 4]), TypeError);
		});

		it('rejects intervals with wrong tuple length', () => {
			assert.throws(() => addIntervalRecursive([1], [2, 3]), RangeError);
			assert.throws(() => addIntervalRecursive([1, 2, 3], [4, 5]), RangeError);
			assert.throws(() => addIntervalRecursive([[1, 2], []]), RangeError);
		});

		it('rejects non-number, NaN, and non-finite endpoints', () => {
			assert.throws(() => addIntervalRecursive(['1', 2], [3, 4]), TypeError);
			assert.throws(() => addIntervalRecursive([1, undefined], [3, 4]), TypeError);
			assert.throws(() => addIntervalRecursive([NaN, 1], [0, 1]), RangeError);
			assert.throws(() => addIntervalRecursive([0, NaN], [0, 1]), RangeError);
			assert.throws(() => addIntervalRecursive([-Infinity, 1], [0, 1]), RangeError);
			assert.throws(() => addIntervalRecursive([0, Infinity], [0, 1]), RangeError);
		});

		it('rejects inverted intervals where lo > hi', () => {
			assert.throws(() => addIntervalRecursive([2, 1], [0, 1]), RangeError);
			assert.throws(() => addIntervalRecursive([0, 1], [0.2, 0.1]), RangeError);
			assert.throws(() => addIntervalRecursive([[0, 1], [-1, -2]]), RangeError);
		});
	});

	describe('independent cross-checks (BigInt exact dyadic + Monte Carlo sampling)', () => {
		it('satisfies exact enclosure AND optimality (tightness) for 500 random pairs', () => {
			const rand = makeRng(0x123456789abcdef0n);
			const scales = [1e-310, 1e-100, 1e-16, 1, 1e16, 1e100, 1e307];

			for (let trial = 0; trial < 500; trial++) {
				const s1 = scales[trial % scales.length];
				const s2 = scales[(trial * 3 + 1) % scales.length];
				const x1 = (rand() * 2 - 1) * s1;
				const x2 = (rand() * 2 - 1) * s1;
				const y1 = (rand() * 2 - 1) * s2;
				const y2 = (rand() * 2 - 1) * s2;
				const a = x1 <= x2 ? [x1, x2] : [x2, x1];
				const b = y1 <= y2 ? [y1, y2] : [y2, y1];

				const [lo, hi] = addIntervalRecursive(a, b);
				const exactLo = sumDyadic([a[0], b[0]]);
				const exactHi = sumDyadic([a[1], b[1]]);

				// 1. Strict enclosure
				assert.ok(cmpFloatToDyadic(lo, exactLo) <= 0, `trial ${trial}: lo > exactLo`);
				assert.ok(cmpFloatToDyadic(hi, exactHi) >= 0, `trial ${trial}: hi < exactHi`);

				// 2. Optimal tightness: nextUp(lo) > exactLo and nextDown(hi) < exactHi
				if (Number.isFinite(lo)) {
					assert.ok(
						cmpFloatToDyadic(refNextUp(lo), exactLo) > 0,
						`trial ${trial}: lo is not tightest downward bound`
					);
				}
				if (Number.isFinite(hi)) {
					assert.ok(
						cmpFloatToDyadic(refNextDown(hi), exactHi) < 0,
						`trial ${trial}: hi is not tightest upward bound`
					);
				}
			}
		});

		it('encloses all Monte Carlo & endpoint samples across multi-interval sums', () => {
			const rand = makeRng(0xfedcba9876543210n);

			for (let trial = 0; trial < 100; trial++) {
				const count = 2 + (trial % 15);
				const intervals = [];
				for (let i = 0; i < count; i++) {
					const exp = Math.floor((rand() * 2 - 1) * 40);
					const base = (rand() * 2 - 1) * 2 ** exp;
					const width = rand() * 2 ** (exp - Math.floor(rand() * 10));
					const lo = base;
					const hi = base + width;
					intervals.push(lo <= hi ? [lo, hi] : [hi, lo]);
				}

				const [resLo, resHi] = addIntervalRecursive(intervals);

				// Verify endpoint combinations (all lo, all hi, alternating)
				const allLo = intervals.map((iv) => iv[0]);
				const allHi = intervals.map((iv) => iv[1]);
				const alt = intervals.map((iv, idx) => iv[idx & 1]);
				for (const sample of [allLo, allHi, alt]) {
					const exactSum = sumDyadic(sample);
					assert.ok(cmpFloatToDyadic(resLo, exactSum) <= 0);
					assert.ok(cmpFloatToDyadic(resHi, exactSum) >= 0);
				}

				// Verify 25 random interior point samples per trial
				for (let s = 0; s < 25; s++) {
					const pts = intervals.map(([a, b]) => {
						const t = rand();
						const p = a + t * (b - a);
						// Clamp against rounding outside [a, b] during sampling
						return Math.min(b, Math.max(a, p));
					});
					const exactSum = sumDyadic(pts);
					assert.ok(
						cmpFloatToDyadic(resLo, exactSum) <= 0 && cmpFloatToDyadic(resHi, exactSum) >= 0,
						`trial ${trial} sample ${s} escaped enclosure`
					);
				}
			}
		});
	});
});
