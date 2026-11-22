import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { subtractBigIntRecursive } from './subtractBigIntRecursive.js';

describe('subtractBigIntRecursive', () => {
	test('handles normal positive BigInt subtraction', () => {
		assert.equal(subtractBigIntRecursive(10n, 3n), 7n);
		assert.equal(subtractBigIntRecursive(1000n, 1n), 999n);
		assert.equal(subtractBigIntRecursive(12345678901234567890n, 9876543210987654321n), 2469135690246913569n);
	});

	test('handles zero edge cases', () => {
		assert.equal(subtractBigIntRecursive(0n, 0n), 0n);
		assert.equal(subtractBigIntRecursive(42n, 0n), 42n);
		assert.equal(subtractBigIntRecursive(-42n, 0n), -42n);
		assert.equal(subtractBigIntRecursive(0n, 42n), -42n);
		assert.equal(subtractBigIntRecursive(0n, -42n), 42n);
	});

	test('returns 0n when a === b', () => {
		const values = [
			0n,
			1n,
			-1n,
			(1n << 32n) - 1n,
			1n << 64n,
			-(1n << 128n),
			(1n << 512n) - 1n,
			-((1n << 512n) - 1n),
		];
		for (const v of values) {
			assert.equal(subtractBigIntRecursive(v, v), 0n);
		}
	});

	test('handles a < b producing negative results', () => {
		assert.equal(subtractBigIntRecursive(3n, 10n), -7n);
		assert.equal(subtractBigIntRecursive(1n, 1000n), -999n);
		assert.equal(subtractBigIntRecursive(0n, 1n << 128n), -(1n << 128n));
		assert.equal(subtractBigIntRecursive(1n << 64n, 1n << 65n), -(1n << 64n));
	});

	test('handles negative - positive', () => {
		assert.equal(subtractBigIntRecursive(-5n, 3n), -8n);
		assert.equal(subtractBigIntRecursive(-1n, (1n << 64n) - 1n), -(1n << 64n));
		assert.equal(subtractBigIntRecursive(-(1n << 100n), 1n << 100n), -(1n << 101n));
	});

	test('handles positive - negative', () => {
		assert.equal(subtractBigIntRecursive(5n, -3n), 8n);
		assert.equal(subtractBigIntRecursive((1n << 64n) - 1n, -1n), 1n << 64n);
		assert.equal(subtractBigIntRecursive(1n << 100n, -(1n << 100n)), 1n << 101n);
	});

	test('handles negative - negative across all magnitude orderings', () => {
		assert.equal(subtractBigIntRecursive(-10n, -3n), -7n);
		assert.equal(subtractBigIntRecursive(-3n, -10n), 7n);
		assert.equal(subtractBigIntRecursive(-10n, -10n), 0n);
		assert.equal(subtractBigIntRecursive(-(1n << 128n), -1n), -((1n << 128n) - 1n));
		assert.equal(subtractBigIntRecursive(-1n, -(1n << 128n)), (1n << 128n) - 1n);
	});

	test('handles long borrow and carry chains across limb boundaries', () => {
		const pairs = [
			[1n << 32n, 1n],
			[1n << 64n, 1n],
			[1n << 128n, 1n],
			[1n << 256n, 1n],
			[(1n << 64n) - 1n, -1n],
			[(1n << 128n) - 1n, -1n],
			[1n << 128n, (1n << 128n) - 1n],
			[(1n << 128n) - 1n, 1n << 128n],
		];
		for (const [a, b] of pairs) {
			const result = subtractBigIntRecursive(a, b);
			assert.equal(result, a - b);
			assert.equal(result + b, a);
		}
	});

	test('handles huge 512-bit and 1024-bit BigInts cleanly', () => {
		const max512 = (1n << 512n) - 1n;
		const bigA = (1n << 511n) + 0x123456789abcdef0fedcba9876543210n;
		const bigB = (1n << 510n) + 0xfedcba9876543210123456789abcdef0n;
		const huge1024 = (1n << 1024n) - 123456789n;

		const cases = [
			[max512, 1n],
			[1n << 512n, 1n],
			[1n, 1n << 512n],
			[bigA, bigB],
			[bigB, bigA],
			[-bigA, bigB],
			[bigA, -bigB],
			[-bigA, -bigB],
			[-bigB, -bigA],
			[max512, -max512],
			[-max512, max512],
			[huge1024, max512],
			[-huge1024, -max512],
		];

		for (const [a, b] of cases) {
			const res = subtractBigIntRecursive(a, b);
			assert.equal(res, a - b);
			assert.equal(res + b, a);
		}
	});

	test('cross-checks against native BigInt subtraction and inverse identity (a - b) + b === a', () => {
		// Deterministic PRNG (xorshift64*) for reproducible property-based coverage
		let state = 0x9e3779b97f4a7c15n;
		const mask64 = (1n << 64n) - 1n;
		const nextU64 = () => {
			state ^= state >> 12n;
			state ^= (state << 25n) & mask64;
			state ^= state >> 27n;
			return (state * 0x2545f4914f6cdd1dn) & mask64;
		};
		const nextBigInt = (limbs, signed = true) => {
			let v = 0n;
			for (let i = 0; i < limbs; i++) {
				v = (v << 64n) | nextU64();
			}
			if (signed && (nextU64() & 1n) === 1n) {
				v = -v;
			}
			return v;
		};

		for (let i = 0; i < 200; i++) {
			const limbsA = (i % 10) + 1;
			const limbsB = ((i * 3) % 10) + 1;
			const a = nextBigInt(limbsA);
			const b = nextBigInt(limbsB);
			const diff = subtractBigIntRecursive(a, b);

			assert.equal(diff, a - b);
			assert.equal(diff + b, a);
			assert.equal(subtractBigIntRecursive(b, a), -diff);
		}
	});

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [
			0,
			1,
			-1,
			3.14,
			NaN,
			Infinity,
			-Infinity,
			'1',
			'0',
			'',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('x'),
			() => 1n,
		];

		for (const invalid of invalidValues) {
			assert.throws(() => subtractBigIntRecursive(invalid, 1n), TypeError);
			assert.throws(() => subtractBigIntRecursive(1n, invalid), TypeError);
			assert.throws(() => subtractBigIntRecursive(invalid, invalid), TypeError);
		}

		assert.throws(() => subtractBigIntRecursive(), TypeError);
		assert.throws(() => subtractBigIntRecursive(1n), TypeError);
	});
});
