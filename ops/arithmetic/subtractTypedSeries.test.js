import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { subtractTypedSeries } from "./subtractTypedSeries.js";

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

/**
 * Converts a finite IEEE-754 double into an exact dyadic rational
 * `mantissa * 2^exponent` using DataView bit extraction.
 *
 * @param {number} value
 * @returns {{ mantissa: bigint, exponent: number }}
 */
function doubleToExactDyadic(value) {
	if (value === 0) {
		return { mantissa: 0n, exponent: 0 };
	}
	const buf = new ArrayBuffer(8);
	const view = new DataView(buf);
	view.setFloat64(0, value, false);
	const bits = view.getBigUint64(0, false);
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const rawFrac = bits & ((1n << 52n) - 1n);

	if (rawExp === 0) {
		// Subnormal: (-1)^sign * rawFrac * 2^(-1074)
		return { mantissa: sign * rawFrac, exponent: -1074 };
	}
	// Normal: (-1)^sign * (2^52 + rawFrac) * 2^(rawExp - 1023 - 52)
	return {
		mantissa: sign * ((1n << 52n) + rawFrac),
		exponent: rawExp - 1075,
	};
}

/**
 * Exact BigInt dyadic difference `a - b - c - ...`, rounded to nearest Number.
 * Serves as an independent oracle for floating-point subtraction.
 *
 * @param {...number} values
 * @returns {number}
 */
function exactSubtractOracle(...values) {
	const terms = values.map(doubleToExactDyadic);
	let minExp = terms[0].exponent;
	for (let i = 1; i < terms.length; i++) {
		if (terms[i].exponent < minExp) {
			minExp = terms[i].exponent;
		}
	}

	let acc = terms[0].mantissa << BigInt(terms[0].exponent - minExp);
	for (let i = 1; i < terms.length; i++) {
		acc -= terms[i].mantissa << BigInt(terms[i].exponent - minExp);
	}

	return Number(acc) * Math.pow(2, minExp);
}

