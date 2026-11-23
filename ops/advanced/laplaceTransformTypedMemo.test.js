import test from 'node:test';
import assert from 'node:assert/strict';
import { laplaceTransformTypedMemo } from './laplaceTransformTypedMemo.js';

/**
 * Helper to generate uniformly sampled Float64Array signal f(k * dt).
 */
function sampleSignal(fn, n, dt) {
	const out = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		out[k] = fn(k * dt);
	}
	return out;
}

/**
 * Independent naive unmemoized trapezoidal Laplace integrator for cross-checking.
 */
function referenceTrapezoidalLaplace(samples, s, dt) {
	const n = samples.length;
	if (n < 2) return 0;
	let total = 0.5 * samples[0] + 0.5 * samples[n - 1] * Math.exp(-s * (n - 1) * dt);
	for (let k = 1; k < n - 1; k++) {
		total += samples[k] * Math.exp(-s * k * dt);
	}
	return total * dt;
}

/**
 * Independent composite Simpson's 1/3 rule integrator (requires odd n >= 3).
 */
function referenceSimpsonLaplace(samples, s, dt) {
	const n = samples.length;
	assert.equal(n % 2, 1, 'Simpson reference requires odd sample count');
	let total = samples[0] + samples[n - 1] * Math.exp(-s * (n - 1) * dt);
	for (let k = 1; k < n - 1; k++) {
		const coeff = k % 2 === 1 ? 4 : 2;
		total += coeff * samples[k] * Math.exp(-s * k * dt);
	}
	return (total * dt) / 3;
}

test('unit step f(t) = 1 matches analytical 1/s', () => {
	const dt = 0.005;
	const n = 4001; // T = 20
	const samples = sampleSignal(() => 1, n, dt);
	const sValues = new Float64Array([1, 2, 3.5, 5, 10]);
	const out = laplaceTransformTypedMemo(samples, sValues, dt);

	assert.ok(out instanceof Float64Array);
	assert.equal(out.length, sValues.length);

	for (let j = 0; j < sValues.length; j++) {
		const s = sValues[j];
		const expected = (1 - Math.exp(-s * (n - 1) * dt)) / s;
		assert.ok(
			Math.abs(out[j] - expected) < 5e-5,
			`s=${s}: got ${out[j]}, expected ~${expected}`
		);
	}
});

test('exponential decay f(t) = exp(-a*t) matches 1/(s+a) including negative s > -a', () => {
	const a = 3;
	const dt = 0.005;
	const n = 4001; // T = 20
	const samples = sampleSignal((t) => Math.exp(-a * t), n, dt);
	const sValues = new Float64Array([-1.5, -0.5, 0, 1, 4]);
	const out = laplaceTransformTypedMemo(samples, sValues, dt);

	for (let j = 0; j < sValues.length; j++) {
		const s = sValues[j];
		const expected = 1 / (s + a);
		assert.ok(
			Math.abs(out[j] - expected) < 5e-5,
			`s=${s}: got ${out[j]}, expected ~${expected}`
		);
	}
});

test('ramp f(t) = t matches analytical 1/s^2', () => {
	const dt = 0.005;
	const n = 6001; // T = 30
	const samples = sampleSignal((t) => t, n, dt);
	const sValues = new Float64Array([1, 2, 4]);
	const out = laplaceTransformTypedMemo(samples, sValues, dt);

	for (let j = 0; j < sValues.length; j++) {
		const s = sValues[j];
		const expected = 1 / (s * s);
		assert.ok(
			Math.abs(out[j] - expected) < 5e-5,
			`s=${s}: got ${out[j]}, expected ~${expected}`
		);
	}
});

test('oscillatory signals sin(w*t) and cos(w*t) match closed-form Laplace transforms', () => {
	const w = 2.5;
	const dt = 0.0025;
	const n = 8001; // T = 20
	const sinSamples = sampleSignal((t) => Math.sin(w * t), n, dt);
	const cosSamples = sampleSignal((t) => Math.cos(w * t), n, dt);
	const sValues = new Float64Array([1, 2, 5]);

	const sinOut = laplaceTransformTypedMemo(sinSamples, sValues, dt);
	const cosOut = laplaceTransformTypedMemo(cosSamples, sValues, dt);

	for (let j = 0; j < sValues.length; j++) {
		const s = sValues[j];
		const denom = s * s + w * w;
		const expectedSin = w / denom;
		const expectedCos = s / denom;
		assert.ok(
			Math.abs(sinOut[j] - expectedSin) < 5e-5,
			`sin s=${s}: got ${sinOut[j]}, expected ~${expectedSin}`
		);
		assert.ok(
			Math.abs(cosOut[j] - expectedCos) < 5e-5,
			`cos s=${s}: got ${cosOut[j]}, expected ~${expectedCos}`
		);
	}
});

