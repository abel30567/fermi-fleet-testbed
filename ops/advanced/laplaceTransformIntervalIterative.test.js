import test from 'node:test';
import assert from 'node:assert/strict';
import { laplaceTransformIntervalIterative } from './laplaceTransformIntervalIterative.js';

/**
 * Independent scalar point-evaluation of the discrete Laplace transform:
 *   sum_{n=0}^{N-1} f_n * exp(-s * (n * dt)) * dt
 */
function pointLaplace(values, s, dt) {
  let sum = 0;
  for (let n = 0; n < values.length; n += 1) {
    sum += values[n] * Math.exp(-s * (n * dt));
  }
  return sum * dt;
}

/**
 * Deterministic LCG PRNG for reproducible interior sampling cross-checks.
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Decompose a finite IEEE-754 float64 into exact rational num * 2^exp using BigInt.
 * Used for exact rational cross-checks independent of floating-point arithmetic.
 */
function float64ToExactRational(x) {
  if (x === 0) return { num: 0n, shift: 0 };
  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u64 = new BigUint64Array(buf);
  f64[0] = x;
  const bits = u64[0];
  const sign = (bits >> 63n) === 1n ? -1n : 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  if (rawExp === 0) {
    return { num: sign * frac, shift: -1074 };
  }
  return { num: sign * ((1n << 52n) | frac), shift: rawExp - 1023 - 52 };
}

/**
 * Exact comparison of a finite float64 `a` against a rational `p / q` (q > 0n).
 * Returns -1 if a < p/q, 0 if equal, 1 if a > p/q.
 */
