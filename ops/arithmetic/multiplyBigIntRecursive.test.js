import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyBigIntRecursive } from './multiplyBigIntRecursive.js';

/**
 * Independent shift-and-add (Russian peasant) BigInt multiplication
 * used as an oracle that does not use the `*` operator or Karatsuba.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function russianPeasantMultiply(a, b) {
	if (a === 0n || b === 0n) return 0n;
	const negative = (a < 0n) !== (b < 0n);
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	let acc = 0n;
	while (y > 0n) {
		if ((y & 1n) === 1n) {
			acc += x;
		}
		x <<= 1n;
		y >>= 1n;
	}
	return negative ? -acc : acc;
}

/**
 * Deterministic PRNG (xorshift64*) for reproducible large BigInt test vectors.
 *
 * @param {bigint} seed
 * @returns {(bits: number) => bigint}
 */
function makeBigIntRng(seed) {
	let state = seed & ((1n << 64n) - 1n);
	const MASK64 = (1n << 64n) - 1n;
	const next64 = () => {
		state ^= state >> 12n;
		state ^= (state << 25n) & MASK64;
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & MASK64;
	};
	return (bits) => {
		let val = 0n;
		let remaining = bits;
		while (remaining > 0) {
			const take = Math.min(64, remaining);
			val = (val << BigInt(take)) | (next64() & ((1n << BigInt(take)) - 1n));
			remaining -= take;
		}
		return val;
	};
}

