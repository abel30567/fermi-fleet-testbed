import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectionMask32Lazy } from './intersectionMask32Lazy.js';

/**
 * Independent reference helper: converts a Uint32 word sequence into a Set of
 * active bit indices (bit `b` of word `w` maps to `w * 32 + b`).
 */
function maskToBitSet(words) {
	const set = new Set();
	for (let w = 0; w < words.length; w++) {
		const word = words[w] >>> 0;
		for (let b = 0; b < 32; b++) {
			if (((word >>> b) & 1) === 1) {
				set.add(w * 32 + b);
			}
		}
	}
	return set;
}

/**
 * Independent reference helper: packs Uint32 words into a single non-negative BigInt.
 */
function wordsToBigInt(words) {
	let result = 0n;
	for (let i = words.length - 1; i >= 0; i--) {
		result = (result << 32n) | BigInt(words[i] >>> 0);
	}
	return result;
}

/**
 * Deterministic xorshift32 PRNG for reproducible property/cross-check tests.
 */
function makePrng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
}

test('intersects two Uint32Array bitmasks including MSB (bit 31)', () => {
	const a = new Uint32Array([0b10101010, 0x80000000, 0xffffffff, 0xdeadbeef]);
	const b = new Uint32Array([0b11001100, 0x80000001, 0xffffffff, 0xcafebabe]);

	const out = Uint32Array.from(intersectionMask32Lazy(a, b));
	assert.deepEqual(
		out,
		new Uint32Array([0b10001000, 0x80000000, 0xffffffff, 0xcaacbaae]),
	);
	assert.equal(out[1], 2147483648);
	assert.equal(out[2], 4294967295);
});

test('intersects three or more masks of mixed iterable types', () => {
	function* genMask() {
		yield 0xff00ff0f;
		yield 0x8000ffff;
		yield 0x12345678;
	}

	const a = new Uint32Array([0x0fff0fff, 0xffff00ff, 0xffffffff]);
	const b = [0x0f0f0f0f, 0x800000ff, 0x0f0f0f0f];
	const c = genMask();

	const result = [...intersectionMask32Lazy(a, b, c)];
	assert.deepEqual(result, [0x0f000f0f, 0x800000ff, 0x02040608]);
});

test('supports single mask input and normalizes -0 to +0', () => {
	const result = [...intersectionMask32Lazy([-0, 0x80000000, 42])];
	assert.deepEqual(result, [0, 0x80000000, 42]);
	assert.ok(Object.is(result[0], 0));
});

test('handles empty masks and unequal mask lengths', () => {
	assert.deepEqual(
		[...intersectionMask32Lazy(new Uint32Array(0), new Uint32Array([1, 2]))],
		[],
	);
	assert.deepEqual([...intersectionMask32Lazy(new Uint32Array(0))], []);
	assert.deepEqual([...intersectionMask32Lazy([], [0xffffffff])], []);

	const shortMask = new Uint32Array([0xf0f0f0f0, 0x00ff00ff]);
	const longMask = new Uint32Array([0x0ff00ff0, 0xffffffff, 0x12345678, 0x9abcdef0]);
	assert.deepEqual(
		[...intersectionMask32Lazy(shortMask, longMask)],
		[0x00f000f0, 0x00ff00ff],
	);
	assert.deepEqual(
		[...intersectionMask32Lazy(longMask, shortMask)],
		[0x00f000f0, 0x00ff00ff],
	);
});

test('works with Uint32Array subarray views', () => {
	const backing = new Uint32Array([0x11111111, 0xf0f0f0f0, 0x80000001, 0x22222222]);
	const viewA = backing.subarray(1, 3);
	const viewB = new Uint32Array([0x0f0ff0f0, 0x80000000]);

	assert.deepEqual(
		[...intersectionMask32Lazy(viewA, viewB)],
		[0x0000f0f0, 0x80000000],
	);
});

test('consumes iterables strictly lazily and closes iterators on early break', () => {
	let pulledA = 0;
	let pulledB = 0;
	let closedA = false;
	let closedB = false;

	function* sourceA() {
		try {
			const words = [0xffffffff, 0x0f0f0f0f, 0x80000000, 0x12345678];
			for (const w of words) {
				pulledA++;
				yield w;
			}
		} finally {
			closedA = true;
		}
	}

	function* sourceB() {
		try {
			const words = [0x00ff00ff, 0xf0f0f0f0, 0xffffffff, 0x87654321];
			for (const w of words) {
				pulledB++;
				yield w;
			}
		} finally {
			closedB = true;
		}
	}

	const gen = intersectionMask32Lazy(sourceA(), sourceB());
	// Nothing pulled before first .next()
	assert.equal(pulledA, 0);
	assert.equal(pulledB, 0);

	assert.deepEqual(gen.next(), { value: 0x00ff00ff, done: false });
	assert.equal(pulledA, 1);
	assert.equal(pulledB, 1);

	assert.deepEqual(gen.next(), { value: 0x00000000, done: false });
	assert.equal(pulledA, 2);
	assert.equal(pulledB, 2);
	assert.equal(closedA, false);
	assert.equal(closedB, false);

	// Early termination closes underlying iterators without pulling remaining words
	gen.return();
	assert.equal(pulledA, 2);
	assert.equal(pulledB, 2);
	assert.equal(closedA, true);
	assert.equal(closedB, true);
});