function compareFloatToRational(a, p, q) {
  const { num, shift } = float64ToExactRational(a);
  let lhs;
  let rhs;
  if (shift >= 0) {
    lhs = (num << BigInt(shift)) * q;
    rhs = p;
  } else {
    lhs = num * q;
    rhs = p << BigInt(-shift);
  }
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

test('normal cases: default dt=[1, 1], s=0, and single sample', () => {
  // Constant unit samples at s = 0, default dt = [1, 1] -> sum = 4
  const [lo1, hi1] = laplaceTransformIntervalIterative(
    [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [0, 0],
  );
  assert.ok(lo1 <= 4 && 4 <= hi1, `expected [lo, hi] to enclose 4, got [${lo1}, ${hi1}]`);
  assert.ok(hi1 - lo1 < 1e-14, `expected tight enclosure, width=${hi1 - lo1}`);

  // Single sample: t_0 = 0 => exp(-s * 0) = 1 regardless of s
  const [lo2, hi2] = laplaceTransformIntervalIterative([[2, 3]], [-50, 100], [0.5, 0.5]);
  assert.ok(lo2 <= 1 && 1.5 <= hi2, `expected enclosure of [1, 1.5], got [${lo2}, ${hi2}]`);
  assert.ok(lo2 > 1 - 1e-14 && hi2 < 1.5 + 1e-14);

  // Single sample with default dt = [1, 1] is exact
  const resExact = laplaceTransformIntervalIterative([[2.25, 3.75]], [10, 20]);
  assert.deepStrictEqual(resExact, [2.25, 3.75]);
});

test('normal cases: geometric series enclosure for constant and exponential signals', () => {
  // f_n = 1, N = 10, s = 0.5, dt = 0.25
  const N = 10;
  const s = 0.5;
  const dt = 0.25;
  const samples = Array.from({ length: N }, () => [1, 1]);
  const [lo, hi] = laplaceTransformIntervalIterative(samples, [s, s], [dt, dt]);

  // Independent closed-form discrete geometric sum
  const exactGeom = (dt * (1 - Math.exp(-N * s * dt))) / (1 - Math.exp(-s * dt));
  assert.ok(lo <= hi);
  assert.ok(
    lo <= exactGeom && exactGeom <= hi,
    `expected [${lo}, ${hi}] to enclose geometric sum ${exactGeom}`,
  );
  assert.ok(hi - lo < 1e-12, `expected tight width, got ${hi - lo}`);

  // Mixed-sign samples and s straddling 0
  const mixed = [
    [-2, -1],
    [0.5, 1.5],
    [-0.25, 0.75],
    [3, 4],
  ];
  const [mLo, mHi] = laplaceTransformIntervalIterative(mixed, [-0.5, 0.5], [0.2, 0.3]);
  assert.ok(mLo <= mHi);
  const centerVal = pointLaplace([-1.5, 1, 0.25, 3.5], 0, 0.25);
  assert.ok(mLo <= centerVal && centerVal <= mHi);
});

test('immutability: inputs are not modified', () => {
  const samples = [
    [1, 2],
    [3, 4],
  ];
  const sInterval = [0.5, 1.5];
  const dtInterval = [0.1, 0.2];

  const samplesSnap = samples.map((iv) => [...iv]);
  const sSnap = [...sInterval];
  const dtSnap = [...dtInterval];

  laplaceTransformIntervalIterative(samples, sInterval, dtInterval);

  assert.deepStrictEqual(samples, samplesSnap);
  assert.deepStrictEqual(sInterval, sSnap);
  assert.deepStrictEqual(dtInterval, dtSnap);
});

test('edge cases: empty samples, zero samples, -0 normalization, underflow, overflow', () => {
  // Empty samples -> exact [0, 0]
  const empty = laplaceTransformIntervalIterative([], [1, 2], [0.5, 1]);
  assert.deepStrictEqual(empty, [0, 0]);
  assert.ok(Object.is(empty[0], 0) && Object.is(empty[1], 0));

  // All-zero samples -> exact [0, 0]
  const zeros = laplaceTransformIntervalIterative(
    [
      [-0, 0],
      [0, -0],
      [0, 0],
    ],
    [-10, 10],
    [0.25, 0.5],
  );
  assert.deepStrictEqual(zeros, [0, 0]);
  assert.ok(Object.is(zeros[0], 0) && Object.is(zeros[1], 0));

  // Extreme underflow: exp(-1000 * n) underflows to 0 for n >= 1, but mathematically > 0
  const [uLo, uHi] = laplaceTransformIntervalIterative(
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [1000, 1000],
    [1, 1],
  );
  assert.ok(uLo <= 1 && uHi > 1, `expected underflow upper bound > 1, got [${uLo}, ${uHi}]`);

  // Extreme overflow: exp(+1000 * n) overflows to Infinity for n >= 1
  const [oLo, oHi] = laplaceTransformIntervalIterative(
    [
      [1, 1],
      [1, 1],
    ],
    [-1000, -1000],
    [1, 1],
  );
  assert.ok(!Number.isNaN(oLo) && !Number.isNaN(oHi));
  assert.ok(oLo <= oHi && oHi === Infinity);
});

test('mathematical property: inclusion isotonicity', () => {
  const wideSamples = [
    [0.5, 2.5],
    [-1.5, 1.5],
    [0.0, 3.0],
    [-2.0, -0.5],
  ];
  const narrowSamples = [
    [1.0, 2.0],
    [-0.5, 0.5],
    [1.0, 2.0],
    [-1.5, -1.0],
  ];
  const [wLo, wHi] = laplaceTransformIntervalIterative(wideSamples, [0.2, 1.2], [0.1, 0.3]);
  const [nLo, nHi] = laplaceTransformIntervalIterative(narrowSamples, [0.5, 0.9], [0.15, 0.25]);

  assert.ok(
    wLo <= nLo && nHi <= wHi,
    `expected [${nLo}, ${nHi}] to be a subset of [${wLo}, ${wHi}]`,
  );
});

test('input validation: throws TypeError and RangeError for malformed arguments', () => {
  // Invalid samples container
  for (const bad of [null, undefined, 123, 'abc', {}, new Map()]) {
    assert.throws(() => laplaceTransformIntervalIterative(bad, [0, 1]), TypeError);
  }

  // Invalid sample element shapes / types
  assert.throws(() => laplaceTransformIntervalIterative([[1]], [0, 1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 2, 3]], [0, 1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([42], [0, 1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([['1', 2]], [0, 1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, null]], [0, 1]), TypeError);

  // Invalid sample element ranges
  assert.throws(() => laplaceTransformIntervalIterative([[NaN, 1]], [0, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[0, Infinity]], [0, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[-Infinity, 0]], [0, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[2, 1]], [0, 1]), RangeError);

  // Invalid sInterval
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], 1), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], ['0', 1]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [NaN, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [-Infinity, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [2, 1]), RangeError);

  // Invalid dtInterval
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], 0.5), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0.5]), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0.5, '1']), TypeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0.5, NaN]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0.5, Infinity]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [2, 1]), RangeError);
  // Domain violation: dtLo <= 0
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [0, 0]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([[1, 1]], [0, 1], [-0.5, 1]), RangeError);

  // Validation still runs when samples is empty
  assert.throws(() => laplaceTransformIntervalIterative([], [2, 1]), RangeError);
  assert.throws(() => laplaceTransformIntervalIterative([], [0, 1], [0, 1]), RangeError);
});

