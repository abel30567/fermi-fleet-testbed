import assert from 'node:assert/strict';
import test from 'node:test';
import { notBitsetMemo } from './notBitsetMemo.js';

/**
 * Independent bit-by-bit reference implementation of fixed-width bitset NOT.
 * @param {bigint} bitset
 * @param {number} width
 * @returns {bigint}
 */
function referenceBitByBitNot(bitset, width) {
	let result = 0n;
	for (let i = 0; i < width; i++) {
		const shift = BigInt(i);
		if (((bitset >> shift) & 1n) === 0n) {
			result |= 1n << shift;
		}
	}
	return result;
}

/**
 * Deterministic xorshift64* PRNG for reproducible arbitrary-width test vectors.
 * @param {bigint} seed
 */
function makePrng(seed) {
	let state = seed & 0xffff_ffff_ffff_ffffn;
	return function next64() {
		state ^= state >> 12n;
		state ^= (state << 25n) & 0xffff_ffff_ffff_ffffn;
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & 0xffff_ffff_ffff_ffffn;
	};
}

/**
 * Generates a deterministic random BigInt with up to `bits` bits.
 * @param {() => bigint} next64
 * @param {number} bits
 * @returns {bigint}
 */
function randomBigInt(next64, bits) {
	let val = 0n;
	let remaining = bits;
	while (remaining > 0) {
		const chunk = Math.min(64, remaining);
		const word = next64() & ((1n << BigInt(chunk)) - 1n);
		val = (val << BigInt(chunk)) | word;
		remaining -= chunk;
	}
	return val;
}

test('normal cases: small and standard widths', () => {
	assert.equal(notBitsetMemo(0b0000n, 4), 0b1111n);
	assert.equal(notBitsetMemo(0b1111n, 4), 0b0000n);
	assert.equal(notBitsetMemo(0b1010n, 4), 0b0101n);
	assert.equal(notBitsetMemo(0x00n, 8), 0xffn);
	assert.equal(notBitsetMemo(0xffn, 8), 0x00n);
	assert.equal(notBitsetMemo(0xaan, 8), 0x55n);
	assert.equal(notBitsetMemo(0xabcn, 12), 0x543n);
	assert.equal(notBitsetMemo(0x1234n, 16), 0xedcbn);
	assert.equal(notBitsetMemo(0xdeadbeefn, 32), 0x21524110n);
	assert.equal(notBitsetMemo(0x0123_4567_89ab_cdefn, 64), 0xfedc_ba98_7654_3210n);
});

test('normal cases: non-byte-aligned and arbitrary large widths', () => {
	assert.equal(notBitsetMemo(0b10_1100_0101n, 10), 0b01_0011_1010n);

	for (const width of [9, 10, 11, 12, 13, 14, 15, 16, 65, 127, 128, 129, 255, 256, 513, 1024, 4097, 8192]) {
		const allOnes = (1n << BigInt(width)) - 1n;
		assert.equal(notBitsetMemo(0n, width), allOnes, `NOT(0) for width ${width}`);
		assert.equal(notBitsetMemo(allOnes, width), 0n, `NOT(allOnes) for width ${width}`);
		assert.equal(notBitsetMemo(1n, width), allOnes ^ 1n, `NOT(1) for width ${width}`);
		const msb = 1n << BigInt(width - 1);
		assert.equal(notBitsetMemo(msb, width), allOnes ^ msb, `NOT(msb) for width ${width}`);
	}
});

test('edge cases: zero width, single-bit width, and high bits above width', () => {
	assert.equal(notBitsetMemo(0n, 0), 0n);
	assert.equal(notBitsetMemo(12345n, 0), 0n);

	assert.equal(notBitsetMemo(0n, 1), 1n);
	assert.equal(notBitsetMemo(1n, 1), 0n);
	assert.equal(notBitsetMemo(0b1110n, 1), 1n);
	assert.equal(notBitsetMemo(0b1111n, 1), 0n);

	// Bits above `width` are masked off
	assert.equal(notBitsetMemo(0xff_ffffn, 10), 0n);
	assert.equal(notBitsetMemo(0x10_0000n, 10), 0x3ffn);
	assert.equal(notBitsetMemo(0x1_00abn, 16), 0xff54n);
	assert.equal(notBitsetMemo(0x00abn, 16), 0xff54n);
});