test('defaults dt to 1 and does not mutate input arrays', () => {
	const samples = new Float64Array([1, 2, 3, 4]);
	const sValues = new Float64Array([0, 0.5, 1]);
	const samplesSnap = new Float64Array(samples);
	const sSnap = new Float64Array(sValues);

	const outDefault = laplaceTransformTypedMemo(samples, sValues);
	const outExplicit = laplaceTransformTypedMemo(samples, sValues, 1);

	assert.deepEqual(outDefault, outExplicit);
	assert.deepEqual(samples, samplesSnap);
	assert.deepEqual(sValues, sSnap);
});

test('memoization handles duplicate s values, +0/-0 normalization, and repeated calls across distinct signals', () => {
	const dt = 0.05;
	const n = 201;
	const f1 = sampleSignal((t) => Math.exp(-t), n, dt);
	const f2 = sampleSignal((t) => Math.cos(t), n, dt);
	const sValues = new Float64Array([1, 0, 2.5, -0, 1, 2.5]);

	const out1 = laplaceTransformTypedMemo(f1, sValues, dt);
	const out2 = laplaceTransformTypedMemo(f2, sValues, dt);

	// Duplicate entries in sValues must match bit-for-bit.
	assert.equal(out1[0], out1[4]);
	assert.equal(out1[1], out1[3]);
	assert.equal(out1[2], out1[5]);

	assert.equal(out2[0], out2[4]);
	assert.equal(out2[1], out2[3]);
	assert.equal(out2[2], out2[5]);

	// Distinct signals sharing cached kernels must produce distinct, accurate results.
	assert.notEqual(out1[0], out2[0]);
	for (let j = 0; j < sValues.length; j++) {
		assert.ok(Math.abs(out1[j] - referenceTrapezoidalLaplace(f1, sValues[j], dt)) < 1e-12);
		assert.ok(Math.abs(out2[j] - referenceTrapezoidalLaplace(f2, sValues[j], dt)) < 1e-12);
	}
});

test('cache eviction under > 256 distinct frequency keys remains accurate', () => {
	const dt = 0.1;
	const n = 101;
	const samples = sampleSignal((t) => Math.exp(-0.5 * t), n, dt);
	const sValues = new Float64Array(320);
	for (let j = 0; j < sValues.length; j++) {
		sValues[j] = 0.05 * (j + 1);
	}

	const out = laplaceTransformTypedMemo(samples, sValues, dt);
	assert.equal(out.length, 320);
	for (let j = 0; j < sValues.length; j++) {
		const ref = referenceTrapezoidalLaplace(samples, sValues[j], dt);
		assert.ok(
			Math.abs(out[j] - ref) < 1e-12,
			`eviction mismatch at j=${j}: got ${out[j]}, ref ${ref}`
		);
	}
});

test('edge cases: empty arrays, single sample, two samples, zero signal, and large positive s', () => {
	// Empty sValues
	const emptyS = laplaceTransformTypedMemo(new Float64Array([1, 2, 3]), new Float64Array(0), 0.1);
	assert.ok(emptyS instanceof Float64Array);
	assert.equal(emptyS.length, 0);

	// Empty samples
	const emptySamples = laplaceTransformTypedMemo(new Float64Array(0), new Float64Array([0, 1, 2]), 0.1);
	assert.deepEqual(emptySamples, new Float64Array([0, 0, 0]));

	// Single sample (zero-width domain)
	const single = laplaceTransformTypedMemo(new Float64Array([42]), new Float64Array([0, 1, 5]), 0.25);
	assert.deepEqual(single, new Float64Array([0, 0, 0]));

	// Two samples: exact single trapezoid 0.5 * dt * (f0 + f1 * exp(-s * dt))
	const dt = 0.5;
	const pair = laplaceTransformTypedMemo(new Float64Array([4, 6]), new Float64Array([0, 2]), dt);
	assert.ok(Math.abs(pair[0] - 0.5 * dt * (4 + 6)) < 1e-15);
	assert.ok(Math.abs(pair[1] - 0.5 * dt * (4 + 6 * Math.exp(-2 * dt))) < 1e-15);

	// All-zero signal
	const zeros = laplaceTransformTypedMemo(new Float64Array(10), new Float64Array([-1, 0, 1]), 0.1);
	assert.deepEqual(zeros, new Float64Array([0, 0, 0]));

	// Large positive s causing exp(-s * k * dt) underflow for k >= 1
	const largeS = laplaceTransformTypedMemo(new Float64Array([8, 10, 12]), new Float64Array([10000]), 0.5);
	assert.ok(Number.isFinite(largeS[0]));
	assert.equal(largeS[0], 0.5 * 0.5 * 8);
});