test('cross-check 1: exhaustive endpoints and pseudo-random interior point enclosure', () => {
  const samples = [
    [1.0, 1.4],
    [-0.8, 0.3],
    [0.2, 0.9],
    [-1.2, -0.4],
    [0.5, 1.1],
    [-0.3, 0.7],
  ];
  const sInterval = [-0.4, 1.2];
  const dtInterval = [0.15, 0.35];

  const [resLo, resHi] = laplaceTransformIntervalIterative(samples, sInterval, dtInterval);
  assert.ok(resLo <= resHi);

  // 1a. Check all combinations of s endpoints/midpoint, dt endpoints/midpoint, and extreme sample corners
  const sPoints = [sInterval[0], 0.5 * (sInterval[0] + sInterval[1]), sInterval[1]];
  const dtPoints = [dtInterval[0], 0.5 * (dtInterval[0] + dtInterval[1]), dtInterval[1]];
  const allLo = samples.map(([lo]) => lo);
  const allHi = samples.map(([, hi]) => hi);
  const allMid = samples.map(([lo, hi]) => 0.5 * (lo + hi));
  const altA = samples.map(([lo, hi], i) => (i % 2 === 0 ? lo : hi));
  const altB = samples.map(([lo, hi], i) => (i % 2 === 0 ? hi : lo));

  for (const s of sPoints) {
    for (const dt of dtPoints) {
      for (const fVec of [allLo, allHi, allMid, altA, altB]) {
        const val = pointLaplace(fVec, s, dt);
        assert.ok(
          resLo <= val && val <= resHi,
          `endpoint sample val=${val} escaped [${resLo}, ${resHi}] at s=${s}, dt=${dt}`,
        );
      }
    }
  }

  // 1b. Check 500 deterministic pseudo-random interior points
  const rand = createPrng(20261122);
  for (let trial = 0; trial < 500; trial += 1) {
    const s = sInterval[0] + rand() * (sInterval[1] - sInterval[0]);
    const dt = dtInterval[0] + rand() * (dtInterval[1] - dtInterval[0]);
    const fVec = samples.map(([lo, hi]) => lo + rand() * (hi - lo));
    const val = pointLaplace(fVec, s, dt);
    assert.ok(
      resLo <= val && val <= resHi,
      `interior trial ${trial}: val=${val} escaped [${resLo}, ${resHi}]`,
    );
  }
});

test('cross-check 2: exact BigInt rational enclosure for non-dyadic decimal sum at s=0', () => {
  // Construct tight intervals enclosing exact rationals 1/10, 2/10, ..., 10/10 and dt = 1/10.
  // Exact sum_{n=1}^{10} (n/10) * (1/10) = 55 / 100 = 11 / 20.
  const eps = 1e-15;
  const samples = Array.from({ length: 10 }, (_, i) => {
    const approx = (i + 1) / 10;
    return [approx - eps, approx + eps];
  });
  const dtInterval = [0.1 - eps, 0.1 + eps];

  const [resLo, resHi] = laplaceTransformIntervalIterative(samples, [0, 0], dtInterval);

  // Compare float64 bounds against exact rational 11 / 20 using BigInt
  assert.ok(
    compareFloatToRational(resLo, 11n, 20n) <= 0,
    `expected resLo=${resLo} <= 11/20`,
  );
  assert.ok(
    compareFloatToRational(resHi, 11n, 20n) >= 0,
    `expected resHi=${resHi} >= 11/20`,
  );

  // Also test exact point float64 inputs: f_n = 0.1 (actual float64 value) x 10, dt = 0.1
  // Compute exact BigInt rational value of 10 * float64(0.1) * float64(0.1)
  const r01 = float64ToExactRational(0.1);
  // (10 * num^2) / 2^(-2 * shift)
  const exactNum = 10n * r01.num * r01.num;
  const exactDen = 1n << BigInt(-2 * r01.shift);
  const pointSamples = Array.from({ length: 10 }, () => [0.1, 0.1]);
  const [pLo, pHi] = laplaceTransformIntervalIterative(pointSamples, [0, 0], [0.1, 0.1]);

  assert.ok(
    compareFloatToRational(pLo, exactNum, exactDen) <= 0,
    `expected pLo=${pLo} <= exact 10*0.1*0.1`,
  );
  assert.ok(
    compareFloatToRational(pHi, exactNum, exactDen) >= 0,
    `expected pHi=${pHi} >= exact 10*0.1*0.1`,
  );
});

