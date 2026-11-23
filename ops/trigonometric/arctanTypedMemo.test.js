import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanTypedMemo } from './arctanTypedMemo.js';

describe('arctanTypedMemo', () => {
	it('computes exact known trigonometric values', () => {
		const input = new Float64Array([
			0,
			1,
			-1,
			Math.sqrt(3),
			-Math.sqrt(3),
			1 / Math.sqrt(3),
			-1 / Math.sqrt(3),
		]);
		const expected = [
			0,
			Math.PI / 4,
			-Math.PI / 4,
			Math.PI / 3,
			-Math.PI / 3,
			Math.PI / 6,
			-Math.PI / 6,
		];

		const result = arctanTypedMemo(input);
		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, input.length);
		assert.notEqual(result, input);

		for (let i = 0; i < expected.length; i++) {
			assert.ok(
				Math.abs(result[i] - expected[i]) < 1e-15,
				`index ${i}: got ${result[i]}, expected ${expected[i]}`
			);
		}
	});

	it('handles empty Float64Array without mutating or aliasing', () => {
		const input = new Float64Array(0);
		const result = arctanTypedMemo(input);
		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);
		assert.notEqual(result, input);
	});

	it('handles special IEEE-754 values (+0, -0, NaN, +/-Infinity, extremes)', () => {
		const input = new Float64Array([
			0,
			-0,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			1e-16,
			-1e-16,
			Number.MIN_VALUE,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]);

		const result = arctanTypedMemo(input);

		assert.ok(Object.is(result[0], 0), 'should preserve +0');
		assert.ok(Object.is(result[1], -0), 'should preserve -0');
		assert.ok(Number.isNaN(result[2]), 'should propagate NaN');
		assert.equal(result[3], Math.PI / 2, '+Infinity -> +PI/2');
		assert.equal(result[4], -Math.PI / 2, '-Infinity -> -PI/2');
		assert.ok(Math.abs(result[5] - 1e-16) < 1e-30);
		assert.ok(Math.abs(result[6] + 1e-16) < 1e-30);
		assert.equal(result[7], Number.MIN_VALUE);
		assert.equal(result[8], Math.PI / 2);
		assert.equal(result[9], -Math.PI / 2);
	});

	it('rejects non-Float64Array inputs with TypeError', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			1.5,
			'0.5',
			true,
			{},
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			new BigInt64Array([0n, 1n]),
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => arctanTypedMemo(bad),
				{ name: 'TypeError' },
				`Expected TypeError for ${Object.prototype.toString.call(bad)}`
			);
		}
	});

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([-10, -0.5, 0, 0.5, 10]);
		const snapshot = new Float64Array(input);
		arctanTypedMemo(input);
		assert.deepEqual(input, snapshot);
	});

	it('matches Math.atan across a dense sweep of domains', () => {
		const samples = [];
		for (let i = -200; i <= 200; i++) {
			samples.push(i * 0.01); // [-2, 2] dense around unit circle & table nodes
		}
		for (let exp = -12; exp <= 12; exp++) {
			const v = 10 ** exp;
			samples.push(v, -v, 1.5 * v, -1.5 * v);
		}

		const input = new Float64Array(samples);
		const result = arctanTypedMemo(input);

		for (let i = 0; i < input.length; i++) {
			const expected = Math.atan(input[i]);
			const err = Math.abs(result[i] - expected);
			assert.ok(
				err < 1e-14,
				`x=${input[i]}: got ${result[i]}, Math.atan=${expected}, err=${err}`
			);
		}
	});

	it('satisfies independent trigonometric identities: tan(atan(x)) ≈ x, oddness, reciprocal', () => {
		const values = [-100, -10, -2.5, -1, -0.37, -0.001, 0, 0.001, 0.37, 1, 2.5, 10, 100];
		const input = new Float64Array(values);
		const out = arctanTypedMemo(input);

		// tan(arctan(x)) ≈ x
		for (let i = 0; i < values.length; i++) {
			const x = values[i];
			const reconstructed = Math.tan(out[i]);
			const scale = Math.max(1, Math.abs(x) * Math.abs(x));
			assert.ok(
				Math.abs(reconstructed - x) < 1e-12 * scale,
				`tan(atan(${x})) = ${reconstructed}`
			);
		}

		// Odd symmetry: atan(-x) === -atan(x)
		const pos = new Float64Array([0.123, 0.789, 1.5, 42.25]);
		const neg = new Float64Array(pos.map((v) => -v));
		const outPos = arctanTypedMemo(pos);
		const outNeg = arctanTypedMemo(neg);
		for (let i = 0; i < pos.length; i++) {
			assert.equal(outNeg[i], -outPos[i]);
		}

		// Reciprocal identity for x > 0: atan(x) + atan(1/x) ≈ PI/2
		const inv = new Float64Array(pos.map((v) => 1 / v));
		const outInv = arctanTypedMemo(inv);
		for (let i = 0; i < pos.length; i++) {
			assert.ok(
				Math.abs(outPos[i] + outInv[i] - Math.PI / 2) < 1e-15,
				`reciprocal identity failed for x=${pos[i]}`
			);
		}
	});

	it('memoizes repeated values consistently across calls and cache eviction', () => {
		const repeated = new Float64Array([0.42, -0.42, 0.42, 3.14, -3.14, 3.14]);
		const first = arctanTypedMemo(repeated);
		const second = arctanTypedMemo(repeated);

		for (let i = 0; i < repeated.length; i++) {
			assert.ok(Object.is(first[i], second[i]));
		}
		assert.equal(first[0], first[2]);
		assert.equal(first[1], -first[0]);
		assert.equal(first[3], first[5]);
		assert.equal(first[4], -first[3]);

		// Exercise cache eviction (> 4096 distinct keys) and verify recomputed values match
		const large = new Float64Array(5000);
		for (let i = 0; i < large.length; i++) {
			large[i] = (i + 1) * 0.00137;
		}
		const largeOut = arctanTypedMemo(large);
		for (let i = 0; i < large.length; i += 250) {
			assert.ok(Math.abs(largeOut[i] - Math.atan(large[i])) < 1e-14);
		}

		const third = arctanTypedMemo(repeated);
		for (let i = 0; i < repeated.length; i++) {
			assert.ok(Object.is(first[i], third[i]));
		}
	});
});
