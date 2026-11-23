import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractBigIntSeries } from './subtractBigIntSeries.js';

describe('subtractBigIntSeries', () => {
	it('handles basic positive, negative, and mixed-sign subtraction', () => {
		assert.equal(subtractBigIntSeries(10n, 3n), 7n);
		assert.equal(subtractBigIntSeries(3n, 10n), -7n);
		assert.equal(subtractBigIntSeries(-10n, -3n), -7n);
		assert.equal(subtractBigIntSeries(-3n, -10n), 7n);
		assert.equal(subtractBigIntSeries(10n, -3n), 13n);
		assert.equal(subtractBigIntSeries(-10n, 3n), -13n);
	});

	it('handles zero and reflexive identities', () => {
		assert.equal(subtractBigIntSeries(0n, 0n), 0n);
		assert.equal(subtractBigIntSeries(42n, 0n), 42n);
		assert.equal(subtractBigIntSeries(-42n, 0n), -42n);
		assert.equal(subtractBigIntSeries(0n, 42n), -42n);
		assert.equal(subtractBigIntSeries(0n, -42n), 42n);
		assert.equal(subtractBigIntSeries(98765432109876543210n, 98765432109876543210n), 0n);
		assert.equal(subtractBigIntSeries(-98765432109876543210n, -98765432109876543210n), 0n);
	});

	it('handles multi-limb 64-bit boundary borrow and carry cascades', () => {
		const limb = 1n << 64n;
		const limb2 = 1n << 128n;
		const limb3 = 1n << 192n;

		// Cascading borrows across multiple 64-bit limbs
		assert.equal(subtractBigIntSeries(limb3, 1n), limb3 - 1n);
		assert.equal(subtractBigIntSeries(1n, limb3), 1n - limb3);
		assert.equal(subtractBigIntSeries(limb3, limb - 1n), limb3 - (limb - 1n));
		assert.equal(subtractBigIntSeries(limb3 + limb, limb2 + 1n), (limb3 + limb) - (limb2 + 1n));

		// Cascading carries across multiple 64-bit limbs (a - (-b) = a + b)
		assert.equal(subtractBigIntSeries(limb3 - 1n, -1n), limb3);
		assert.equal(subtractBigIntSeries(-(limb3 - 1n), 1n), -limb3);
		assert.equal(subtractBigIntSeries(limb3 - 1n, -(limb3 - 1n)), 2n * (limb3 - 1n));
	});

	it('handles arbitrarily large 1024-bit BigInts', () => {
		const hugeA = (1n << 1024n) + 123456789012345678901234567890n;
		const hugeB = (1n << 1023n) + 987654321098765432109876543210n;
		assert.equal(subtractBigIntSeries(hugeA, hugeB), hugeA - hugeB);
		assert.equal(subtractBigIntSeries(hugeB, hugeA), hugeB - hugeA);
		assert.equal(subtractBigIntSeries(-hugeA, hugeB), -hugeA - hugeB);
		assert.equal(subtractBigIntSeries(hugeA, -hugeB), hugeA + hugeB);
	});

	it('preserves exactness for 10^18-scaled fixed-point BigInt values', () => {
		const SCALE = 10n ** 18n;
		// 3.75 - 1.25 = 2.50
		const a = 375n * 10n ** 16n;
		const b = 125n * 10n ** 16n;
		assert.equal(subtractBigIntSeries(a, b), 250n * 10n ** 16n);

		// Scaling linearity: (p * SCALE) - (q * SCALE) = (p - q) * SCALE
		const p = 1234567890123456789012345n;
		const q = -9876543210987654321098765n;
		assert.equal(
			subtractBigIntSeries(p * SCALE, q * SCALE),
			subtractBigIntSeries(p, q) * SCALE,
		);
	});

	it('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidValues = [0, 1, -1, 3.14, NaN, Infinity, '10', '10n', null, undefined, {}, [], true, Symbol('x')];
		for (const bad of invalidValues) {
			assert.throws(() => subtractBigIntSeries(bad, 1n), TypeError);
			assert.throws(() => subtractBigIntSeries(1n, bad), TypeError);
		}
		assert.throws(() => subtractBigIntSeries(), TypeError);
		assert.throws(() => subtractBigIntSeries(1n), TypeError);
	});

	it('cross-checks against native subtraction and algebraic identities', () => {
		// Deterministic pseudo-random BigInt generator spanning multiple 64-bit limbs
		let state = 0x9e3779b97f4a7c15n;
		const nextBigInt = (limbs) => {
			let acc = 0n;
			for (let i = 0; i < limbs; i++) {
				state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				acc = (acc << 64n) | state;
			}
			return (state & 1n) === 0n ? acc : -acc;
		};

		const samples = [
			0n, 1n, -1n, (1n << 64n) - 1n, 1n << 64n, -(1n << 64n),
			(1n << 128n) - 1n, -(1n << 128n),
		];
		for (let i = 0; i < 24; i++) {
			samples.push(nextBigInt((i % 5) + 1));
		}

		// 1. Direct cross-check against native BigInt subtraction + algebraic identities
		const shift = 0x123456789abcdef0123456789abcdef0n;
		for (let i = 0; i < samples.length; i++) {
			const a = samples[i];
			const b = samples[(i * 7 + 3) % samples.length];
			const diff = subtractBigIntSeries(a, b);

			// Independent check 1: native subtraction
			assert.equal(diff, a - b);

			// Independent check 2: inverse recovery (a - b) + b === a
			assert.equal(diff + b, a);

			// Independent check 3: antisymmetry (a - b) === -(b - a)
			assert.equal(diff, -subtractBigIntSeries(b, a));

			// Independent check 4: translation invariance (a + c) - (b + c) === a - b
			assert.equal(subtractBigIntSeries(a + shift, b + shift), diff);
		}

		// 2. Telescoping sum cross-check: sum_{i=0}^{n-2} (x_{i+1} - x_i) === x_{n-1} - x_0
		let telescopingSum = 0n;
		for (let i = 0; i < samples.length - 1; i++) {
			telescopingSum += subtractBigIntSeries(samples[i + 1], samples[i]);
		}
		assert.equal(
			telescopingSum,
			subtractBigIntSeries(samples[samples.length - 1], samples[0]),
		);
	});
});
