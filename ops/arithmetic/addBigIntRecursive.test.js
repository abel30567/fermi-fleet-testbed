import test from 'node:test';
import assert from 'node:assert/strict';
import { addBigIntRecursive } from './addBigIntRecursive.js';

/**
 * Independent base-10 string digit-by-digit adder for cross-checking without
 * relying on JavaScript's BigInt `+` operator.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function independentDecimalAdd(a, b) {
	const negA = a < 0n;
	const negB = b < 0n;
	const strA = (negA ? -a : a).toString(10);
	const strB = (negB ? -b : b).toString(10);

	const cmpMag = (x, y) => {
		if (x.length !== y.length) return x.length - y.length;
		return x < y ? -1 : x > y ? 1 : 0;
	};

	const addStrings = (x, y) => {
		let i = x.length - 1;
		let j = y.length - 1;
		let carry = 0;
		const digits = [];
		while (i >= 0 || j >= 0 || carry > 0) {
			const dx = i >= 0 ? x.charCodeAt(i--) - 48 : 0;
			const dy = j >= 0 ? y.charCodeAt(j--) - 48 : 0;
			const sum = dx + dy + carry;
			digits.push(String(sum % 10));
			carry = Math.floor(sum / 10);
		}
		return digits.reverse().join('');
	};

	const subStrings = (x, y) => {
		// Assumes magnitude x >= y
		let i = x.length - 1;
		let j = y.length - 1;
		let borrow = 0;
		const digits = [];
		while (i >= 0) {
			let diff = x.charCodeAt(i--) - 48 - borrow - (j >= 0 ? y.charCodeAt(j--) - 48 : 0);
			if (diff < 0) {
				diff += 10;
				borrow = 1;
			} else {
				borrow = 0;
			}
			digits.push(String(diff));
		}
		const raw = digits.reverse().join('').replace(/^0+/, '');
		return raw === '' ? '0' : raw;
	};

	if (negA === negB) {
		const mag = addStrings(strA, strB);
		return BigInt(negA && mag !== '0' ? `-${mag}` : mag);
	}

	const cmp = cmpMag(strA, strB);
	if (cmp === 0) return 0n;
	if (cmp > 0) {
		const mag = subStrings(strA, strB);
		return BigInt(negA ? `-${mag}` : mag);
	}
	const mag = subStrings(strB, strA);
	return BigInt(negB ? `-${mag}` : mag);
}

test('normal cases: small positive and negative BigInts', () => {
	assert.equal(addBigIntRecursive(2n, 3n), 5n);
	assert.equal(addBigIntRecursive(-2n, -3n), -5n);
	assert.equal(addBigIntRecursive(10n, -4n), 6n);
	assert.equal(addBigIntRecursive(-10n, 4n), -6n);
	assert.equal(addBigIntRecursive(4n, -10n), -6n);
	assert.equal(addBigIntRecursive(-4n, 10n), 6n);
});

test('fixed-point BigInts scaled by 10^18', () => {
	const SCALE = 10n ** 18n;
	const onePointFive = 15n * (SCALE / 10n);
	const twoPointTwentyFive = 225n * (SCALE / 100n);
	const threePointSeventyFive = 375n * (SCALE / 100n);

	assert.equal(addBigIntRecursive(onePointFive, twoPointTwentyFive), threePointSeventyFive);
	assert.equal(addBigIntRecursive(onePointFive, -twoPointTwentyFive), -(75n * (SCALE / 100n)));
	assert.equal(addBigIntRecursive(-onePointFive, -twoPointTwentyFive), -threePointSeventyFive);
});

test('edge cases: zeros, identity, and exact cancellation', () => {
	assert.equal(addBigIntRecursive(0n, 0n), 0n);
	assert.equal(addBigIntRecursive(0n, 42n), 42n);
	assert.equal(addBigIntRecursive(42n, 0n), 42n);
	assert.equal(addBigIntRecursive(0n, -42n), -42n);
	assert.equal(addBigIntRecursive(-42n, 0n), -42n);
	assert.equal(addBigIntRecursive(123456789012345678901234567890n, -123456789012345678901234567890n), 0n);
	assert.equal(addBigIntRecursive(-123456789012345678901234567890n, 123456789012345678901234567890n), 0n);
});

test('edge cases: power-of-two boundaries and deep carry/borrow chains', () => {
	for (const exp of [16n, 31n, 32n, 33n, 63n, 64n, 65n, 128n, 256n, 512n, 1024n]) {
		const pow = 1n << exp;
		const allOnes = pow - 1n;

		// Full carry cascade: (2^k - 1) + 1 = 2^k
		assert.equal(addBigIntRecursive(allOnes, 1n), pow);
		assert.equal(addBigIntRecursive(1n, allOnes), pow);

		// Full borrow cascade: 2^k + (-1) = 2^k - 1
		assert.equal(addBigIntRecursive(pow, -1n), allOnes);
		assert.equal(addBigIntRecursive(-1n, pow), allOnes);

		// Negative full carry cascade: -(2^k - 1) + (-1) = -2^k
		assert.equal(addBigIntRecursive(-allOnes, -1n), -pow);

		// Negative full borrow cascade: -2^k + 1 = -(2^k - 1)
		assert.equal(addBigIntRecursive(-pow, 1n), -allOnes);
	}
});

test('large multi-thousand-bit BigInts', () => {
	const a = (1n << 4096n) - 12345678901234567890123456789n;
	const b = (1n << 4095n) + 98765432109876543210987654321n;

	assert.equal(addBigIntRecursive(a, b), a + b);
	assert.equal(addBigIntRecursive(a, -b), a - b);
	assert.equal(addBigIntRecursive(-a, b), -a + b);
	assert.equal(addBigIntRecursive(-a, -b), -a - b);
});

test('invalid inputs throw TypeError', () => {
	const invalidValues = [0, 1, -1, 1.5, NaN, Infinity, -Infinity, '1', '1n', true, false, null, undefined, {}, [], Symbol('x')];

	for (const bad of invalidValues) {
		assert.throws(() => addBigIntRecursive(bad, 1n), TypeError);
		assert.throws(() => addBigIntRecursive(1n, bad), TypeError);
		assert.throws(() => addBigIntRecursive(bad, bad), TypeError);
	}

	assert.throws(() => addBigIntRecursive(), TypeError);
	assert.throws(() => addBigIntRecursive(1n), TypeError);
});

test('independent cross-check: decimal string arithmetic, native BigInt +, and algebraic laws', () => {
	// Deterministic LCG for reproducible pseudo-random multi-limb BigInts
	let seed = 0x123456789abcdef1n;
	const nextBits = (bitCount) => {
		let value = 0n;
		let remaining = bitCount;
		while (remaining > 0) {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			const take = remaining >= 64 ? 64 : remaining;
			value = (value << BigInt(take)) | (seed >> BigInt(64 - take));
			remaining -= take;
		}
		return value;
	};

	const bitWidths = [1, 8, 31, 32, 33, 64, 97, 128, 255, 513];

	for (let i = 0; i < 60; i++) {
		const wA = bitWidths[i % bitWidths.length];
		const wB = bitWidths[(i * 3 + 1) % bitWidths.length];
		const wC = bitWidths[(i * 5 + 2) % bitWidths.length];

		let a = nextBits(wA);
		let b = nextBits(wB);
		let c = nextBits(wC);

		if ((i & 1) !== 0) a = -a;
		if ((i & 2) !== 0) b = -b;
		if ((i & 4) !== 0) c = -c;

		const result = addBigIntRecursive(a, b);

		// Cross-check against independent base-10 string adder
		assert.equal(result, independentDecimalAdd(a, b));

		// Cross-check against native BigInt addition
		assert.equal(result, a + b);

		// Algebraic laws: commutativity, associativity, inverse
		assert.equal(result, addBigIntRecursive(b, a));
		assert.equal(
			addBigIntRecursive(addBigIntRecursive(a, b), c),
			addBigIntRecursive(a, addBigIntRecursive(b, c)),
		);
		assert.equal(addBigIntRecursive(result, -b), a);
	}
});
