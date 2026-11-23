import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xorMask32Recursive } from "./xorMask32Recursive.js";

/**
 * Independent reference implementation via BigInt bitmask conversion.
 * Converts each Uint32Array into a single arbitrary-precision integer,
 * applies BigInt XOR, and unpacks back into a Uint32Array.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceBigIntXor(a, b) {
	const mask32 = 0xffffffffn;
	let bigA = 0n;
	let bigB = 0n;
	for (let i = a.length - 1; i >= 0; i--) {
		bigA = (bigA << 32n) | BigInt(a[i]);
		bigB = (bigB << 32n) | BigInt(b[i]);
	}
	let bigXor = bigA ^ bigB;
	const out = new Uint32Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = Number(bigXor & mask32);
		bigXor >>= 32n;
	}
	return out;
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= (state << 13) >>> 0;
		state ^= state >>> 17;
		state ^= (state << 5) >>> 0;
		return state >>> 0;
	};
}

describe("xorMask32Recursive", () => {
	it("computes single-word XOR including high-bit unsigned values", () => {
		const a = new Uint32Array([0x80000001]);
		const b = new Uint32Array([0xf0f0f0f0]);
		const res = xorMask32Recursive(a, b);

		assert.ok(res instanceof Uint32Array);
		assert.deepEqual(res, new Uint32Array([0x70f0f0f1]));
	});

	it("computes multi-word XOR for power-of-two and odd lengths", () => {
		const a4 = new Uint32Array([0x00000000, 0xffffffff, 0xaaaaaaaa, 0x12345678]);
		const b4 = new Uint32Array([0xffffffff, 0xffffffff, 0x55555555, 0x87654321]);
		assert.deepEqual(
			xorMask32Recursive(a4, b4),
			new Uint32Array([0xffffffff, 0x00000000, 0xffffffff, 0x95511559]),
		);

		const a5 = new Uint32Array([1, 2, 4, 8, 0xdeadbeef]);
		const b5 = new Uint32Array([3, 6, 4, 0, 0xbeefdead]);
		assert.deepEqual(
			xorMask32Recursive(a5, b5),
			new Uint32Array([2, 4, 0, 8, 0x60426042]),
		);
	});

	it("does not mutate inputs and returns a new Uint32Array instance", () => {
		const a = new Uint32Array([0x11223344, 0x55667788, 0x99aabbcc]);
		const b = new Uint32Array([0xff00ff00, 0x00ff00ff, 0x0f0f0f0f]);
		const aCopy = new Uint32Array(a);
		const bCopy = new Uint32Array(b);

		const res = xorMask32Recursive(a, b);
		assert.notEqual(res, a);
		assert.notEqual(res, b);
		assert.deepEqual(a, aCopy);
		assert.deepEqual(b, bCopy);
	});

	it("works properly on Uint32Array subarrays with non-zero byteOffset", () => {
		const bufA = new Uint32Array([0xaaaaaaaa, 0x12345678, 0x9abcdef0, 0xbbbbbbbb]);
		const bufB = new Uint32Array([0xcccccccc, 0x0f0f0f0f, 0xf0f0f0f0, 0xdddddddd]);
		const subA = bufA.subarray(1, 3);
		const subB = bufB.subarray(1, 3);

		assert.ok(subA.byteOffset > 0);
		assert.deepEqual(
			xorMask32Recursive(subA, subB),
			new Uint32Array([0x1d3b5977, 0x6a4c2e00]),
		);
	});

	it("handles empty Uint32Array inputs", () => {
		const res = xorMask32Recursive(new Uint32Array(0), new Uint32Array(0));
		assert.ok(res instanceof Uint32Array);
		assert.equal(res.length, 0);
	});

	it("satisfies identity, self-cancellation, and complement edge cases", () => {
		const mask = new Uint32Array([0x00000000, 0x00000001, 0x80000000, 0xffffffff, 0x5a5a5a5a]);
		const zeros = new Uint32Array(mask.length);
		const ones = new Uint32Array(mask.length).fill(0xffffffff);

		// Identity: a ^ 0 === a
		assert.deepEqual(xorMask32Recursive(mask, zeros), mask);
		assert.deepEqual(xorMask32Recursive(zeros, mask), mask);

		// Self-cancellation: a ^ a === 0
		assert.deepEqual(xorMask32Recursive(mask, mask), zeros);

		// Complement: a ^ 0xffffffff === (~a >>> 0)
		const expectedComplement = new Uint32Array([
			0xffffffff, 0xfffffffe, 0x7fffffff, 0x00000000, 0xa5a5a5a5,
		]);
		assert.deepEqual(xorMask32Recursive(mask, ones), expectedComplement);
	});

	it("handles large bitmasks without exceeding recursion depth", () => {
		const len = 4097;
		const a = new Uint32Array(len);
		const b = new Uint32Array(len);
		const next = makeRng(0x1337c0de);
		for (let i = 0; i < len; i++) {
			a[i] = next();
			b[i] = next();
		}
		const res = xorMask32Recursive(a, b);
		assert.equal(res.length, len);
		for (let i = 0; i < len; i++) {
			assert.equal(res[i], (a[i] ^ b[i]) >>> 0);
		}
	});

	it("matches independent BigInt bitmask XOR cross-check across sizes", () => {
		const next = makeRng(0xdeadbeef);
		const lengths = [0, 1, 2, 3, 5, 7, 8, 15, 16, 31, 64, 129];

		for (const len of lengths) {
			const a = new Uint32Array(len);
			const b = new Uint32Array(len);
			for (let i = 0; i < len; i++) {
				a[i] = next();
				b[i] = next();
			}
			const actual = xorMask32Recursive(a, b);
			const expected = referenceBigIntXor(a, b);
			assert.deepEqual(actual, expected);
		}
	});

	it("satisfies algebraic properties (commutativity, associativity, involution)", () => {
		const next = makeRng(0xcafebabe);
		const a = new Uint32Array(37);
		const b = new Uint32Array(37);
		const c = new Uint32Array(37);
		for (let i = 0; i < 37; i++) {
			a[i] = next();
			b[i] = next();
			c[i] = next();
		}

		// Commutativity: a ^ b === b ^ a
		assert.deepEqual(xorMask32Recursive(a, b), xorMask32Recursive(b, a));

		// Associativity: (a ^ b) ^ c === a ^ (b ^ c)
		assert.deepEqual(
			xorMask32Recursive(xorMask32Recursive(a, b), c),
			xorMask32Recursive(a, xorMask32Recursive(b, c)),
		);

		// Involution: (a ^ b) ^ b === a
		assert.deepEqual(xorMask32Recursive(xorMask32Recursive(a, b), b), a);
	});

	it("throws TypeError for non-Uint32Array inputs", () => {
		const valid = new Uint32Array([1, 2]);
		const invalidValues = [
			null,
			undefined,
			42,
			"123",
			{},
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new Float32Array([1, 2]),
			new BigUint64Array([1n, 2n]),
		];

		for (const bad of invalidValues) {
			assert.throws(() => xorMask32Recursive(bad, valid), TypeError);
			assert.throws(() => xorMask32Recursive(valid, bad), TypeError);
		}
	});

	it("throws RangeError when bitmask lengths differ", () => {
		assert.throws(
			() => xorMask32Recursive(new Uint32Array([1, 2]), new Uint32Array([1])),
			RangeError,
		);
		assert.throws(
			() => xorMask32Recursive(new Uint32Array(0), new Uint32Array([0])),
			RangeError,
		);
		assert.throws(
			() => xorMask32Recursive(new Uint32Array(3), new Uint32Array(4)),
			RangeError,
		);
	});
});
