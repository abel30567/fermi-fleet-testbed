import test from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetRecursive } from './xorBitsetRecursive.js';

/**
 * Deterministic PRNG for generating arbitrary-width BigInt bitsets.
 */
function createBitsetGenerator(seed = 0x123456789abcdef0n) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;
	function next64() {
		state = (state * 6364136223846793005n + 1442695040888963407n) & mask64;
		return state;
	}
	return function nextBits(bitCount) {
		if (bitCount <= 0) return 0n;
		let result = 0n;
		let remaining = bitCount;
		while (remaining > 0) {
			const take = remaining > 64 ? 64 : remaining;
			const chunk = next64() & ((1n << BigInt(take)) - 1n);
			result = (result << BigInt(take)) | chunk;
			remaining -= take;
		}
		return result;
	};
}

/**
 * Converts a non-negative BigInt bitset to a Set of active bit indices.
 */
function toIndexSet(bits) {
	const set = new Set();
	let n = bits;
	let idx = 0;
	while (n > 0n) {
		if ((n & 1n) === 1n) {
			set.add(idx);
		}
		n >>= 1n;
		idx += 1;
	}
	return set;
}

/**
 * Converts a Set of non-negative bit indices to a BigInt bitset.
 */
function fromIndexSet(set) {
	let result = 0n;
	for (const idx of set) {
		result |= 1n << BigInt(idx);
	}
	return result;
}

test('basic small bitset XOR cases', () => {
	assert.equal(xorBitsetRecursive(0b1010n, 0b1100n), 0b0110n);
	assert.equal(xorBitsetRecursive(0b1111n, 0b0000n), 0b1111n);
	assert.equal(xorBitsetRecursive(0b0101n, 0b1010n), 0b1111n);
	assert.equal(xorBitsetRecursive(1n, 1n), 0n);
	assert.equal(xorBitsetRecursive(1n, 0n), 1n);
	assert.equal(xorBitsetRecursive(0xff00n, 0x0ff0n), 0xf0f0n);
});

test('zero identity and self-XOR edge cases', () => {
	const samples = [
		0n,
		1n,
		0xffffffffn,
		(1n << 64n) - 1n,
		(1n << 512n) + (1n << 257n) + 42n,
		(1n << 2048n) - 1n,
	];

	for (const x of samples) {
		assert.equal(xorBitsetRecursive(x, 0n), x);
		assert.equal(xorBitsetRecursive(0n, x), x);
		assert.equal(xorBitsetRecursive(x, x), 0n);
	}
	assert.equal(xorBitsetRecursive(0n, 0n), 0n);
});

test('algebraic properties: commutativity, associativity, involution', () => {
	const a = (1n << 300n) | 0xdeadbeefcafebabe123456789abcdef0n;
	const b = (1n << 300n) | (1n << 145n) | 0x0f0f0f0f0f0f0f0fn;
	const c = (1n << 600n) | (1n << 31n) | 0xfeedface9876543210n;

	assert.equal(xorBitsetRecursive(a, b), xorBitsetRecursive(b, a));
	assert.equal(
		xorBitsetRecursive(xorBitsetRecursive(a, b), c),
		xorBitsetRecursive(a, xorBitsetRecursive(b, c)),
	);
	assert.equal(xorBitsetRecursive(xorBitsetRecursive(a, b), b), a);
});

test('chunk boundary widths (31, 32, 33, 63, 64, 65, 127, 128, 129 bits)', () => {
	const nextBits = createBitsetGenerator(0x9988776655443322n);
	const boundaryWidths = [1, 2, 31, 32, 33, 63, 64, 65, 95, 96, 97, 127, 128, 129];

	for (const w of boundaryWidths) {
		const allOnes = (1n << BigInt(w)) - 1n;
		const highBit = 1n << BigInt(w - 1);
		const randA = nextBits(w);
		const randB = nextBits(w);

		assert.equal(xorBitsetRecursive(allOnes, highBit), allOnes ^ highBit);
		assert.equal(xorBitsetRecursive(randA, randB), randA ^ randB);
		assert.equal(xorBitsetRecursive(allOnes, allOnes), 0n);
	}
});

