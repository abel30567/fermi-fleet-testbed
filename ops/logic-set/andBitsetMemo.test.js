import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andBitsetMemo } from './andBitsetMemo.js';

/**
 * Independent reference implementation via explicit set-of-bit-indices conversion.
 * Converts each BigInt bitset to a JS Set of set bit positions, computes set
 * intersection, and reconstructs the resulting BigInt bitset.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bitsetToIndexSet(n) {
	const indices = new Set();
	let v = n;
	let pos = 0n;
	while (v > 0n) {
		if (v % 2n === 1n) {
			indices.add(pos);
		}
		v /= 2n;
		pos += 1n;
	}
	return indices;
}

function referenceSetIntersection(a, b) {
	const setA = bitsetToIndexSet(a);
	const setB = bitsetToIndexSet(b);
	let out = 0n;
	for (const bit of setA) {
		if (setB.has(bit)) {
			out += 1n << bit;
		}
	}
	return out;
}

/**
 * Deterministic PRNG (xorshift64*) for reproducible arbitrary-width bitset tests.
 */
function createRng(seed) {
	let state = BigInt.asUintN(64, seed);
	return () => {
		state ^= state >> 12n;
		state ^= BigInt.asUintN(64, state << 25n);
		state ^= state >> 27n;
		return BigInt.asUintN(64, state * 0x2545f4914f6cdd1dn);
	};
}

function randomBitset(rng, wordCount) {
	let acc = 0n;
	for (let i = 0; i < wordCount; i++) {
		acc = (acc << 64n) | rng();
	}
	return acc;
}

describe('andBitsetMemo', () => {
	it('computes basic small bitset intersections', () => {
		assert.equal(andBitsetMemo(0b1101n, 0b1011n), 0b1001n);
		assert.equal(andBitsetMemo(0xffn, 0x0fn), 0x0fn);
		assert.equal(andBitsetMemo(0x1234n, 0x5678n), 0x1230n);
		assert.equal(andBitsetMemo(0xabcde1n, 0x7f3n), 0x5e1n);
	});

	it('handles zero, identity, and disjoint edge cases', () => {
		assert.equal(andBitsetMemo(0n, 0n), 0n);
		assert.equal(andBitsetMemo(0n, 0xdeadbeefcafebaben), 0n);
		assert.equal(andBitsetMemo(0xdeadbeefcafebaben, 0n), 0n);
		assert.equal(andBitsetMemo(1n, 1n), 1n);

		const selfVal = (1n << 300n) | (1n << 127n) | 0x5a5an;
		assert.equal(andBitsetMemo(selfVal, selfVal), selfVal);

		// Completely disjoint bitsets (alternating bit masks)
		const evenBits = BigInt(`0x${'55'.repeat(64)}`);
		const oddBits = BigInt(`0x${'aa'.repeat(64)}`);
		assert.equal(andBitsetMemo(evenBits, oddBits), 0n);
	});

	it('handles mismatched bit widths and odd/even hex lengths', () => {
		const narrow = 0x5n; // 1 hex digit (odd)
		const wide = (1n << 1024n) | 0xf00dn; // 257 hex digits (odd)
		assert.equal(andBitsetMemo(narrow, wide), 0x5n);
		assert.equal(andBitsetMemo(wide, narrow), 0x5n);

		const evenLen = 0xabcd1234n; // 8 hex digits
		const oddLen = 0xf0e1d2c3b4a59n; // 13 hex digits
		assert.equal(andBitsetMemo(evenLen, oddLen), evenLen & oddLen);
		assert.equal(andBitsetMemo(oddLen, evenLen), evenLen & oddLen);
	});

	it('handles arbitrary-width bitsets well beyond 64 bits and beyond memo size threshold', () => {
		const a = (1n << 2048n) | (0x123456789abcdef0n << 512n) | 0xff00ffn;
		const b = (1n << 2048n) | (0x0fedcba987654321n << 512n) | 0x00ffffn;
		assert.equal(andBitsetMemo(a, b), a & b);

		// Exceed MAX_MEMO_HEX_LEN (4096 hex digits = 16,384 bits)
		const hugeA = BigInt(`0x${'a5f0'.repeat(1200)}`);
		const hugeB = BigInt(`0x${'5af3'.repeat(1200)}`);
		assert.equal(andBitsetMemo(hugeA, hugeB), hugeA & hugeB);
	});

	it('satisfies algebraic laws and memoization consistency (commutativity, idempotence, associativity)', () => {
		const a = 0x9e3779b97f4a7c15f39cc0605cedc834n;
		const b = 0x1082276bf3a27251f86c6a11d0c18e95n;
		const c = 0x243f6a8885a308d313198a2e03707344n;

		// Commutativity + repeated calls hitting the memo cache in both orders
		const ab1 = andBitsetMemo(a, b);
		const ba1 = andBitsetMemo(b, a);
		const ab2 = andBitsetMemo(a, b);
		assert.equal(ab1, ba1);
		assert.equal(ab1, ab2);
		assert.equal(ab1, a & b);

		// Idempotence
		assert.equal(andBitsetMemo(a, a), a);

		// Associativity
		assert.equal(
			andBitsetMemo(andBitsetMemo(a, b), c),
			andBitsetMemo(a, andBitsetMemo(b, c)),
		);
	});

	it('remains exact under memo cache eviction pressure', () => {
		// Exceed MAX_MEMO_ENTRIES (4096) to exercise LRU eviction path
		for (let i = 1n; i <= 4200n; i++) {
			const a = (i << 16n) | 0xaa55n;
			const b = (i << 8n) | 0x55aan;
			assert.equal(andBitsetMemo(a, b), a & b);
		}
		// Re-query an evicted pair
		assert.equal(andBitsetMemo(0x1aa55n, 0x155aan), 0x1aa55n & 0x155aan);
	});

	it('cross-checks against independent bit-index Set intersection and native BigInt &', () => {
		const rng = createRng(0x123456789abcdef1n);

		// Independent set-of-indices cross-check across 0..512-bit operands
		for (let trial = 0; trial < 40; trial++) {
			const wordsA = (trial % 8) + 1;
			const wordsB = ((trial * 3) % 8) + 1;
			const a = randomBitset(rng, wordsA) >> BigInt(trial % 7);
			const b = randomBitset(rng, wordsB) >> BigInt((trial * 5) % 7);

			const actual = andBitsetMemo(a, b);
			const expectedBySet = referenceSetIntersection(a, b);
			const expectedByNative = a & b;

			assert.equal(actual, expectedBySet);
			assert.equal(actual, expectedByNative);
		}
	});

	it('rejects invalid types and negative BigInts', () => {
		for (const bad of [0, 1, 42, NaN, '0', '1n', null, undefined, true, {}, []]) {
			assert.throws(() => andBitsetMemo(bad, 1n), TypeError);
			assert.throws(() => andBitsetMemo(1n, bad), TypeError);
		}
		assert.throws(() => andBitsetMemo(-1n, 1n), RangeError);
		assert.throws(() => andBitsetMemo(1n, -1n), RangeError);
		assert.throws(() => andBitsetMemo(-(1n << 256n), 0xffn), RangeError);
		assert.throws(() => andBitsetMemo(-5n, -3n), RangeError);
	});
});