test('algebraic laws: involution, complement, and De Morgan', () => {
	const next64 = makePrng(0x9e37_79b9_7f4a_7c15n);

	for (const width of [1, 7, 8, 13, 32, 64, 130, 512]) {
		const mask = (1n << BigInt(width)) - 1n;
		const a = randomBigInt(next64, width);
		const b = randomBigInt(next64, width);

		// Involution: NOT(NOT(a)) === a
		assert.equal(notBitsetMemo(notBitsetMemo(a, width), width), a);

		// Complement: a | NOT(a) === mask, a & NOT(a) === 0
		const notA = notBitsetMemo(a, width);
		assert.equal(a | notA, mask);
		assert.equal(a & notA, 0n);

		// De Morgan's laws
		const notB = notBitsetMemo(b, width);
		assert.equal(notBitsetMemo(a | b, width), notA & notB);
		assert.equal(notBitsetMemo(a & b, width), notA | notB);
	}
});

test('memoization consistency and bounded cache eviction', () => {
	const width = 64;
	const sample = 0xfeed_face_cafe_baben;
	const expected = BigInt.asUintN(width, ~sample);

	// Repeated hits return consistent results
	for (let i = 0; i < 10; i++) {
		assert.equal(notBitsetMemo(sample, width), expected);
	}

	// Fill past MAX_CACHE_SIZE (4096) to exercise eviction and recomputation
	for (let i = 0; i < 4200; i++) {
		const v = BigInt(i) * 0x10001n;
		assert.equal(notBitsetMemo(v, 32), BigInt.asUintN(32, ~v));
	}

	// Previously evicted entry still computes accurately
	assert.equal(notBitsetMemo(sample, width), expected);
});

test('input validation throws TypeError / RangeError on invalid arguments', () => {
	for (const badBitset of [0, 1, '0', null, undefined, {}, [], true]) {
		assert.throws(() => notBitsetMemo(badBitset, 8), TypeError);
	}

	for (const negBitset of [-1n, -255n, -(1n << 128n)]) {
		assert.throws(() => notBitsetMemo(negBitset, 8), RangeError);
	}

	for (const badWidth of [8n, '8', null, undefined, {}, [], true]) {
		assert.throws(() => notBitsetMemo(0n, badWidth), TypeError);
	}

	for (const invalidWidth of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => notBitsetMemo(0n, invalidWidth), RangeError);
	}
});

test('independent cross-check against BigInt.asUintN and bit-by-bit reference', () => {
	// Exhaustive cross-check for widths 0..8 and all 8-bit values 0..255
	for (let width = 0; width <= 8; width++) {
		for (let v = 0; v < 256; v++) {
			const b = BigInt(v);
			const actual = notBitsetMemo(b, width);
			const expectedUintN = BigInt.asUintN(width, ~b);
			const expectedRef = referenceBitByBitNot(b, width);
			assert.equal(actual, expectedUintN, `asUintN mismatch for v=${v}, width=${width}`);
			assert.equal(actual, expectedRef, `bit-by-bit mismatch for v=${v}, width=${width}`);
		}
	}

	// Deterministic pseudo-random cross-check across arbitrary widths up to 1031 bits
	const next64 = makePrng(0x1234_5678_9abc_def1n);
	const widths = [9, 15, 16, 17, 23, 24, 31, 32, 33, 63, 64, 65, 100, 257, 512, 1031];
	for (const width of widths) {
		for (let trial = 0; trial < 5; trial++) {
			// Include inputs both within width and wider than width
			const inputBits = trial === 4 ? width + 19 : width;
			const input = randomBigInt(next64, inputBits);
			const actual = notBitsetMemo(input, width);
			const expectedUintN = BigInt.asUintN(width, ~input);
			const expectedRef = referenceBitByBitNot(input, width);
			assert.equal(actual, expectedUintN, `asUintN mismatch for width=${width}, trial=${trial}`);
			assert.equal(actual, expectedRef, `bit-by-bit mismatch for width=${width}, trial=${trial}`);
		}
	}
});