test('works with Float64Array subarray views having non-zero byteOffset', () => {
	const backing = new Float64Array([999, 1, 2, 4, 8, 999]);
	const samples = backing.subarray(1, 5);
	const sBacking = new Float64Array([999, 0.25, 1.5, 999]);
	const sValues = sBacking.subarray(1, 3);
	const dt = 0.2;

	const out = laplaceTransformTypedMemo(samples, sValues, dt);
	assert.equal(out.length, 2);
	for (let j = 0; j < sValues.length; j++) {
		const ref = referenceTrapezoidalLaplace(samples, sValues[j], dt);
		assert.ok(Math.abs(out[j] - ref) < 1e-14);
	}
});

test('input validation rejects invalid types, non-positive dt, and non-finite elements', () => {
	const validSamples = new Float64Array([1, 2, 3]);
	const validS = new Float64Array([0.5, 1.5]);

	// Invalid samples type
	assert.throws(() => laplaceTransformTypedMemo([1, 2, 3], validS), TypeError);
	assert.throws(() => laplaceTransformTypedMemo(new Float32Array([1, 2]), validS), TypeError);
	assert.throws(() => laplaceTransformTypedMemo(null, validS), TypeError);

	// Invalid sValues type
	assert.throws(() => laplaceTransformTypedMemo(validSamples, [0.5, 1.5]), TypeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, new Float32Array([0.5])), TypeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, undefined), TypeError);

	// Invalid dt type
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, '0.1'), TypeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, null), TypeError);

	// Invalid dt range
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, 0), RangeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, -0.5), RangeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, Number.NaN), RangeError);
	assert.throws(() => laplaceTransformTypedMemo(validSamples, validS, Infinity), RangeError);

	// Non-finite elements in samples or sValues
	assert.throws(
		() => laplaceTransformTypedMemo(new Float64Array([1, Number.NaN, 3]), validS),
		RangeError
	);
	assert.throws(
		() => laplaceTransformTypedMemo(new Float64Array([1, Infinity, 3]), validS),
		RangeError
	);
	assert.throws(
		() => laplaceTransformTypedMemo(validSamples, new Float64Array([1, Number.NaN])),
		RangeError
	);
	assert.throws(
		() => laplaceTransformTypedMemo(validSamples, new Float64Array([1, -Infinity])),
		RangeError
	);
});

test('independent cross-checks: Simpson rule, linearity, and frequency-shift theorem', () => {
	const dt = 0.005;
	const n = 2001; // odd count for Simpson's rule, T = 10
	const f = sampleSignal((t) => Math.exp(-0.7 * t) * Math.cos(1.3 * t), n, dt);
	const g = sampleSignal((t) => t * Math.exp(-1.1 * t), n, dt);
	const sValues = new Float64Array([0.5, 1.25, 2.75, 4.0]);

	// 1. Cross-check against independent Simpson's 1/3 rule integrator
	const lf = laplaceTransformTypedMemo(f, sValues, dt);
	for (let j = 0; j < sValues.length; j++) {
		const simpson = referenceSimpsonLaplace(f, sValues[j], dt);
		assert.ok(
			Math.abs(lf[j] - simpson) < 1e-4,
			`Simpson cross-check s=${sValues[j]}: got ${lf[j]}, simpson ${simpson}`
		);
	}

	// 2. Linearity: L{alpha*f + beta*g}(s) = alpha*L{f}(s) + beta*L{g}(s)
	const alpha = 2.3;
	const beta = -1.7;
	const combo = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		combo[k] = alpha * f[k] + beta * g[k];
	}
	const lg = laplaceTransformTypedMemo(g, sValues, dt);
	const lCombo = laplaceTransformTypedMemo(combo, sValues, dt);
	for (let j = 0; j < sValues.length; j++) {
		const expected = alpha * lf[j] + beta * lg[j];
		assert.ok(
			Math.abs(lCombo[j] - expected) < 1e-12,
			`Linearity mismatch at j=${j}: got ${lCombo[j]}, expected ${expected}`
		);
	}

	// 3. Frequency-shift theorem: L{exp(-a*t) * f(t)}(s) === L{f(t)}(s + a)
	const shift = 1.5;
	const shiftedSignal = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		shiftedSignal[k] = Math.exp(-shift * k * dt) * f[k];
	}
	const shiftedS = new Float64Array(sValues.length);
	for (let j = 0; j < sValues.length; j++) {
		shiftedS[j] = sValues[j] + shift;
	}
	const lhs = laplaceTransformTypedMemo(shiftedSignal, sValues, dt);
	const rhs = laplaceTransformTypedMemo(f, shiftedS, dt);
	for (let j = 0; j < sValues.length; j++) {
		assert.ok(
			Math.abs(lhs[j] - rhs[j]) < 1e-12,
			`Shift theorem mismatch at j=${j}: lhs=${lhs[j]}, rhs=${rhs[j]}`
		);
	}
});