test('handles infinite generators intersected with finite masks and cleans up', () => {
	let infiniteClosed1 = false;
	function* onesForever1() {
		try {
			while (true) {
				yield 0xffffffff;
			}
		} finally {
			infiniteClosed1 = true;
		}
	}

	const finite = new Uint32Array([0x12345678, 0x9abcdef0]);
	assert.deepEqual(
		[...intersectionMask32Lazy(finite, onesForever1())],
		[0x12345678, 0x9abcdef0],
	);
	assert.equal(infiniteClosed1, true);

	let infiniteClosed2 = false;
	function* onesForever2() {
		try {
			while (true) {
				yield 0xf0f0f0f0;
			}
		} finally {
			infiniteClosed2 = true;
		}
	}

	assert.deepEqual(
		[...intersectionMask32Lazy(onesForever2(), finite)],
		[0x10305070, 0x90b0d0f0],
	);
	assert.equal(infiniteClosed2, true);
});

test('algebraic identities: commutativity, associativity, idempotence, zero and all-ones', () => {
	const a = new Uint32Array([0xa5a5a5a5, 0x80000001, 0x00ff00ff]);
	const b = new Uint32Array([0x5a5a5a5a, 0xffffffff, 0x0f0f0f0f]);
	const c = new Uint32Array([0xffff0000, 0x80000000, 0x000ffff0]);
	const zeros = new Uint32Array([0, 0, 0]);
	const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);

	// Commutativity
	assert.deepEqual(
		[...intersectionMask32Lazy(a, b)],
		[...intersectionMask32Lazy(b, a)],
	);
	// Associativity
	assert.deepEqual(
		[...intersectionMask32Lazy(intersectionMask32Lazy(a, b), c)],
		[...intersectionMask32Lazy(a, intersectionMask32Lazy(b, c))],
	);
	// Idempotence
	assert.deepEqual([...intersectionMask32Lazy(a, a)], [...a]);
	// Zero annihilation and all-ones identity
	assert.deepEqual([...intersectionMask32Lazy(a, zeros)], [0, 0, 0]);
	assert.deepEqual([...intersectionMask32Lazy(a, ones)], [...a]);
});

test('validates arguments eagerly and validates iterated words lazily', () => {
	assert.throws(() => intersectionMask32Lazy(), RangeError);
	assert.throws(() => intersectionMask32Lazy(null), TypeError);
	assert.throws(() => intersectionMask32Lazy(undefined), TypeError);
	assert.throws(() => intersectionMask32Lazy(123), TypeError);
	assert.throws(() => intersectionMask32Lazy({}), TypeError);
	assert.throws(() => intersectionMask32Lazy('0101'), TypeError);
	assert.throws(
		() => intersectionMask32Lazy(new Uint32Array([1]), 'bad'),
		TypeError,
	);

	// Invalid iterator object
	const badIterable = { [Symbol.iterator]: () => ({}) };
	assert.throws(() => [...intersectionMask32Lazy(badIterable)], TypeError);

	// Invalid word types
	for (const badWord of [NaN, Infinity, -Infinity, 1.5, '1', null, undefined, 1n]) {
		assert.throws(
			() => [...intersectionMask32Lazy([0xff, badWord], [0xff, 0xff])],
			TypeError,
		);
	}

	// Out-of-range integer words
	for (const outOfRange of [-1, -42, 0x100000000, Number.MAX_SAFE_INTEGER]) {
		assert.throws(
			() => [...intersectionMask32Lazy([outOfRange], [0xff])],
			RangeError,
		);
	}

	// Closes sibling iterators when a validation error occurs
	let siblingClosed = false;
	function* sibling() {
		try {
			yield 0xff;
			yield 0xff;
		} finally {
			siblingClosed = true;
		}
	}
	assert.throws(() => [...intersectionMask32Lazy(sibling(), [-1])], RangeError);
	assert.equal(siblingClosed, true);
});

test('independent cross-check against Set bit-index intersection and BigInt bitwise AND', () => {
	const rand = makePrng(0x20261123);

	for (let trial = 0; trial < 40; trial++) {
		const numMasks = 2 + (trial % 4); // 2, 3, 4, or 5 masks
		const masks = [];

		for (let m = 0; m < numMasks; m++) {
			const len = rand() % 8; // 0 to 7 words (0 to 224 bits)
			const arr = new Uint32Array(len);
			for (let i = 0; i < len; i++) {
				arr[i] = rand();
			}
			masks.push(arr);
		}

		// Mix Uint32Array and lazy generator representations
		const inputs = masks.map((arr, idx) =>
			idx % 2 === 0
				? arr
				: (function* () {
						for (let i = 0; i < arr.length; i++) {
							yield arr[i];
						}
					})(),
		);

		const actualWords = Uint32Array.from(intersectionMask32Lazy(...inputs));

		// Cross-check 1: Independent Set<number> intersection of bit positions
		const bitSets = masks.map(maskToBitSet);
		const expectedSet = new Set();
		for (const bit of bitSets[0]) {
			if (bitSets.every((s) => s.has(bit))) {
				expectedSet.add(bit);
			}
		}
		const actualSet = maskToBitSet(actualWords);
		assert.deepEqual(actualSet, expectedSet);

		// Cross-check 2: Independent BigInt bitwise AND across all masks
		let expectedBigInt = wordsToBigInt(masks[0]);
		for (let m = 1; m < masks.length; m++) {
			expectedBigInt &= wordsToBigInt(masks[m]);
		}
		assert.equal(wordsToBigInt(actualWords), expectedBigInt);

		// Length matches shortest input sequence
		const minLen = Math.min(...masks.map((m) => m.length));
		assert.equal(actualWords.length, minLen);
	}
});
