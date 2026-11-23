import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionComplexLazy } from './projectionComplexLazy.js';

/**
 * Assert two complex numbers are within tolerance.
 */
function assertComplexClose(actual, expected, eps = 1e-12, msg = '') {
	assert.equal(typeof actual, 'object');
	assert.ok(actual !== null);
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${msg} real mismatch: got ${actual.re}, expected ${expected.re}`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${msg} imag mismatch: got ${actual.im}, expected ${expected.im}`,
	);
}

/**
 * Assert two complex vectors are within tolerance.
 */
function assertVectorClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}`);
	}
}

/**
 * Independent naive reference implementation of complex vector projection:
 * proj_v(u) = (sum(u_k * conj(v_k)) / sum(|v_k|^2)) * v
 */
function naiveComplexProjection(uArr, vArr) {
	let numRe = 0;
	let numIm = 0;
	let denom = 0;
	for (let i = 0; i < uArr.length; i++) {
		const u = uArr[i];
		const v = vArr[i];
		numRe += u.re * v.re + u.im * v.im;
		numIm += u.im * v.re - u.re * v.im;
		denom += v.re * v.re + v.im * v.im;
	}
	const cRe = numRe / denom;
	const cIm = numIm / denom;
	return vArr.map((v) => ({
		re: cRe * v.re - cIm * v.im,
		im: cRe * v.im + cIm * v.re,
	}));
}

/**
 * Hermitian inner product <a, b> = sum(a_k * conj(b_k)).
 */
function hermitianDot(a, b) {
	let re = 0;
	let im = 0;
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im;
		im += a[i].im * b[i].re - a[i].re * b[i].im;
	}
	return { re, im };
}

/**
 * Squared Euclidean norm ||a||^2.
 */
function normSquared(a) {
	return a.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0);
}

/**
 * Deterministic LCG PRNG for reproducible randomized tests.
 */
function makeRng(seed = 123456789) {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return (state / 0x100000000) * 20 - 10;
	};
}

test('normal cases: real-valued complex vectors match Euclidean projection', () => {
	const u = [
		{ re: 3, im: 0 },
		{ re: 4, im: 0 },
	];
	const v = [
		{ re: 1, im: 0 },
		{ re: 0, im: 0 },
	];
	const result = [...projectionComplexLazy(u, v)];
	assert.deepStrictEqual(result, [
		{ re: 3, im: 0 },
		{ re: 0, im: 0 },
	]);
});

test('normal cases: complex vector projection with imaginary components', () => {
	// u = [1 + i, 2 - i], v = [i, 1]
	// <u, v> = (1 + i)(-i) + (2 - i)(1) = (1 - i) + (2 - i) = 3 - 2i
	// <v, v> = 1 + 1 = 2
	// c = 1.5 - i
	// proj = c * [i, 1] = [1 + 1.5i, 1.5 - i]
	const u = [
		{ re: 1, im: 1 },
		{ re: 2, im: -1 },
	];
	const v = [
		{ re: 0, im: 1 },
		{ re: 1, im: 0 },
	];
	const result = [...projectionComplexLazy(u, v)];
	assertVectorClose(result, [
		{ re: 1, im: 1.5 },
		{ re: 1.5, im: -1 },
	]);
});

test('normal cases: complex scalar multiple of v projects onto itself', () => {
	const v = [
		{ re: 1, im: -2 },
		{ re: 3, im: 4 },
		{ re: -1, im: 0.5 },
	];
	// alpha = 2 - 3i
	const u = v.map((z) => ({
		re: 2 * z.re - -3 * z.im,
		im: 2 * z.im + -3 * z.re,
	}));
	const result = [...projectionComplexLazy(u, v)];
	assertVectorClose(result, u, 1e-11);
});

test('normal cases: orthogonal complex vectors project to zero vector', () => {
	// <u, v> = (1)(i)* + (i)(1)* = -i + i = 0
	const u = [
		{ re: 1, im: 0 },
		{ re: 0, im: 1 },
	];
	const v = [
		{ re: 0, im: 1 },
		{ re: 1, im: 0 },
	];
	const result = [...projectionComplexLazy(u, v)];
	assertVectorClose(result, [
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
	]);
});

test('normal cases: accepts diverse iterables (generators, Sets, custom iterables)', () => {
	function* genU() {
		yield { re: 2, im: 3 };
		yield { re: -1, im: 4 };
	}
	const setV = new Set([
		{ re: 1, im: 1 },
		{ re: 2, im: -1 },
	]);
	const customU = {
		*[Symbol.iterator]() {
			yield { re: 2, im: 3 };
			yield { re: -1, im: 4 };
		},
	};
	const fromGenAndSet = [...projectionComplexLazy(genU(), setV)];
	const fromCustom = [...projectionComplexLazy(customU, [...setV])];
	const expected = naiveComplexProjection(
		[
			{ re: 2, im: 3 },
			{ re: -1, im: 4 },
		],
		[...setV],
	);
	assertVectorClose(fromGenAndSet, expected);
	assertVectorClose(fromCustom, expected);
});

test('edge cases: 1D complex vector projection always returns u', () => {
	const u = [{ re: 5, im: -7 }];
	const v = [{ re: -2, im: 3 }];
	const result = [...projectionComplexLazy(u, v)];
	assertVectorClose(result, u);
});

test('edge cases: zero vector u projects to zero vector without -0', () => {
	const u = [
		{ re: 0, im: 0 },
		{ re: -0, im: 0 },
	];
	const v = [
		{ re: -3, im: 4 },
		{ re: 1, im: -2 },
	];
	const result = [...projectionComplexLazy(u, v)];
	assert.deepStrictEqual(result, [
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
	]);
	for (const z of result) {
		assert.ok(!Object.is(z.re, -0));
		assert.ok(!Object.is(z.im, -0));
	}
});

test('edge cases: extreme magnitudes avoid overflow and underflow', () => {
	// Very large magnitudes (naive |v|^2 would overflow to Infinity)
	const uBig = [
		{ re: 3e200, im: 0 },
		{ re: 4e200, im: 0 },
	];
	const vBig = [
		{ re: 0, im: 1e200 },
		{ re: 0, im: 0 },
	];
	const resBig = [...projectionComplexLazy(uBig, vBig)];
	assertComplexClose(resBig[0], { re: 3e200, im: 0 }, 1e188);
	assertComplexClose(resBig[1], { re: 0, im: 0 }, 0);

	// Very small magnitudes (naive |v|^2 would underflow to 0)
	const uSmall = [
		{ re: 2e-200, im: 4e-200 },
		{ re: 0, im: 0 },
	];
	const vSmall = [
		{ re: 1e-200, im: 0 },
		{ re: 0, im: 1e-200 },
	];
	const resSmall = [...projectionComplexLazy(uSmall, vSmall)];
	assertComplexClose(resSmall[0], { re: 1e-200, im: 2e-200 }, 1e-212);
	assertComplexClose(resSmall[1], { re: -2e-200, im: 1e-200 }, 1e-212);

	// Mismatched extreme magnitudes: tiny u onto huge v
	const uTiny = [{ re: 5e-200, im: -3e-200 }];
	const vHuge = [{ re: 1e200, im: 2e200 }];
	const resMixed = [...projectionComplexLazy(uTiny, vHuge)];
	assertComplexClose(resMixed[0], { re: 5e-200, im: -3e-200 }, 1e-212);
});

test('validation: rejects non-iterable inputs eagerly', () => {
	const valid = [{ re: 1, im: 0 }];
	for (const bad of [null, undefined, 42, true, {}, 'abc']) {
		assert.throws(() => projectionComplexLazy(bad, valid), TypeError);
		assert.throws(() => projectionComplexLazy(valid, bad), TypeError);
	}
});

test('validation: rejects malformed or non-finite complex elements', () => {
	const valid = [{ re: 1, im: 0 }];
	for (const badElem of [null, undefined, 5, '1+i', {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }]) {
		assert.throws(() => [...projectionComplexLazy([badElem], valid)], TypeError);
		assert.throws(() => [...projectionComplexLazy(valid, [badElem])], TypeError);
	}
	for (const badNum of [NaN, Infinity, -Infinity]) {
		assert.throws(() => [...projectionComplexLazy([{ re: badNum, im: 0 }], valid)], RangeError);
		assert.throws(() => [...projectionComplexLazy(valid, [{ re: 0, im: badNum }])], RangeError);
	}
});

test('validation: rejects empty vectors, length mismatch, and zero target vector', () => {
	assert.throws(() => [...projectionComplexLazy([], [])], RangeError);
	assert.throws(
		() => [...projectionComplexLazy([{ re: 1, im: 0 }], [{ re: 1, im: 0 }, { re: 2, im: 0 }])],
		RangeError,
	);
	assert.throws(
		() => [...projectionComplexLazy([{ re: 1, im: 0 }, { re: 2, im: 0 }], [{ re: 1, im: 0 }])],
		RangeError,
	);
	assert.throws(
		() => [
			...projectionComplexLazy(
				[
					{ re: 1, im: 2 },
					{ re: 3, im: 4 },
				],
				[
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
				],
			),
		],
		RangeError,
	);
});

test('lazy consumption: zero elements consumed before iteration begins', () => {
	let pulledU = 0;
	let pulledV = 0;

	function* trackedU() {
		for (const z of [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		]) {
			pulledU++;
			yield z;
		}
	}
	function* trackedV() {
		for (const z of [
			{ re: 2, im: -1 },
			{ re: 0, im: 1 },
		]) {
			pulledV++;
			yield z;
		}
	}

	const gen = projectionComplexLazy(trackedU(), trackedV());
	assert.equal(pulledU, 0);
	assert.equal(pulledV, 0);

	// First .next() pulls inputs and yields only the first projected element
	const first = gen.next();
	assert.equal(first.done, false);
	assert.equal(pulledU, 2);
	assert.equal(pulledV, 2);

	const second = gen.next();
	assert.equal(second.done, false);
	assert.equal(gen.next().done, true);
});

test('lazy consumption: stops immediately on mid-stream error and closes iterators', () => {
	let pulledU = 0;
	let pulledV = 0;
	let closedU = false;
	let closedV = false;

	function* badU() {
		try {
			pulledU++;
			yield { re: 1, im: 0 };
			pulledU++;
			yield { re: NaN, im: 0 };
			pulledU++;
			yield { re: 3, im: 0 };
		} finally {
			closedU = true;
		}
	}
	function* infiniteV() {
		try {
			while (true) {
				pulledV++;
				yield { re: 1, im: 1 };
			}
		} finally {
			closedV = true;
		}
	}

	const gen = projectionComplexLazy(badU(), infiniteV());
	assert.equal(pulledU, 0);
	assert.equal(pulledV, 0);
	assert.throws(() => gen.next(), RangeError);
	assert.equal(pulledU, 2);
	assert.equal(pulledV, 2);
	assert.equal(closedU, true);
	assert.equal(closedV, true);
});

test('lazy consumption: length mismatch with infinite iterable terminates promptly and closes it', () => {
	let pulledV = 0;
	let closedV = false;

	const finiteU = [
		{ re: 1, im: 0 },
		{ re: 2, im: 0 },
	];
	function* infiniteV() {
		try {
			while (true) {
				pulledV++;
				yield { re: 1, im: 0 };
			}
		} finally {
			closedV = true;
		}
	}

	const gen = projectionComplexLazy(finiteU, infiniteV());
	assert.equal(pulledV, 0);
	assert.throws(() => gen.next(), RangeError);
	// Should have pulled 2 matching elements + 1 extra element to detect mismatch
	assert.equal(pulledV, 3);
	assert.equal(closedV, true);
});

test('lazy consumption: early consumer termination yields only requested elements', () => {
	const u = Array.from({ length: 10 }, (_, i) => ({ re: i + 1, im: -i }));
	const v = Array.from({ length: 10 }, (_, i) => ({ re: 1, im: i }));
	const expected = naiveComplexProjection(u, v);

	const taken = [];
	for (const elem of projectionComplexLazy(u, v)) {
		taken.push(elem);
		if (taken.length === 3) {
			break;
		}
	}
	assert.equal(taken.length, 3);
	assertVectorClose(taken, expected.slice(0, 3));
});

test('independent cross-check: matches naive formula and satisfies projection axioms', () => {
	const rand = makeRng(20261123);

	for (let dim = 1; dim <= 15; dim++) {
		const u = Array.from({ length: dim }, () => ({ re: rand(), im: rand() }));
		const u2 = Array.from({ length: dim }, () => ({ re: rand(), im: rand() }));
		const v = Array.from({ length: dim }, () => ({ re: rand(), im: rand() }));
		// Guarantee v is well away from zero
		v[0].re += 15;

		const proj = [...projectionComplexLazy(u, v)];
		const ref = naiveComplexProjection(u, v);

		// 1. Cross-check against naive reference implementation
		assertVectorClose(proj, ref, 1e-10);

		// 2. Orthogonality of residual: <u - proj_v(u), v> == 0
		const residual = u.map((z, i) => ({
			re: z.re - proj[i].re,
			im: z.im - proj[i].im,
		}));
		const dot = hermitianDot(residual, v);
		assertComplexClose(dot, { re: 0, im: 0 }, 1e-9, `dim=${dim} orthogonality`);

		// 3. Idempotence: proj_v(proj_v(u)) == proj_v(u)
		const projTwice = [...projectionComplexLazy(proj, v)];
		assertVectorClose(projTwice, proj, 1e-10);

		// 4. Complex scaling invariance in v: proj_{alpha * v}(u) == proj_v(u)
		const alpha = { re: -1.7, im: 2.3 };
		const scaledV = v.map((z) => ({
			re: alpha.re * z.re - alpha.im * z.im,
			im: alpha.re * z.im + alpha.im * z.re,
		}));
		const projScaledV = [...projectionComplexLazy(u, scaledV)];
		assertVectorClose(projScaledV, proj, 1e-10);

		// 5. Linearity in u: proj_v(alpha * u + beta * u2) == alpha * proj_v(u) + beta * proj_v(u2)
		const beta = { re: 0.6, im: -1.4 };
		const combinedU = u.map((z, i) => ({
			re: alpha.re * z.re - alpha.im * z.im + (beta.re * u2[i].re - beta.im * u2[i].im),
			im: alpha.re * z.im + alpha.im * z.re + (beta.re * u2[i].im + beta.im * u2[i].re),
		}));
		const projCombined = [...projectionComplexLazy(combinedU, v)];
		const projU2 = [...projectionComplexLazy(u2, v)];
		const expectedLinear = proj.map((z, i) => ({
			re: alpha.re * z.re - alpha.im * z.im + (beta.re * projU2[i].re - beta.im * projU2[i].im),
			im: alpha.re * z.im + alpha.im * z.re + (beta.re * projU2[i].im + beta.im * projU2[i].re),
		}));
		assertVectorClose(projCombined, expectedLinear, 1e-9);

		// 6. Pythagorean theorem: ||u||^2 == ||proj||^2 + ||u - proj||^2
		const lhs = normSquared(u);
		const rhs = normSquared(proj) + normSquared(residual);
		assert.ok(
			Math.abs(lhs - rhs) <= 1e-9 * Math.max(1, lhs),
			`dim=${dim} Pythagorean mismatch: ${lhs} vs ${rhs}`,
		);
	}
});