test('cross-check 3: analytic Laplace transform comparison for f(t)=1 and f(t)=exp(-a*t) with fine dt', () => {
  // 3a. f(t) = 1 => analytic L{1}(s) = 1 / s
  {
    const dt = 0.001;
    const N = 20000; // T = 20, tail e^{-s*T} = e^{-40} < 1e-17
    const s = 2;
    const samples = Array.from({ length: N }, () => [1, 1]);
    const [lo, hi] = laplaceTransformIntervalIterative(samples, [s, s], [dt, dt]);

    const analytic = 1 / s; // 0.5
    const mid = 0.5 * (lo + hi);
    const discreteExact = (dt * (1 - Math.exp(-N * s * dt))) / (1 - Math.exp(-s * dt));

    // Must rigorously enclose the exact discrete Riemann sum
    assert.ok(
      lo <= discreteExact && discreteExact <= hi,
      `expected [${lo}, ${hi}] to enclose discrete sum ${discreteExact}`,
    );
    // Outward-rounded width stays very tight even over 20,000 iterations
    assert.ok(hi - lo < 1e-10, `expected tight interval width, got ${hi - lo}`);
    // Left-Riemann sum approximates continuous analytic 1/s with error ~ dt/2 = 0.0005
    assert.ok(
      Math.abs(mid - analytic) < dt,
      `expected |${mid} - ${analytic}| < ${dt}`,
    );
  }

  // 3b. f(t) = exp(-a * t) => analytic L{exp(-a*t)}(s) = 1 / (s + a)
  {
    const a = 1.5;
    const s = 2.5;
    const dt = 0.001;
    const N = 10000; // T = 10, tail e^{-(s+a)*T} = e^{-40} < 1e-17
    const eps = 1e-13;
    const samples = Array.from({ length: N }, (_, n) => {
      const val = Math.exp(-a * n * dt);
      return [Math.max(0, val * (1 - eps)), val * (1 + eps)];
    });
    const [lo, hi] = laplaceTransformIntervalIterative(samples, [s, s], [dt, dt]);

    const analytic = 1 / (s + a); // 0.25
    const mid = 0.5 * (lo + hi);
    const discreteExact =
      (dt * (1 - Math.exp(-N * (s + a) * dt))) / (1 - Math.exp(-(s + a) * dt));

    // Must enclose the exact discrete geometric sum
    assert.ok(
      lo <= discreteExact && discreteExact <= hi,
      `expected [${lo}, ${hi}] to enclose discrete sum ${discreteExact}`,
    );
    // Left-Riemann sum approximates continuous analytic 1/(s+a) within O(dt)
    assert.ok(
      Math.abs(mid - analytic) < dt,
      `expected |${mid} - ${analytic}| < ${dt}`,
    );
  }

  // 3c. f(t) = t * exp(-a * t) => analytic L{t * exp(-a*t)}(s) = 1 / (s + a)^2
  {
    const a = 1.0;
    const s = 1.0;
    const dt = 0.002;
    const N = 10000; // T = 20, tail negligible
    const samples = Array.from({ length: N }, (_, n) => {
      const t = n * dt;
      const val = t * Math.exp(-a * t);
      return [val, val];
    });
    const [lo, hi] = laplaceTransformIntervalIterative(samples, [s, s], [dt, dt]);

    const analytic = 1 / ((s + a) * (s + a)); // 0.25
    const mid = 0.5 * (lo + hi);
    const pt = pointLaplace(
      samples.map(([v]) => v),
      s,
      dt,
    );

    assert.ok(lo <= pt && pt <= hi, `expected [${lo}, ${hi}] to enclose point sum ${pt}`);
    // Since f(0) = 0, Euler-Maclaurin error is O(dt^2)
    assert.ok(
      Math.abs(mid - analytic) < 1e-5,
      `expected |${mid} - ${analytic}| < 1e-5`,
    );
  }
});
