import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notMask32Iterative } from './notMask32Iterative.js';

/**
 * Packs a Uint32Array into a single non-negative BigInt (word 0 in least significant bits).
 *
 * @param {Uint32Array} words
 * @returns {bigint}
 */
function packUint32ToBigInt(words) {
	let acc = 0n;
	for (let i = words.length - 1; i >= 0; i -= 1) {
		acc = (acc << 32n) | BigInt(words[i]);
	}
	return acc;
}

/**
 * Unpacks a BigInt into a Uint32Array of the specified word count.
 *
 * @param {bigint} value
 * @param {number} length
 * @returns {Uint32Array}
 */
function unpackBigIntToUint32(value, length) {
	const out = new Uint32Array(length);
	let remaining = value;
	for (let i = 0; i < length; i += 1) {
		out[i] = Number(remaining & 0xffffffffn);
		remaining >>= 32n;
	}
	return out;
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= (state << 13) >>> 0;
		state ^= state >>> 17;
		state ^= (state << 5) >>> 0;
		return state >>> 0;
	};
}

describe('notMask32Iterative', () => {
	it('inverts normal single-word and multi-word bitmasks', () => {
		const single = new Uint32Array([0x12345678]);
		const singleRes = notMask32Iterative(single);
		assert.ok(singleRes instanceof Uint32Array);
		assert.deepStrictEqual(singleRes, new Uint32Array([0xedcba987]));

		const multi = new Uint32Array([0x00000001, 0x55555555, 0xaaaaaaaa, 0xdeadbeef]);
		const multiRes = notMask32Iterative(multi);
		assert.deepStrictEqual(
			multiRes,
			new Uint32Array([0xfffffffe, 0xaaaaaaaa, 0x55555555, 0x21524110]),
		);
	});

	it('handles empty Uint32Array', () => {
		const empty = new Uint32Array(0);
		const res = notMask32Iterative(empty);
		assert.ok(res instanceof Uint32Array);
		assert.strictEqual(res.length, 0);
		assert.notStrictEqual(res, empty);
	});

	it('handles boundary word values (all zeros, all ones, high bit, low bits)', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0x80000000,
			0x7fffffff,
			0x00000001,
			0xfffffffe,
		]);
		const expected = new Uint32Array([
			0xffffffff,
			0x00000000,
			0x7fffffff,
			0x80000000,
			0xfffffffe,
			0x00000001,
		]);
		assert.deepStrictEqual(notMask32Iterative(input), expected);
	});

	it('inverts every single-bit position 0..31 accurately', () => {
		const input = new Uint32Array(32);
		const expected = new Uint32Array(32);
		for (let bit = 0; bit < 32; bit += 1) {
			const word = (1 << bit) >>> 0;
			input[bit] = word;
			expected[bit] = (0xffffffff - word) >>> 0;
		}
		assert.deepStrictEqual(notMask32Iterative(input), expected);
	});

	it('respects subarray views with non-zero byteOffset', () => {
		const backing = new Uint32Array([0x11111111, 0x00000000, 0x80000000, 0xffffffff, 0x22222222]);
		const view = backing.subarray(1, 4);
		const res = notMask32Iterative(view);
		assert.strictEqual(res.length, 3);
		assert.strictEqual(res.byteOffset, 0);
		assert.deepStrictEqual(res, new Uint32Array([0xffffffff, 0x7fffffff, 0x00000000]));
	});

	it('does not mutate input and returns an independent Uint32Array', () => {
		const original = new Uint32Array([0x0f0f0f0f, 0xf0f0f0f0, 0x80000001]);
		const snapshot = new Uint32Array(original);
		const result = notMask32Iterative(original);

		assert.notStrictEqual(result, original);
		assert.notStrictEqual(result.buffer, original.buffer);
		assert.deepStrictEqual(original, snapshot);

		result[0] = 0x12345678;
		assert.deepStrictEqual(original, snapshot);
	});

	it('throws TypeError for invalid inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			true,
			false,
			0,
			42,
			NaN,
			0n,
			'0xffffffff',
			Symbol('mask'),
			{},
			[0, 1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2, 3, 4]),
			new Uint16Array([1, 2]),
			new Float32Array([1.0]),
			new BigUint64Array([1n]),
			new ArrayBuffer(8),
			new DataView(new ArrayBuffer(8)),
			{ [Symbol.toStringTag]: 'Uint32Array', length: 1, 0: 0 },
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => notMask32Iterative(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input: ${String(bad)}`,
			);
		}
	});

	it('throws TypeError for a Uint32Array backed by a detached ArrayBuffer', () => {
		const buffer = new ArrayBuffer(16);
		const mask = new Uint32Array(buffer);
		buffer.transfer();
		assert.strictEqual(mask.buffer.detached, true);
		assert.throws(() => notMask32Iterative(mask), { name: 'TypeError' });
	});

	it('cross-check: satisfies involution, arithmetic sum, and bitwise partition identities', () => {
		const nextWord = createRng(0x20261123);
		for (let len = 0; len <= 64; len += 1) {
			const a = new Uint32Array(len);
			for (let i = 0; i < len; i += 1) {
				a[i] = nextWord();
			}

			const notA = notMask32Iterative(a);
			const notNotA = notMask32Iterative(notA);

			assert.deepStrictEqual(notNotA, a);
			for (let i = 0; i < len; i += 1) {
				assert.strictEqual(a[i] + notA[i], 0xffffffff);
				assert.strictEqual((a[i] & notA[i]) >>> 0, 0);
				assert.strictEqual((a[i] | notA[i]) >>> 0, 0xffffffff);
			}
		}
	});

	it('cross-check: matches BigInt XOR with all-ones mask across varied lengths', () => {
		const nextWord = createRng(0xcafebabe);
		const lengths = [0, 1, 2, 3, 7, 16, 33, 128];

		for (const len of lengths) {
			const a = new Uint32Array(len);
			for (let i = 0; i < len; i += 1) {
				a[i] = nextWord();
			}

			const actual = notMask32Iterative(a);
			const allOnes = (1n << BigInt(len * 32)) - 1n;
			const expectedBigInt = packUint32ToBigInt(a) ^ allOnes;
			const expected = unpackBigIntToUint32(expectedBigInt, len);

			assert.deepStrictEqual(actual, expected);
		}
	});
});
