import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { specialFunctionsFloatIterative } from './specialFunctionsFloatIterative.js';

/**
 * Asserts that actual is close to expected within absolute or relative tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

/**
 * Independent composite Simpson's rule numerical integrator on [a, b] with n even subintervals.
 */
function simpsonIntegrate(fn, a, b, n) {
	const h = (b - a) / n;
	let sum = fn(a) + fn(b);
	for (let i = 1; i < n; i++) {
		sum += (i % 2 === 0 ? 2 : 4) * fn(a + i * h);
	}
	return (sum * h) / 3;
}

describe('specialFunctionsFloatIterative - erf & erfc', () => {
	test('known values and symmetry for erf', () => {
		assert.equal(specialFunctionsFloatIterative('erf', 0), 0);
		assertClose(specialFunctionsFloatIterative('erf', 0.5), 0.5204998778130465, 1e-14, 'erf(0.5)');
		assertClose(specialFunctionsFloatIterative('erf', 1), 0.8427007929497149, 1e-14, 'erf(1)');
		assertClose(specialFunctionsFloatIterative('erf', 2), 0.9953222650189527, 1e-14, 'erf(2)');
		assertClose(specialFunctionsFloatIterative('erf', 3), 0.9999779095030014, 1e-14, 'erf(3)');
		assert.equal(specialFunctionsFloatIterative('erf', 30), 1);
		assert.equal(specialFunctionsFloatIterative('erf', -30), -1);

		for (const x of [0.1, 0.75, 1.0, 1.5, 2.5, 5.0]) {
			assertClose(
				specialFunctionsFloatIterative('erf', -x),
				-specialFunctionsFloatIterative('erf', x),
				1e-15,
				`erf odd symmetry at ${x}`,
			);
		}
	});

	test('known values and tail accuracy for erfc', () => {
		assert.equal(specialFunctionsFloatIterative('erfc', 0), 1);
		assertClose(specialFunctionsFloatIterative('erfc', 0.5), 0.4795001221869535, 1e-14, 'erfc(0.5)');
		assertClose(specialFunctionsFloatIterative('erfc', 1), 0.15729920705028513, 1e-14, 'erfc(1)');
		assertClose(specialFunctionsFloatIterative('erfc', 3), 2.209049699858544e-5, 1e-13, 'erfc(3)');
		assertClose(specialFunctionsFloatIterative('erfc', 5), 1.537459794428035e-12, 1e-13, 'erfc(5)');
		assertClose(specialFunctionsFloatIterative('erfc', 10), 2.088487583762545e-45, 1e-12, 'erfc(10)');
		assert.equal(specialFunctionsFloatIterative('erfc', 30), 0);
		assert.equal(specialFunctionsFloatIterative('erfc', -30), 2);
	});

	test('identity erf(x) + erfc(x) = 1 across positive, zero, and negative inputs', () => {
		for (const x of [-10, -2.5, -1.0, -0.3, 0, 0.3, 0.999, 1.0, 1.001, 2.5, 5.0]) {
			const sum = specialFunctionsFloatIterative('erf', x) + specialFunctionsFloatIterative('erfc', x);
			assertClose(sum, 1, 1e-14, `erf(${x}) + erfc(${x})`);
		}
	});

	test('cross-check erf(x) against independent Simpson numerical integration', () => {
		const coeff = 2 / Math.sqrt(Math.PI);
		for (const x of [0.25, 0.9, 1.25, 2.2, -1.4]) {
			const integral = coeff * simpsonIntegrate((t) => Math.exp(-t * t), 0, x, 2000);
			const computed = specialFunctionsFloatIterative('erf', x);
			assertClose(computed, integral, 1e-11, `Simpson cross-check erf(${x})`);
		}
	});
});