test('very wide (>512-bit) and asymmetric-width bitsets', () => {
	const a513 = (1n << 512n) | (1n << 256n) | (1n << 17n) | 1n;
	const b513 = (1n << 512n) | (1n << 400n) | (1n << 17n) | 0xabcdefn;
	assert.equal(xorBitsetRecursive(a513, b513), a513 ^ b513);

	const wide4096A = ((1n << 4096n) - 1n) / 3n; // alternating 0101...
	const wide4096B = ((1n << 4096n) - 1n) / 5n; // repeating 0011...
	assert.equal(xorBitsetRecursive(wide4096A, wide4096B), wide4096A ^ wide4096B);
	assert.equal(xorBitsetRecursive(wide4096A, wide4096A), 0n);

	// Sparse very wide bitset (10,000+ bits) XOR small bitset
	const sparse = (1n << 10000n) | (1n << 5000n) | 0b10101n;
	const small = 0b11111n;
	assert.equal(xorBitsetRecursive(sparse, small), sparse ^ small);
	assert.equal(xorBitsetRecursive(small, sparse), small ^ sparse);
});

test('custom baseBits recursion thresholds match native XOR', () => {
	const nextBits = createBitsetGenerator(0xabcdef0123456789n);
	const a = nextBits(777);
	const b = nextBits(777);
	const expected = a ^ b;

	for (const baseBits of [1, 2, 7, 16, 31, 32, 64, 128]) {
		assert.equal(xorBitsetRecursive(a, b, baseBits), expected);
	}
});

test('independent cross-check against native bitwise ^ across random widths', () => {
	const nextBits = createBitsetGenerator(0x55aa55aa11223344n);
	const widths = [0, 1, 5, 16, 32, 33, 64, 100, 256, 512, 513, 1024, 1500, 2049];

	for (const wA of widths) {
		for (const wB of [wA, Math.max(0, wA - 37), wA + 65]) {
			const a = nextBits(wA);
			const b = nextBits(wB);
			assert.equal(xorBitsetRecursive(a, b), a ^ b);
		}
	}
});

test('independent cross-check against set-theoretic symmetric difference', () => {
	const setA = new Set([0, 1, 5, 31, 32, 33, 64, 127, 255, 513, 700]);
	const setB = new Set([1, 2, 31, 33, 63, 64, 200, 513, 800]);

	const expectedSet = new Set();
	for (const x of setA) {
		if (!setB.has(x)) expectedSet.add(x);
	}
	for (const x of setB) {
		if (!setA.has(x)) expectedSet.add(x);
	}

	const actual = xorBitsetRecursive(fromIndexSet(setA), fromIndexSet(setB));
	assert.deepEqual(toIndexSet(actual), expectedSet);
});

test('invalid inputs throw TypeError or RangeError', () => {
	// Non-BigInt operands
	assert.throws(() => xorBitsetRecursive(1, 2n), TypeError);
	assert.throws(() => xorBitsetRecursive(1n, 2), TypeError);
	assert.throws(() => xorBitsetRecursive('1', 2n), TypeError);
	assert.throws(() => xorBitsetRecursive(null, 0n), TypeError);
	assert.throws(() => xorBitsetRecursive(0n, undefined), TypeError);
	assert.throws(() => xorBitsetRecursive(true, 1n), TypeError);
	assert.throws(() => xorBitsetRecursive({}, 0n), TypeError);
	assert.throws(() => xorBitsetRecursive(NaN, 0n), TypeError);

	// Negative BigInt bitsets
	assert.throws(() => xorBitsetRecursive(-1n, 0n), RangeError);
	assert.throws(() => xorBitsetRecursive(0n, -1n), RangeError);
	assert.throws(() => xorBitsetRecursive(-42n, -7n), RangeError);

	// Invalid baseBits
	assert.throws(() => xorBitsetRecursive(1n, 2n, '32'), TypeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, 32n), TypeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, 0), RangeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, -16), RangeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, 1.5), RangeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, NaN), RangeError);
	assert.throws(() => xorBitsetRecursive(1n, 2n, Infinity), RangeError);
});
