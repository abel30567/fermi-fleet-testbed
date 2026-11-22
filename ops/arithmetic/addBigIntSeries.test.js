import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addBigIntSeries } from './addBigIntSeries.js';

describe('addBigIntSeries', () => {
	it('computes normal positive, negative, and mixed-sign sums', () => {
		assert.equal(addBigIntSeries(2n, 3n), 5n);
		assert.equal(addBigIntSeries(123456789n, 987654321n), 1111111110n);
		assert.equal(addBigIntSeries(-10n, -25n), -35n);
		assert.equal(addBigIntSeries(42n, -17n), 25n);
		assert.equal(addBigIntSeries(-42n, 17n), -25n);
		assert.equal(addBigIntSeries(17n, -42n), -25n);
		assert.equal(addBigIntSeries(-17n, 42n), 25n);
	});

	it('handles zero, additive inverses, and worst-case full carry/borrow chains', () => {
		assert.equal(addBigIntSeries(0n, 0n), 0n);
		assert.equal(addBigIntSeries(0n, 999n), 999n);
		assert.equal(addBigIntSeries(999n, 0n), 999n);
		assert.equal(addBigIntSeries(0n, -999n), -999n);
		assert.equal(addBigIntSeries(-999n, 0n), -999n);

		// Additive inverse cancellation across signs
		assert.equal(addBigIntSeries(1n, -1n), 0n);
		assert.equal(addBigIntSeries(-1n, 1n), 0n);
		assert.equal(addBigIntSeries((1n << 256n) - 1n, -((1n << 256n) - 1n)), 0n);

		// Worst-case O(bitLength) carry propagation: (2^256 - 1) + 1 = 2^256
		const maxUint256 = (1n << 256n) - 1n;
		assert.equal(addBigIntSeries(maxUint256, 1n), 1n << 256n);
		assert.equal(addBigIntSeries(-maxUint256, -1n), -(1n << 256n));

		// Worst-case O(bitLength) borrow propagation: 2^256 + (-1) = 2^256 - 1
		assert.equal(addBigIntSeries(1n << 256n, -1n), maxUint256);
		assert.equal(addBigIntSeries(-(1n << 256n), 1n), -maxUint256);
	});

	it('supports exact 10^18-scaled fixed-point BigInt values and large 256+ bit integers', () => {
		const SCALE = 10n ** 18n;
		const aFixed = 1n * SCALE + 250000000000000000n; // 1.25
		const bFixed = -3n * SCALE - 750000000000000000n; // -3.75
		assert.equal(addBigIntSeries(aFixed, bFixed), -2n * SCALE - 500000000000000000n); // -2.50

		const x256 = 0xdeadbeefcafebabe0123456789abcdef_fedcba9876543210aabbccddeeff0011n;
		const y256 = 0x112233445566778899aabbccddeeff00_00112233445566778899aabbccddeeffn;
		assert.equal(addBigIntSeries(x256, y256), x256 + y256);
		assert.equal(addBigIntSeries(x256, -y256), x256 + (-y256));
		assert.equal(addBigIntSeries(-x256, y256), (-x256) + y256);
		assert.equal(addBigIntSeries(-x256, -y256), (-x256) + (-y256));

		// 512-bit integers
		const bigA = (1n << 512n) - 123456789012345678901234567890n;
		const bigB = -(1n << 511n) + 98765432109876543210987654321n;
		assert.equal(addBigIntSeries(bigA, bigB), bigA + bigB);
	});

	it('cross-checks against native +, commutativity, associativity, and additive inverse', () => {
		const samples = [
			0n,
			1n,
			-1n,
			2n,
			-2n,
			7n,
			-13n,
			255n,
			-256n,
			10n ** 18n,
			-(10n ** 18n),
			(1n << 64n) - 1n,
			-(1n << 64n),
			(1n << 256n) - 1n,
			-(1n << 256n) + 17n,
			0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n,
		];

		for (const a of samples) {
			// Additive identity and inverse
			assert.equal(addBigIntSeries(a, 0n), a);
			assert.equal(addBigIntSeries(0n, a), a);
			assert.equal(addBigIntSeries(a, -a), 0n);

			for (const b of samples) {
				const sumAB = addBigIntSeries(a, b);
				const sumBA = addBigIntSeries(b, a);

				// Direct cross-check against native BigInt addition
				assert.equal(sumAB, a + b);
				// Commutativity: a + b === b + a
				assert.equal(sumAB, sumBA);
				// Inverse recovery: (a + b) + (-b) === a
				assert.equal(addBigIntSeries(sumAB, -b), a);
			}
		}

		// Associativity: (a + b) + c === a + (b + c)
		const triples = [
			[0n, 1n, -1n],
			[123456789n, -987654321n, 555555555n],
			[(1n << 256n) - 1n, 1n, -(1n << 255n)],
			[-(1n << 200n) + 3n, (1n << 199n) - 7n, (1n << 201n) + 11n],
			[10n ** 18n, -3n * 10n ** 18n, 2n * 10n ** 18n],
		];

		for (const [a, b, c] of triples) {
			const left = addBigIntSeries(addBigIntSeries(a, b), c);
			const right = addBigIntSeries(a, addBigIntSeries(b, c));
			assert.equal(left, right);
			assert.equal(left, a + b + c);
		}
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [
			0,
			1,
			-42,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			'1',
			'0n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('1'),
		];

		for (const bad of invalidValues) {
			assert.throws(() => addBigIntSeries(bad, 1n), TypeError);
			assert.throws(() => addBigIntSeries(1n, bad), TypeError);
		}

		assert.throws(() => addBigIntSeries(), TypeError);
		assert.throws(() => addBigIntSeries(1n), TypeError);
	});
});