describe('specialFunctionsFloatIterative - gamma & lgamma', () => {
	test('exact factorials and half-integer values for gamma', () => {
		assert.equal(specialFunctionsFloatIterative('gamma', 1), 1);
		assert.equal(specialFunctionsFloatIterative('gamma', 2), 1);
		assert.equal(specialFunctionsFloatIterative('gamma', 5), 24);
		assert.equal(specialFunctionsFloatIterative('gamma', 6), 120);
		assert.equal(specialFunctionsFloatIterative('gamma', 10), 362880);
		assertClose(specialFunctionsFloatIterative('gamma', 0.5), Math.sqrt(Math.PI), 1e-14, 'Gamma(1/2)');
		assertClose(specialFunctionsFloatIterative('gamma', 1.5), 0.5 * Math.sqrt(Math.PI), 1e-14, 'Gamma(3/2)');
		assertClose(specialFunctionsFloatIterative('gamma', -0.5), -2 * Math.sqrt(Math.PI), 1e-14, 'Gamma(-1/2)');
		assertClose(specialFunctionsFloatIterative('gamma', -1.5), (4 / 3) * Math.sqrt(Math.PI), 1e-14, 'Gamma(-3/2)');
		assertClose(specialFunctionsFloatIterative('gamma', -2.5), -(8 / 15) * Math.sqrt(Math.PI), 1e-13, 'Gamma(-5/2)');
	});

	test('lgamma values and consistency with ln(|gamma(x)|)', () => {
		assert.equal(specialFunctionsFloatIterative('lgamma', 1), 0);
		assert.equal(specialFunctionsFloatIterative('lgamma', 2), 0);
		assertClose(specialFunctionsFloatIterative('lgamma', 0.5), 0.5 * Math.log(Math.PI), 1e-14, 'lgamma(0.5)');
		assertClose(specialFunctionsFloatIterative('lgamma', 10), Math.log(362880), 1e-13, 'lgamma(10)');
		// Large x where gamma(x) overflows float64, lgamma(x) stays finite and accurate.
		// Stirling check: lgamma(200) = ln(199!) ≈ 857.9336698258574
		assertClose(specialFunctionsFloatIterative('lgamma', 200), 857.9336698258574, 1e-12, 'lgamma(200)');

		for (const x of [-4.25, -1.7, -0.3, 0.2, 0.75, 3.4, 12.5]) {
			const lg = specialFunctionsFloatIterative('lgamma', x);
			const g = specialFunctionsFloatIterative('gamma', x);
			assertClose(lg, Math.log(Math.abs(g)), 1e-13, `lgamma vs ln|gamma| at ${x}`);
		}
	});

	test('cross-check Euler reflection formula Gamma(x) * Gamma(1 - x) = pi / sin(pi * x)', () => {
		for (const x of [-3.2, -1.75, -0.4, 0.15, 0.25, 0.4, 0.73, 1.35]) {
			const lhs =
				specialFunctionsFloatIterative('gamma', x) *
				specialFunctionsFloatIterative('gamma', 1 - x);
			const rhs = Math.PI / Math.sin(Math.PI * x);
			assertClose(lhs, rhs, 1e-13, `reflection formula at x=${x}`);
		}
	});

	test('cross-check Gamma(x) against independent Simpson numerical integration', () => {
		// Gamma(x) = integral_0^inf t^(x-1) exp(-t) dt; substitute t = s^2 => 2 * s^(2x-1) * exp(-s^2).
		// Tail beyond s = 12 is < exp(-144) ~ 1e-63, and integrand is smooth at s = 0 for x >= 1.5.
		for (const x of [1.5, 2.5, 3.25, 4.5]) {
			const integrand = (s) => (s === 0 ? 0 : 2 * Math.pow(s, 2 * x - 1) * Math.exp(-s * s));
			const integral = simpsonIntegrate(integrand, 0, 12, 4000);
			const computed = specialFunctionsFloatIterative('gamma', x);
			assertClose(computed, integral, 1e-11, `Simpson cross-check Gamma(${x})`);
		}
	});

	test('gamma and lgamma throw RangeError at poles (0 and negative integers)', () => {
		for (const pole of [0, -0, -1, -2, -10, -100]) {
			assert.throws(() => specialFunctionsFloatIterative('gamma', pole), RangeError);
			assert.throws(() => specialFunctionsFloatIterative('lgamma', pole), RangeError);
		}
	});
});