describe('multiplyBigIntRecursive', () => {
	it('multiplies small positive integers accurately', () => {
		assert.equal(multiplyBigIntRecursive(2n, 3n), 6n);
		assert.equal(multiplyBigIntRecursive(12n, 34n), 408n);
		assert.equal(multiplyBigIntRecursive(999n, 999n), 998001n);
		assert.equal(multiplyBigIntRecursive(65535n, 65535n), 4294836225n);
	});

	it('handles all sign combinations correctly', () => {
		assert.equal(multiplyBigIntRecursive(-7n, 13n), -91n);
		assert.equal(multiplyBigIntRecursive(7n, -13n), -91n);
		assert.equal(multiplyBigIntRecursive(-7n, -13n), 91n);

		const bigA = 123456789012345678901234567890n;
		const bigB = 987654321098765432109876543210n;
		const expected = bigA * bigB;
		assert.equal(multiplyBigIntRecursive(bigA, bigB), expected);
		assert.equal(multiplyBigIntRecursive(-bigA, bigB), -expected);
		assert.equal(multiplyBigIntRecursive(bigA, -bigB), -expected);
		assert.equal(multiplyBigIntRecursive(-bigA, -bigB), expected);
	});

	it('handles zero and unit identity edge cases', () => {
		const huge = (1n << 512n) + 123456789n;
		assert.equal(multiplyBigIntRecursive(0n, 0n), 0n);
		assert.equal(multiplyBigIntRecursive(0n, 42n), 0n);
		assert.equal(multiplyBigIntRecursive(42n, 0n), 0n);
		assert.equal(multiplyBigIntRecursive(0n, -huge), 0n);
		assert.equal(multiplyBigIntRecursive(huge, 0n), 0n);

		assert.equal(multiplyBigIntRecursive(1n, 1n), 1n);
		assert.equal(multiplyBigIntRecursive(1n, -1n), -1n);
		assert.equal(multiplyBigIntRecursive(-1n, 1n), -1n);
		assert.equal(multiplyBigIntRecursive(-1n, -1n), 1n);
		assert.equal(multiplyBigIntRecursive(1n, huge), huge);
		assert.equal(multiplyBigIntRecursive(huge, 1n), huge);
		assert.equal(multiplyBigIntRecursive(-1n, huge), -huge);
		assert.equal(multiplyBigIntRecursive(huge, -1n), -huge);
	});

	it('handles bit-splitting boundaries, powers of two, and Mersenne numbers', () => {
		const boundaries = [
			(1n << 16n) - 1n,
			1n << 16n,
			(1n << 16n) + 1n,
			(1n << 32n) - 1n,
			1n << 32n,
			(1n << 32n) + 1n,
			(1n << 64n) - 1n,
			1n << 64n,
			(1n << 127n) - 1n,
			(1n << 256n) - 1n,
		];

		for (const a of boundaries) {
			for (const b of boundaries) {
				assert.equal(multiplyBigIntRecursive(a, b), a * b);
			}
		}
	});

	it('handles highly unbalanced operand bit lengths', () => {
		const huge = (1n << 2048n) - 1234567890123456789n;
		const smalls = [2n, 3n, 17n, 65535n, 65537n, -999983n];

		for (const s of smalls) {
			assert.equal(multiplyBigIntRecursive(huge, s), huge * s);
			assert.equal(multiplyBigIntRecursive(s, huge), s * huge);
			assert.equal(multiplyBigIntRecursive(-huge, s), -huge * s);
			assert.equal(multiplyBigIntRecursive(s, -huge), s * -huge);
		}
	});

	it('multiplies very large multi-thousand-bit BigInts accurately', () => {
		const a = (1n << 4096n) - 31415926535897932384626433832795n;
		const b = (1n << 3072n) + 27182818284590452353602874713526n;
		assert.equal(multiplyBigIntRecursive(a, b), a * b);
	});

	it('satisfies algebraic laws (commutativity, associativity, distributivity, difference of squares)', () => {
		const a = 987654321098765432109876543210987654321n;
		const b = -123456789012345678901234567890123456789n;
		const c = 555555555555555555555555555555555555555n;

		assert.equal(multiplyBigIntRecursive(a, b), multiplyBigIntRecursive(b, a));
		assert.equal(
			multiplyBigIntRecursive(multiplyBigIntRecursive(a, b), c),
			multiplyBigIntRecursive(a, multiplyBigIntRecursive(b, c)),
		);
		assert.equal(
			multiplyBigIntRecursive(a, b + c),
			multiplyBigIntRecursive(a, b) + multiplyBigIntRecursive(a, c),
		);

		// Difference of squares: (a + c)(a - c) === a^2 - c^2
		assert.equal(
			multiplyBigIntRecursive(a + c, a - c),
			multiplyBigIntRecursive(a, a) - multiplyBigIntRecursive(c, c),
		);

		// Power identity: 2^250 * 5^250 === 10^250
		assert.equal(
			multiplyBigIntRecursive(2n ** 250n, 5n ** 250n),
			10n ** 250n,
		);
	});

	it('matches an independent Russian-peasant oracle and native * across pseudo-random BigInts', () => {
		const randBits = makeBigIntRng(0xdeadbeefcafebaben);
		const widths = [1, 8, 15, 16, 17, 31, 32, 33, 64, 127, 256, 513];

		for (let i = 0; i < widths.length; i++) {
			const wA = widths[i];
			const wB = widths[(i * 5 + 3) % widths.length];
			const signA = i % 2 === 0 ? 1n : -1n;
			const signB = i % 3 === 0 ? -1n : 1n;
			const a = signA * randBits(wA);
			const b = signB * randBits(wB);

			const actual = multiplyBigIntRecursive(a, b);
			const oracle = russianPeasantMultiply(a, b);
			assert.equal(actual, oracle);
			assert.equal(actual, a * b);
		}
	});

	it('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidValues = [
			0,
			42,
			-1.5,
			NaN,
			Infinity,
			-Infinity,
			'123',
			'',
			true,
			false,
			null,
			undefined,
			{},
			[],
			Symbol('x'),
			() => 1n,
		];

		for (const bad of invalidValues) {
			assert.throws(
				() => multiplyBigIntRecursive(bad, 10n),
				{ name: 'TypeError' },
			);
			assert.throws(
				() => multiplyBigIntRecursive(10n, bad),
				{ name: 'TypeError' },
			);
		}

		assert.throws(() => multiplyBigIntRecursive(), { name: 'TypeError' });
		assert.throws(() => multiplyBigIntRecursive(10n), { name: 'TypeError' });
	});
});
