import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	divideBigIntRecursive,
	FIXED_POINT_SCALE,
} from './divideBigIntRecursive.js';

describe('divideBigIntRecursive', () => {
	it('computes exact integer quotients scaled by 10^18', () => {
		assert.equal(divideBigIntRecursive(6n, 3n), 2n * FIXED_POINT_SCALE);
		assert.equal(divideBigIntRecursive(100n, 25n), 4n * FIXED_POINT_SCALE);
		assert.equal(divideBigIntRecursive(42n, 1n), 42n * FIXED_POINT_SCALE);
		assert.equal(divideBigIntRecursive(999n, 999n), 1n * FIXED_POINT_SCALE);
	});

	it('computes fixed-point quotients for non-integer divisions', () => {
		assert.equal(divideBigIntRecursive(1n, 2n), 500_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(1n, 4n), 250_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(3n, 8n), 375_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(1n, 3n), 333_333_333_333_333_333n);
		assert.equal(divideBigIntRecursive(2n, 3n), 666_666_666_666_666_666n);
	});

	it('handles negative operands with truncation toward zero', () => {
		assert.equal(divideBigIntRecursive(-7n, 2n), -3_500_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(7n, -2n), -3_500_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(-7n, -2n), 3_500_000_000_000_000_000n);
		assert.equal(divideBigIntRecursive(-1n, 3n), -333_333_333_333_333_333n);
		assert.equal(divideBigIntRecursive(1n, -3n), -333_333_333_333_333_333n);
	});

	it('handles zero dividend and sub-unit underflow edge cases', () => {
		assert.equal(divideBigIntRecursive(0n, 1n), 0n);
		assert.equal(divideBigIntRecursive(0n, -99999999999999999999n), 0n);
		// Magnitude smaller than 10^-18 truncates to 0n
		assert.equal(divideBigIntRecursive(1n, 10n ** 18n + 1n), 0n);
		assert.equal(divideBigIntRecursive(-1n, 10n ** 19n), 0n);
		// Exact boundary of 10^-18
		assert.equal(divideBigIntRecursive(1n, 10n ** 18n), 1n);
		assert.equal(divideBigIntRecursive(-1n, 10n ** 18n), -1n);
	});

	it('handles powers of two, bit-length boundaries, and very large BigInts', () => {
		const bigA = (1n << 256n) + 123456789012345678901234567890n;
		const bigB = (1n << 128n) - 1n;
		assert.equal(
			divideBigIntRecursive(bigA, bigB),
			(bigA * FIXED_POINT_SCALE) / bigB,
		);

		const hugeDividend = 10n ** 120n;
		const smallDivisor = 7n;
		assert.equal(
			divideBigIntRecursive(hugeDividend, smallDivisor),
			(hugeDividend * FIXED_POINT_SCALE) / smallDivisor,
		);

		// Divisor slightly smaller and slightly larger than powers of two
		for (const shift of [1n, 2n, 3n, 7n, 31n, 63n, 127n]) {
			const pow2 = 1n << shift;
			for (const delta of [-1n, 0n, 1n]) {
				const d = pow2 + delta;
				if (d <= 0n) continue;
				const n = (1n << (shift + 10n)) + 37n;
				assert.equal(
					divideBigIntRecursive(n, d),
					(n * FIXED_POINT_SCALE) / d,
				);
			}
		}
	});

	it('supports custom positive BigInt scale values', () => {
		assert.equal(divideBigIntRecursive(1n, 3n, 1n), 0n);
		assert.equal(divideBigIntRecursive(10n, 3n, 1n), 3n);
		assert.equal(divideBigIntRecursive(1n, 8n, 1000n), 125n);
		assert.equal(divideBigIntRecursive(-5n, 4n, 100n), -125n);
	});

	it('rejects invalid inputs with appropriate errors', () => {
		assert.throws(() => divideBigIntRecursive(10, 2n), TypeError);
		assert.throws(() => divideBigIntRecursive(10n, 2), TypeError);
		assert.throws(() => divideBigIntRecursive('10', 2n), TypeError);
		assert.throws(() => divideBigIntRecursive(null, 2n), TypeError);
		assert.throws(() => divideBigIntRecursive(undefined, 2n), TypeError);
		assert.throws(() => divideBigIntRecursive(10n, 2n, 1000), TypeError);

		assert.throws(() => divideBigIntRecursive(10n, 0n), RangeError);
		assert.throws(() => divideBigIntRecursive(0n, 0n), RangeError);
		assert.throws(() => divideBigIntRecursive(10n, 2n, 0n), RangeError);
		assert.throws(() => divideBigIntRecursive(10n, 2n, -10n), RangeError);
	});

	it('cross-checks against native BigInt division and Euclidean invariants across deterministic pseudo-random pairs', () => {
		let state = 0x123456789abcdef0123456789abcdefn;
		const nextRand = (bits) => {
			let value = 0n;
			const chunks = Math.ceil(bits / 64);
			for (let i = 0; i < chunks; i++) {
				// LCG modulo 2^128
				state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 128n) - 1n);
				value = (value << 64n) | (state >> 64n);
			}
			const mask = (1n << BigInt(bits)) - 1n;
			return value & mask;
		};

		const bitSizes = [4, 16, 64, 130, 260];
		for (const aBits of bitSizes) {
			for (const bBits of bitSizes) {
				for (let trial = 0; trial < 4; trial++) {
					const rawA = nextRand(aBits);
					const rawB = nextRand(bBits) + 1n;
					const a = trial % 2 === 0 ? rawA : -rawA;
					const b = trial < 2 ? rawB : -rawB;

					const actual = divideBigIntRecursive(a, b);
					const expected = (a * FIXED_POINT_SCALE) / b;
					assert.equal(actual, expected);

					// Independent Euclidean remainder bound check:
					// a * scale = actual * b + r with |r| < |b| and sign(r) matching sign(a) or r == 0
					const scaledA = a * FIXED_POINT_SCALE;
					const remainder = scaledA - actual * b;
					const absB = b < 0n ? -b : b;
					const absRem = remainder < 0n ? -remainder : remainder;
					assert.ok(absRem < absB, `Expected |${remainder}| < ${absB}`);
					if (remainder !== 0n) {
						assert.equal(remainder < 0n, scaledA < 0n);
					}
				}
			}
		}
	});
});
