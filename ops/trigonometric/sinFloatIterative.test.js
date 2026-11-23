import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sinFloatIterative } from './sinFloatIterative.js';

function assertClose(actual, expected, tolerance = 1e-15, label = '') {
	assert.equal(typeof actual, 'number', `${label}: expected number`);
	assert.ok(Number.isFinite(actual), `${label}: expected finite result, got ${actual}`);
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tolerance,
		`${label}: expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`
	);
}

describe('sinFloatIterative', () => {
	test('preserves signed zero (+0 and -0)', () => {
		assert.ok(Object.is(sinFloatIterative(0), 0));
		assert.ok(Object.is(sinFloatIterative(-0), -0));
	});

	test('returns NaN for NaN and ±Infinity', () => {
		assert.ok(Number.isNaN(sinFloatIterative(Number.NaN)));
		assert.ok(Number.isNaN(sinFloatIterative(Number.POSITIVE_INFINITY)));
		assert.ok(Number.isNaN(sinFloatIterative(Number.NEGATIVE_INFINITY)));
	});

	test('throws TypeError for non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'0',
			'1.57',
			true,
			false,
			{},
			[],
			[0],
			0n,
			Symbol('x'),
			() => 0,
		];
		for (const input of invalidInputs) {
			assert.throws(() => sinFloatIterative(input), TypeError);
		}
	});

	test('matches exact known special angles', () => {
		const cases = [
			[Math.PI / 6, 0.5],
			[Math.PI / 4, Math.SQRT1_2],
			[Math.PI / 3, Math.sqrt(3) / 2],
			[Math.PI / 2, 1],
			[(2 * Math.PI) / 3, Math.sqrt(3) / 2],
			[(3 * Math.PI) / 4, Math.SQRT1_2],
			[(5 * Math.PI) / 6, 0.5],
			[Math.PI, 0],
			[(7 * Math.PI) / 6, -0.5],
			[(5 * Math.PI) / 4, -Math.SQRT1_2],
			[(4 * Math.PI) / 3, -Math.sqrt(3) / 2],
			[(3 * Math.PI) / 2, -1],
			[2 * Math.PI, 0],
			[-Math.PI / 6, -0.5],
			[-Math.PI / 4, -Math.SQRT1_2],
			[-Math.PI / 3, -Math.sqrt(3) / 2],
			[-Math.PI / 2, -1],
			[-Math.PI, 0],
			[(-3 * Math.PI) / 2, 1],
			[-2 * Math.PI, 0],
		];

		for (const [angle, expected] of cases) {
			assertClose(sinFloatIterative(angle), expected, 1e-15, `sin(${angle})`);
		}
	});

	test('handles tiny and subnormal numbers accurately (sin(x) ≈ x)', () => {
		const tinyValues = [
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			1e-300,
			-1e-300,
			1e-100,
			-1e-100,
			1e-16,
			-1e-16,
			1e-8,
			-1e-8,
		];

		for (const x of tinyValues) {
			assertClose(sinFloatIterative(x), x, Math.abs(x) * 1e-15, `sin(${x})`);
		}
	});

	test('handles moderate and large finite values without overflow or NaN', () => {
		const largeValues = [
			1e3,
			-1e3,
			1e6,
			-1e6,
			1e7,
			-1e7,
			1e9,
			-1e9,
			1e15,
			-1e15,
			1e100,
			-1e100,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		];

		for (const x of largeValues) {
			const y = sinFloatIterative(x);
			assert.ok(Number.isFinite(y), `sin(${x}) should be finite, got ${y}`);
			assert.ok(y >= -1 && y <= 1, `sin(${x})=${y} out of [-1, 1]`);
		}
	});

	test('cross-check against Math.sin across dense range and multi-period angles', () => {
		for (let i = -200; i <= 200; i++) {
			const x = i * 0.37;
			assertClose(sinFloatIterative(x), Math.sin(x), 1e-15, `dense sin(${x})`);
		}

		const extraAngles = [
			0.123456789,
			-2.718281828459045,
			100,
			-100,
			12345.6789,
			-987654.321,
			1e7 + 0.5,
			-1e7 - 0.5,
			Math.PI,
			2 * Math.PI,
			100 * Math.PI,
		];
		for (const x of extraAngles) {
			assertClose(sinFloatIterative(x), Math.sin(x), 1e-14, `Math.sin(${x})`);
		}
	});

	test('independent cross-check: trigonometric identities without Math.sin', () => {
		const sampleAngles = [-4.2, -1.7, -0.5, 0.1, 0.6, 1.1, 2.3, 3.8, 7.5, 25.0];

		for (const x of sampleAngles) {
			const s = sinFloatIterative(x);

			// Odd symmetry: sin(-x) === -sin(x)
			assertClose(sinFloatIterative(-x), -s, 1e-15, `odd symmetry at ${x}`);

			// Periodicity: sin(x + 2π) === sin(x) and sin(x + π) === -sin(x)
			assertClose(sinFloatIterative(x + 2 * Math.PI), s, 1e-14, `2π periodicity at ${x}`);
			assertClose(sinFloatIterative(x + Math.PI), -s, 1e-14, `π half-period at ${x}`);

			// Reflection: sin(π - x) === sin(x)
			assertClose(sinFloatIterative(Math.PI - x), s, 1e-14, `reflection at ${x}`);

			// Pythagorean identity: sin^2(x) + sin^2(π/2 - x) === 1
			const c = sinFloatIterative(Math.PI / 2 - x);
			assertClose(s * s + c * c, 1, 1e-14, `Pythagorean identity at ${x}`);

			// Triple-angle identity: sin(3x) === 3 sin(x) - 4 sin^3(x)
			const sin3x = sinFloatIterative(3 * x);
			const rhs = 3 * s - 4 * s * s * s;
			assertClose(sin3x, rhs, 1e-13, `triple-angle identity at ${x}`);
		}
	});
});