describe('specialFunctionsFloatIterative - beta', () => {
	test('known values, symmetry, and large-argument overflow avoidance', () => {
		assertClose(specialFunctionsFloatIterative('beta', 1, 1), 1, 1e-14, 'B(1,1)');
		assertClose(specialFunctionsFloatIterative('beta', 2, 3), 1 / 12, 1e-14, 'B(2,3)');
		assertClose(specialFunctionsFloatIterative('beta', 0.5, 0.5), Math.PI, 1e-14, 'B(0.5,0.5)');
		assertClose(specialFunctionsFloatIterative('beta', 3, 5), 1 / 105, 1e-14, 'B(3,5)');
		// Small positive inputs (< 0.5): B(0.25, 0.75) = pi / sin(pi / 4) = pi * sqrt(2)
		assertClose(
			specialFunctionsFloatIterative('beta', 0.25, 0.75),
			Math.PI * Math.SQRT2,
			1e-13,
			'B(0.25,0.75)',
		);

		// Symmetry B(x, y) === B(y, x)
		for (const [x, y] of [[0.4, 2.7], [1.5, 6.2], [12.3, 4.1]]) {
			assertClose(
				specialFunctionsFloatIterative('beta', x, y),
				specialFunctionsFloatIterative('beta', y, x),
				1e-14,
				`B(${x},${y}) symmetry`,
			);
		}

		// Large arguments where Gamma(x + y) overflows float64, but B(x, y) is finite.
		const largeBeta = specialFunctionsFloatIterative('beta', 150, 150);
		assert.ok(Number.isFinite(largeBeta) && largeBeta > 0, 'B(150, 150) should not overflow');
	});

	test('cross-check Beta(x, y) against Simpson numerical integration', () => {
		for (const [x, y] of [[2, 3], [2.5, 3.5], [4, 2.5]]) {
			const integral = simpsonIntegrate(
				(t) => Math.pow(t, x - 1) * Math.pow(1 - t, y - 1),
				0,
				1,
				2000,
			);
			const computed = specialFunctionsFloatIterative('beta', x, y);
			assertClose(computed, integral, 1e-10, `Simpson cross-check B(${x}, ${y})`);
		}
	});
});

describe('specialFunctionsFloatIterative - besselJ0', () => {
	test('known values, zeros, even symmetry, and regime transitions', () => {
		assert.equal(specialFunctionsFloatIterative('besselJ0', 0), 1);
		assertClose(specialFunctionsFloatIterative('besselJ0', 1), 0.7651976865579666, 1e-14, 'J0(1)');
		assertClose(specialFunctionsFloatIterative('besselJ0', 4), -0.39714980986384737, 1e-14, 'J0(4)');
		assertClose(specialFunctionsFloatIterative('besselJ0', 10), -0.24593576445134833, 1e-14, 'J0(10)');
		assertClose(specialFunctionsFloatIterative('besselJ0', 20), 0.1670246643405832, 1e-13, 'J0(20)');
		assertClose(specialFunctionsFloatIterative('besselJ0', 50), 0.05581232766925178, 1e-13, 'J0(50)');

		// Known zeros of J_0 across all three regimes (series, quadrature, Hankel)
		const zeros = [
			2.4048255576957728,
			5.5200781102863106,
			8.6537279129110122,
			11.7915344390142816,
			21.211636629879259,
		];
		for (const z of zeros) {
			assertClose(specialFunctionsFloatIterative('besselJ0', z), 0, 1e-13, `J0 zero at ${z}`);
		}

		// Even symmetry J_0(-x) = J_0(x)
		for (const x of [0.5, 3.9, 4.1, 12.7, 19.9, 20.1, 35.4]) {
			assert.equal(
				specialFunctionsFloatIterative('besselJ0', -x),
				specialFunctionsFloatIterative('besselJ0', x),
			);
		}
	});

	test('cross-check J_0(x) against independent Simpson integration of Poisson integral', () => {
		for (const x of [0.7, 3.5, 7.2, 15.8, 25.0]) {
			const integral =
				simpsonIntegrate((theta) => Math.cos(x * Math.sin(theta)), 0, Math.PI, 2000) / Math.PI;
			const computed = specialFunctionsFloatIterative('besselJ0', x);
			assertClose(computed, integral, 1e-12, `Simpson cross-check J0(${x})`);
		}
	});
});

describe('specialFunctionsFloatIterative - input validation & edge cases', () => {
	test('throws TypeError for invalid function name type or argument types', () => {
		assert.throws(() => specialFunctionsFloatIterative(123, 1), TypeError);
		assert.throws(() => specialFunctionsFloatIterative(null, 1), TypeError);
		assert.throws(() => specialFunctionsFloatIterative('erf', '1'), TypeError);
		assert.throws(() => specialFunctionsFloatIterative('gamma', undefined), TypeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 1, '2'), TypeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 1), TypeError);
		assert.throws(() => specialFunctionsFloatIterative('erf', 1, 2), TypeError);
	});

	test('throws RangeError for unsupported function names, non-finite values, and domain errors', () => {
		assert.throws(() => specialFunctionsFloatIterative('unknown', 1), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('erf', Number.NaN), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('erf', Number.POSITIVE_INFINITY), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('erfc', Number.NEGATIVE_INFINITY), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 1, Number.NaN), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 1, Number.POSITIVE_INFINITY), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 0, 1), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', -1, 2), RangeError);
		assert.throws(() => specialFunctionsFloatIterative('beta', 2, -0.5), RangeError);
	});
});