describe("subtractTypedSeries", () => {
	describe("normal cases", () => {
		it("subtracts two Float64Array series element-wise", () => {
			const a = new Float64Array([10, 20.5, -3.25, 0, 100.75]);
			const b = new Float64Array([4, 0.5, -5.25, 7, 100.75]);
			const out = subtractTypedSeries(a, b);

			assert.ok(out instanceof Float64Array);
			assert.notEqual(out, a);
			assert.notEqual(out, b);
			assert.deepEqual(out, new Float64Array([6, 20, 2, -7, 0]));
		});

		it("subtracts three or more Float64Array series in sequence", () => {
			const a = new Float64Array([100, 50, -10, 1.5]);
			const b = new Float64Array([20, 10, 5, 0.25]);
			const c = new Float64Array([30, 15, -20, 0.5]);
			const d = new Float64Array([5, 5, 2, 0.75]);

			const out = subtractTypedSeries(a, b, c, d);
			assert.deepEqual(out, new Float64Array([45, 20, 3, 0]));
		});

		it("does not mutate any input Float64Array", () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5, 6]);
			const c = new Float64Array([7, 8, 9]);

			subtractTypedSeries(a, b, c);
			assert.deepEqual(a, new Float64Array([1, 2, 3]));
			assert.deepEqual(b, new Float64Array([4, 5, 6]));
			assert.deepEqual(c, new Float64Array([7, 8, 9]));
		});

		it("mitigates catastrophic cancellation across multiple series via TwoDiff compensation", () => {
			// Naive left-to-right: (1e16 - (-1)) - 1e16 === 0
			// Compensated TwoDiff preserves the exact +1 residual.
			const a = new Float64Array([1e16, 1e16, 1, -1e16]);
			const b = new Float64Array([-1, -1, 1e16, 3]);
			const c = new Float64Array([1e16, -2, -1e16, -1e16]);
			const d = new Float64Array([0, 1e16, 0, 0]);

			const out = subtractTypedSeries(a, b, c, d);
			assert.deepEqual(out, new Float64Array([1, 3, 1, -3]));
		});

		it("handles Float64Array subarray views with non-zero byteOffset", () => {
			const backing = new Float64Array([999, 10, 20, 30, 888, 1, 2, 3, 777]);
			const a = backing.subarray(1, 4);
			const b = backing.subarray(5, 8);

			const out = subtractTypedSeries(a, b);
			assert.deepEqual(out, new Float64Array([9, 18, 27]));
		});
	});

	describe("edge cases", () => {
		it("handles empty Float64Arrays", () => {
			const out2 = subtractTypedSeries(new Float64Array(0), new Float64Array(0));
			assert.ok(out2 instanceof Float64Array);
			assert.equal(out2.length, 0);

			const out3 = subtractTypedSeries(
				new Float64Array(0),
				new Float64Array(0),
				new Float64Array(0),
			);
			assert.equal(out3.length, 0);
		});

		it("handles single-element Float64Arrays and aliased inputs", () => {
			const a = new Float64Array([42.125]);
			const out = subtractTypedSeries(a, a);
			assert.deepEqual(out, new Float64Array([0]));
			assert.deepEqual(a, new Float64Array([42.125]));
		});

		it("preserves IEEE-754 signed zeros", () => {
			const a = new Float64Array([-0, +0, +0, -0]);
			const b = new Float64Array([+0, -0, +0, -0]);
			const out = subtractTypedSeries(a, b);

			assert.equal(Object.is(out[0], -0), true);
			assert.equal(Object.is(out[1], +0), true);
			assert.equal(Object.is(out[2], +0), true);
			assert.equal(Object.is(out[3], +0), true);
		});

		it("handles Infinity, -Infinity, NaN, and overflow cleanly", () => {
			const a = new Float64Array([
				Infinity,
				-Infinity,
				Infinity,
				1,
				NaN,
				Number.MAX_VALUE,
			]);
			const b = new Float64Array([
				1,
				1,
				Infinity,
				Infinity,
				5,
				-Number.MAX_VALUE,
			]);
			const out = subtractTypedSeries(a, b);

			assert.equal(out[0], Infinity);
			assert.equal(out[1], -Infinity);
			assert.ok(Number.isNaN(out[2]));
			assert.equal(out[3], -Infinity);
			assert.ok(Number.isNaN(out[4]));
			assert.equal(out[5], Infinity);
		});

		it("handles non-finite values in 3+ series without corrupting finite lanes", () => {
			const a = new Float64Array([1e16, 1e16, 1e16, 5]);
			const b = new Float64Array([-1, -1, -1, 2]);
			const c = new Float64Array([1e16, Infinity, NaN, 1]);
			const out = subtractTypedSeries(a, b, c);

			assert.equal(out[0], 1);
			assert.equal(out[1], -Infinity);
			assert.ok(Number.isNaN(out[2]));
			assert.equal(out[3], 2);
		});

		it("handles subnormal numbers accurately", () => {
			const minSub = Number.MIN_VALUE;
			const a = new Float64Array([3 * minSub, minSub, -minSub]);
			const b = new Float64Array([minSub, minSub, minSub]);
			const out = subtractTypedSeries(a, b);

			assert.deepEqual(out, new Float64Array([2 * minSub, 0, -2 * minSub]));
		});
	});

	describe("invalid inputs", () => {
		it("throws TypeError when required arguments are missing", () => {
			assert.throws(() => subtractTypedSeries(), TypeError);
			assert.throws(
				() => subtractTypedSeries(new Float64Array([1, 2])),
				TypeError,
			);
		});

		it("throws TypeError for non-Float64Array inputs", () => {
			const valid = new Float64Array([1, 2, 3]);
			const invalidValues = [
				null,
				undefined,
				42,
				"123",
				{},
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new Uint8Array([1, 2, 3]),
				new ArrayBuffer(24),
			];

			for (const bad of invalidValues) {
				assert.throws(() => subtractTypedSeries(bad, valid), TypeError);
				assert.throws(() => subtractTypedSeries(valid, bad), TypeError);
				assert.throws(() => subtractTypedSeries(valid, valid, bad), TypeError);
			}
		});

		it("throws RangeError on mismatched lengths", () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([1, 2]);
			const c = new Float64Array([1, 2, 3, 4]);

			assert.throws(() => subtractTypedSeries(a, b), RangeError);
			assert.throws(() => subtractTypedSeries(b, a), RangeError);
			assert.throws(() => subtractTypedSeries(a, a, c), RangeError);
		});

		it("throws TypeError for detached ArrayBuffer views", () => {
			const buf = new ArrayBuffer(16);
			const detachedView = new Float64Array(buf);
			const valid = new Float64Array([1, 2]);

			if (typeof buf.transfer === "function") {
				buf.transfer();
				assert.throws(() => subtractTypedSeries(detachedView, valid), TypeError);
				assert.throws(() => subtractTypedSeries(valid, detachedView), TypeError);
			}
		});
	});

	describe("independent cross-checks", () => {
		it("matches exact BigInt dyadic-rational subtraction oracle across random series", () => {
			const rand = makePrng(0x5eed1234);
			const n = 256;
			const a = new Float64Array(n);
			const b = new Float64Array(n);
			const c = new Float64Array(n);

			for (let i = 0; i < n; i++) {
				// Use integer-scaled dyadic values across mixed scales to stress cancellation
				const scale = 2 ** Math.floor(rand() * 30 - 15);
				a[i] = Math.floor((rand() - 0.5) * 2048) * scale;
				b[i] = Math.floor((rand() - 0.5) * 2048) * scale;
				c[i] = Math.floor((rand() - 0.5) * 2048) * scale;
			}

			const diff2 = subtractTypedSeries(a, b);
			const diff3 = subtractTypedSeries(a, b, c);

			for (let i = 0; i < n; i++) {
				assert.equal(diff2[i], exactSubtractOracle(a[i], b[i]));
				assert.equal(diff3[i], exactSubtractOracle(a[i], b[i], c[i]));
			}
		});

		it("satisfies algebraic identities: antisymmetry, zero identity, scaling, and telescoping", () => {
			const rand = makePrng(0xabcdef01);
			const n = 128;
			const a = new Float64Array(n);
			const b = new Float64Array(n);
			const zeros = new Float64Array(n);

			for (let i = 0; i < n; i++) {
				a[i] = (rand() - 0.5) * 1e6;
				b[i] = (rand() - 0.5) * 1e6;
			}

			// Antisymmetry: (a - b) === -(b - a)
			const ab = subtractTypedSeries(a, b);
			const ba = subtractTypedSeries(b, a);
			for (let i = 0; i < n; i++) {
				assert.equal(ab[i], -ba[i]);
			}

			// Zero identity: a - 0 === a, 0 - a === -a
			assert.deepEqual(subtractTypedSeries(a, zeros), a);
			const negA = subtractTypedSeries(zeros, a);
			for (let i = 0; i < n; i++) {
				assert.equal(negA[i], -a[i]);
			}

			// Exact power-of-two scaling linearity: (8a - 8b) === 8(a - b)
			const a8 = a.map((x) => x * 8);
			const b8 = b.map((x) => x * 8);
			const ab8 = subtractTypedSeries(a8, b8);
			for (let i = 0; i < n; i++) {
				assert.equal(ab8[i], ab[i] * 8);
			}

			// Telescoping series identity: sum_{i=0}^{n-2} (x[i+1] - x[i]) === x[n-1] - x[0]
			const seq = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				seq[i] = i * i - 3 * i + 7; // exact integers in Float64
			}
			const deltas = subtractTypedSeries(seq.subarray(1), seq.subarray(0, n - 1));
			let telescopeSum = 0;
			for (let i = 0; i < deltas.length; i++) {
				telescopeSum += deltas[i];
			}
			assert.equal(telescopeSum, seq[n - 1] - seq[0]);
		});
	});
});
