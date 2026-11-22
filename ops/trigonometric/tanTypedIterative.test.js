import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tanTypedIterative } from './tanTypedIterative.js';

function assertClose(actual, expected, tol = 1e-12, message = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

test('normal cases: standard exact trigonometric angles', () => {
	const input = new Float64Array([
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		-Math.PI / 6,
		-Math.PI / 4,
		-Math.PI / 3,
		Math.PI,
		-Math.PI,
		2 * Math.PI,
	]);
	const expected = [
		0,
		1 / Math.sqrt(3),
		1,
		Math.sqrt(3),
		-1 / Math.sqrt(3),
		-1,
		-Math.sqrt(3),
		0,
		0,
		0,
	];

	const originalCopy = new Float64Array(input);
	const result = tanTypedIterative(input);

	assert.ok(result instanceof Float64Array);
	assert.notEqual(result, input, 'should return a new Float64Array by default');
	assert.equal(result.length, input.length);
	assert.deepEqual(input, originalCopy, 'should not mutate input array');

	for (let i = 0; i < expected.length; i++) {
		assertClose(result[i], expected[i], 1e-14, `index ${i}`);
	}
});

test('optional pre-allocated output buffer and in-place operation', () => {
	const input = new Float64Array([0, Math.PI / 4, -Math.PI / 4, 1]);
	const out = new Float64Array(input.length);
	const returned = tanTypedIterative(input, out);

	assert.equal(returned, out, 'should return the provided out buffer');
	assertClose(out[0], 0, 1e-15);
	assertClose(out[1], 1, 1e-15);
	assertClose(out[2], -1, 1e-15);
	assertClose(out[3], Math.tan(1), 1e-15);

	// In-place: out === input
	const inplace = new Float64Array([0, Math.PI / 4, -Math.PI / 3]);
	const expectedInplace = [0, 1, -Math.sqrt(3)];
	const inplaceReturned = tanTypedIterative(inplace, inplace);
	assert.equal(inplaceReturned, inplace);
	for (let i = 0; i < expectedInplace.length; i++) {
		assertClose(inplace[i], expectedInplace[i], 1e-14);
	}
});

test('edge cases: empty array, subarray view, signed zero, subnormals, non-finite values, near asymptotes', () => {
	// Empty Float64Array
	const empty = new Float64Array(0);
	const emptyResult = tanTypedIterative(empty);
	assert.ok(emptyResult instanceof Float64Array);
	assert.equal(emptyResult.length, 0);
	assert.notEqual(emptyResult, empty);

	// Subarray view with non-zero byteOffset
	const backing = new Float64Array([999, Math.PI / 4, -Math.PI / 4, 0, -999]);
	const view = backing.subarray(1, 4);
	const viewResult = tanTypedIterative(view);
	assert.equal(viewResult.length, 3);
	assertClose(viewResult[0], 1, 1e-14);
	assertClose(viewResult[1], -1, 1e-14);
	assert.ok(Object.is(viewResult[2], 0));

	// Special IEEE-754 values
	const special = new Float64Array([
		0,
		-0,
		NaN,
		Infinity,
		-Infinity,
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
	]);
	const specialResult = tanTypedIterative(special);
	assert.ok(Object.is(specialResult[0], 0), 'tan(+0) should be +0');
	assert.ok(Object.is(specialResult[1], -0), 'tan(-0) should be -0');
	assert.ok(Number.isNaN(specialResult[2]), 'tan(NaN) should be NaN');
	assert.ok(Number.isNaN(specialResult[3]), 'tan(Infinity) should be NaN');
	assert.ok(Number.isNaN(specialResult[4]), 'tan(-Infinity) should be NaN');
	assert.equal(specialResult[5], Number.MIN_VALUE, 'tan(MIN_VALUE) === MIN_VALUE');
	assert.equal(specialResult[6], -Number.MIN_VALUE, 'tan(-MIN_VALUE) === -MIN_VALUE');

	// Near asymptote ±π/2 (finite floating-point approximation yields very large magnitude)
	const nearPole = new Float64Array([
		Math.PI / 2 - 1e-6,
		-(Math.PI / 2 - 1e-6),
		1e6,
		-1e6,
	]);
	const nearPoleResult = tanTypedIterative(nearPole);
	assertClose(nearPoleResult[0], 1e6, 1e-6, 'tan(pi/2 - 1e-6) ≈ 1e6');
	assertClose(nearPoleResult[1], -1e6, 1e-6, 'tan(-(pi/2 - 1e-6)) ≈ -1e6');
	assert.ok(Number.isFinite(nearPoleResult[2]));
	assertClose(nearPoleResult[2], -nearPoleResult[3], 1e-14);
});

test('input validation: throws TypeError and RangeError on invalid arguments', () => {
	const invalidInputs = [
		undefined,
		null,
		42,
		'0',
		{},
		[0, 1, 2],
		new Float32Array([0, 1]),
		new Int32Array([0, 1]),
		new Uint8Array([0, 1]),
	];

	for (const bad of invalidInputs) {
		assert.throws(
			() => tanTypedIterative(bad),
			{ name: 'TypeError' },
			`expected TypeError for input ${String(bad)}`,
		);
	}

	const valid = new Float64Array([0, 0.5, 1]);

	// Invalid out type
	for (const badOut of [null, [0, 0, 0], new Float32Array(3), 'out', 123]) {
		assert.throws(
			() => tanTypedIterative(valid, badOut),
			{ name: 'TypeError' },
			`expected TypeError for out ${String(badOut)}`,
		);
	}

	// Mismatched out length
	assert.throws(() => tanTypedIterative(valid, new Float64Array(2)), {
		name: 'RangeError',
	});
	assert.throws(() => tanTypedIterative(valid, new Float64Array(4)), {
		name: 'RangeError',
	});
	assert.throws(() => tanTypedIterative(valid, new Float64Array(0)), {
		name: 'RangeError',
	});
});

test('cross-check: trigonometric identities, inverse atan, and independent Maclaurin series', () => {
	// Grid of angles avoiding poles at odd multiples of π/2
	const n = 200;
	const angles = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		// Span (-1.4, 1.4), strictly inside (-π/2, π/2)
		angles[i] = -1.4 + (2.8 * i) / (n - 1);
	}

	const tans = tanTypedIterative(angles);

	// 1. Quotient identity: tan(x) === sin(x) / cos(x)
	// 2. Pythagorean secant identity: 1 + tan^2(x) === 1 / cos^2(x)
	// 3. Inverse identity: atan(tan(x)) === x on (-π/2, π/2)
	for (let i = 0; i < n; i++) {
		const x = angles[i];
		const t = tans[i];
		const sinOverCos = Math.sin(x) / Math.cos(x);
		assertClose(t, sinOverCos, 1e-13, `sin/cos identity at x=${x}`);

		const secSq = 1 / (Math.cos(x) * Math.cos(x));
		assertClose(1 + t * t, secSq, 1e-12, `1 + tan^2 = sec^2 at x=${x}`);

		assertClose(Math.atan(t), x, 1e-13, `atan(tan(x)) = x at x=${x}`);
	}

	// 4. Odd function symmetry tan(-x) === -tan(x) and periodicity tan(x + π) === tan(x)
	const negated = new Float64Array(n);
	const shifted = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		negated[i] = -angles[i];
		shifted[i] = angles[i] + Math.PI;
	}
	const tansNeg = tanTypedIterative(negated);
	const tansShifted = tanTypedIterative(shifted);
	for (let i = 0; i < n; i++) {
		assertClose(tansNeg[i], -tans[i], 1e-14, `odd symmetry at index ${i}`);
		assertClose(tansShifted[i], tans[i], 1e-12, `periodicity at index ${i}`);
	}

	// 5. Double-angle identity: tan(2x) === 2 tan(x) / (1 - tan^2(x)) for |x| <= 0.6
	const smallForDouble = new Float64Array([-0.6, -0.35, -0.1, 0.1, 0.35, 0.6]);
	const doubled = new Float64Array(smallForDouble.length);
	for (let i = 0; i < smallForDouble.length; i++) {
		doubled[i] = 2 * smallForDouble[i];
	}
	const tanX = tanTypedIterative(smallForDouble);
	const tan2X = tanTypedIterative(doubled);
	for (let i = 0; i < smallForDouble.length; i++) {
		const rhs = (2 * tanX[i]) / (1 - tanX[i] * tanX[i]);
		assertClose(tan2X[i], rhs, 1e-13, `double-angle identity at x=${smallForDouble[i]}`);
	}

	// 6. Independent Maclaurin series reference (no trig builtins) for small |x| <= 0.25:
	// tan(x) = x + x^3/3 + 2x^5/15 + 17x^7/315 + 62x^9/2835 + 1382x^11/155925 + O(x^13)
	const smallAngles = new Float64Array([-0.25, -0.15, -0.05, -0.001, 0, 0.001, 0.05, 0.15, 0.25]);
	const tanSmall = tanTypedIterative(smallAngles);
	for (let i = 0; i < smallAngles.length; i++) {
		const x = smallAngles[i];
		const x2 = x * x;
		const series =
			x *
			(1 +
				x2 *
					(1 / 3 +
						x2 *
							(2 / 15 +
								x2 *
									(17 / 315 +
										x2 * (62 / 2835 + x2 * (1382 / 155925))))));
		assertClose(tanSmall[i], series, 1e-10, `Maclaurin series at x=${x}`);
	}
});
