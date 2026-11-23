import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { andMask32Memo } from "./andMask32Memo.js";

/**
 * Independent reference #1: direct native bitwise AND over Uint32Array words.
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceNativeAnd(a, b) {
	const out = new Uint32Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = (a[i] & b[i]) >>> 0;
	}
	return out;
}

/**
 * Independent reference #2: explicit set intersection via bit-index Set objects
 * (uses only arithmetic powers of two, no bitwise AND operator).
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceSetIntersection(a, b) {
	const toBitSet = (arr) => {
		const bits = new Set();
		for (let w = 0; w < arr.length; w++) {
			let rem = arr[w];
			for (let bit = 0; bit < 32; bit++) {
				if (rem % 2 === 1) {
					bits.add(w * 32 + bit);
				}
				rem = Math.floor(rem / 2);
			}
		}
		return bits;
	};

	const setA = toBitSet(a);
	const setB = toBitSet(b);
	const out = new Uint32Array(a.length);
	for (const bitIdx of setA) {
		if (setB.has(bitIdx)) {
			const w = Math.floor(bitIdx / 32);
			const bit = bitIdx % 32;
			out[w] += 2 ** bit;
		}
	}
	return out;
}

/**
 * Deterministic PRNG (xorshift32) for reproducible fuzz cross-checks.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
}

describe("andMask32Memo", () => {
	describe("normal cases", () => {
		it("computes bitwise AND on single-word and multi-word masks", () => {
			const a = new Uint32Array([0xffffffff, 0xaaaaaaaa, 0xf0f0f0f0, 0x80000001]);
			const b = new Uint32Array([0x12345678, 0x55555555, 0x0ff00ff0, 0x80000000]);
			const res = andMask32Memo(a, b);

			assert.ok(res instanceof Uint32Array);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(res, new Uint32Array([0x12345678, 0x00000000, 0x00f000f0, 0x80000000]));
		});

		it("satisfies Boolean algebra laws (commutativity, associativity, idempotence, identity, absorption)", () => {
			const a = new Uint32Array([0xdeadbeef, 0x01234567, 0x80000000]);
			const b = new Uint32Array([0xcafebabe, 0x89abcdef, 0x7fffffff]);
			const c = new Uint32Array([0x0f0f0f0f, 0xff00ff00, 0xffffffff]);
			const allOnes = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);
			const allZeros = new Uint32Array([0, 0, 0]);

			// Commutativity
			assert.deepEqual(andMask32Memo(a, b), andMask32Memo(b, a));
			// Associativity
			assert.deepEqual(
				andMask32Memo(andMask32Memo(a, b), c),
				andMask32Memo(a, andMask32Memo(b, c))
			);
			// Idempotence
			assert.deepEqual(andMask32Memo(a, a), a);
			// Identity
			assert.deepEqual(andMask32Memo(a, allOnes), a);
			// Absorption
			assert.deepEqual(andMask32Memo(a, allZeros), allZeros);
		});

		it("does not mutate input arrays when out is omitted or distinct", () => {
			const a = new Uint32Array([0xff00ff00, 0x13579bdf]);
			const b = new Uint32Array([0x0f0f0f0f, 0x2468ace0]);
			const aSnap = new Uint32Array(a);
			const bSnap = new Uint32Array(b);

			andMask32Memo(a, b);
			const out = new Uint32Array(2);
			andMask32Memo(a, b, out);

			assert.deepEqual(a, aSnap);
			assert.deepEqual(b, bSnap);
		});

		it("returns consistent results across repeated and reversed memoized word pairs", () => {
			const a = new Uint32Array([0xabcdef01, 0x12345678, 0xabcdef01, 0x12345678]);
			const b = new Uint32Array([0x12345678, 0xabcdef01, 0x12345678, 0xabcdef01]);

			const first = andMask32Memo(a, b);
			const second = andMask32Memo(a, b);
			const swapped = andMask32Memo(b, a);
			const expected = referenceNativeAnd(a, b);

			assert.deepEqual(first, expected);
			assert.deepEqual(second, expected);
			assert.deepEqual(swapped, expected);
		});
	});

	describe("edge cases", () => {
		it("handles empty Uint32Array masks", () => {
			const emptyA = new Uint32Array(0);
			const emptyB = new Uint32Array(0);
			const res = andMask32Memo(emptyA, emptyB);

			assert.ok(res instanceof Uint32Array);
			assert.equal(res.length, 0);

			const out = new Uint32Array(0);
			const resOut = andMask32Memo(emptyA, emptyB, out);
			assert.equal(resOut, out);
		});

		it("handles high-bit and boundary unsigned 32-bit values accurately", () => {
			const boundary = new Uint32Array([
				0x00000000,
				0x00000001,
				0x7fffffff,
				0x80000000,
				0x80000001,
				0xfffffffe,
				0xffffffff,
			]);
			for (let i = 0; i < boundary.length; i++) {
				for (let j = 0; j < boundary.length; j++) {
					const a = new Uint32Array([boundary[i]]);
					const b = new Uint32Array([boundary[j]]);
					assert.deepEqual(andMask32Memo(a, b), referenceNativeAnd(a, b));
				}
			}
		});

		it("supports pre-allocated output and in-place aliasing (out === a, out === b, a === b === out)", () => {
			const a = new Uint32Array([0xf0f0f0f0, 0x8000ffff]);
			const b = new Uint32Array([0x0ff00ff0, 0xffff0001]);
			const expected = referenceNativeAnd(a, b);

			const out = new Uint32Array(2);
			assert.equal(andMask32Memo(a, b, out), out);
			assert.deepEqual(out, expected);

			const aCopy = new Uint32Array(a);
			assert.equal(andMask32Memo(aCopy, b, aCopy), aCopy);
			assert.deepEqual(aCopy, expected);

			const bCopy = new Uint32Array(b);
			assert.equal(andMask32Memo(a, bCopy, bCopy), bCopy);
			assert.deepEqual(bCopy, expected);

			const self = new Uint32Array([0x87654321, 0xffffffff]);
			const selfExpected = new Uint32Array(self);
			assert.equal(andMask32Memo(self, self, self), self);
			assert.deepEqual(self, selfExpected);
		});

		it("handles subarray views with non-zero byteOffset and overlapping shifted buffers", () => {
			const buf = new ArrayBuffer(6 * 4);
			const full = new Uint32Array(buf);
			full.set([0xffffffff, 0xaaaaaaaa, 0x55555555, 0x0f0f0f0f, 0xf0f0f0f0, 0x80000001]);

			const viewA = full.subarray(0, 4);
			const viewB = full.subarray(2, 6);
			const expected = referenceNativeAnd(new Uint32Array(viewA), new Uint32Array(viewB));

			// Distinct allocation
			assert.deepEqual(andMask32Memo(viewA, viewB), expected);

			// Overlapping shifted output (out overlaps both viewA and viewB at different offsets)
			const viewOut = full.subarray(1, 5);
			const returned = andMask32Memo(viewA, viewB, viewOut);
			assert.equal(returned, viewOut);
			assert.deepEqual(viewOut, expected);
		});
	});

	describe("input validation", () => {
		it("throws TypeError when 'a' is not a Uint32Array", () => {
			const valid = new Uint32Array([1, 2]);
			const invalidInputs = [
				null,
				undefined,
				[1, 2],
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				new Uint16Array([1, 2]),
				new BigUint64Array([1n, 2n]),
				42,
				"mask",
				{},
			];
			for (const bad of invalidInputs) {
				assert.throws(() => andMask32Memo(bad, valid), TypeError);
			}
		});

		it("throws TypeError when 'b' is not a Uint32Array", () => {
			const valid = new Uint32Array([1, 2]);
			const invalidInputs = [
				null,
				undefined,
				[1, 2],
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				{},
			];
			for (const bad of invalidInputs) {
				assert.throws(() => andMask32Memo(valid, bad), TypeError);
			}
		});

		it("throws RangeError when 'a' and 'b' have different lengths", () => {
			assert.throws(
				() => andMask32Memo(new Uint32Array(2), new Uint32Array(3)),
				RangeError
			);
			assert.throws(
				() => andMask32Memo(new Uint32Array(0), new Uint32Array(1)),
				RangeError
			);
		});

		it("validates optional 'out' parameter type and length", () => {
			const a = new Uint32Array([1, 2]);
			const b = new Uint32Array([3, 4]);

			assert.throws(() => andMask32Memo(a, b, null), TypeError);
			assert.throws(() => andMask32Memo(a, b, [0, 0]), TypeError);
			assert.throws(() => andMask32Memo(a, b, new Int32Array(2)), TypeError);
			assert.throws(() => andMask32Memo(a, b, new Uint32Array(1)), RangeError);
			assert.throws(() => andMask32Memo(a, b, new Uint32Array(3)), RangeError);
		});
	});

	describe("independent cross-checks", () => {
		it("matches explicit Set-based bit intersection across random multi-word masks", () => {
			const rng = makeRng(0x12345678);
			for (let trial = 0; trial < 25; trial++) {
				const len = 1 + (trial % 8);
				const a = new Uint32Array(len);
				const b = new Uint32Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = rng();
					b[i] = rng();
				}
				const actual = andMask32Memo(a, b);
				const expected = referenceSetIntersection(a, b);
				assert.deepEqual(actual, expected);
			}
		});

		it("matches native bitwise AND over large masks that trigger memo cache evictions and hits", () => {
			const rng = makeRng(0x9e3779b9);
			const len = 10000;
			const a = new Uint32Array(len);
			const b = new Uint32Array(len);

			// Mix unique words (exceeding the 4096-entry cache) with repeated hot words
			for (let i = 0; i < len; i++) {
				if (i % 5 === 0) {
					a[i] = 0xdeadbeef;
					b[i] = 0xcafebabe;
				} else if (i % 7 === 0) {
					a[i] = 0xcafebabe;
					b[i] = 0xdeadbeef;
				} else {
					a[i] = rng();
					b[i] = rng();
				}
			}

			const actual = andMask32Memo(a, b);
			const expected = referenceNativeAnd(a, b);
			assert.deepEqual(actual, expected);
		});
	});
});
