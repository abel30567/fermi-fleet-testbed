/**
 * Fixed-point scaling factor (10^18).
 * A real value `r` is represented as `BigInt` `round(r * SCALE)`.
 */
export const SCALE = 10n ** 18n;

/**
 * Default finite-difference step size in fixed-point units (10^-6 in real units).
 * Balances O(h^2) central-difference truncation error against 10^-18 quantization
 * error (optimal h ≈ SCALE^(2/3) = 10^12).
 */
export const DEFAULT_STEP = 10n ** 12n;

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
  return value < 0n ? -value : value;
}

/**
 * Exact BigInt division rounded to nearest integer (half away from zero).
 * Requires a strictly positive denominator.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRound(numerator, denominator) {
  const half = denominator / 2n;
  if (numerator >= 0n) {
    return (numerator + half) / denominator;
  }
  return -((-numerator + half) / denominator);
}

/**
 * Validates that a value is a 3-element array of BigInts.
 * @param {unknown} vec
 * @param {string} label
 * @returns {[bigint, bigint, bigint]}
 */
function validateVector3(vec, label) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${label} must be an Array of 3 BigInt elements`);
  }
  if (vec.length !== 3) {
    throw new RangeError(`${label} must have length 3, received ${vec.length}`);
  }
  for (let i = 0; i < 3; i += 1) {
    if (typeof vec[i] !== 'bigint') {
      throw new TypeError(
        `${label}[${i}] must be a bigint, received ${typeof vec[i]}`,
      );
    }
  }
  return /** @type {[bigint, bigint, bigint]} */ (vec);
}

/**
 * Parses and validates optional step / refinement settings.
 * @param {bigint | { step?: bigint, iterations?: number, tolerance?: bigint } | undefined} options
 * @returns {{ step: bigint, iterations: number, tolerance: bigint }}
 */
function parseOptions(options) {
  let step = DEFAULT_STEP;
  let iterations = 1;
  let tolerance = 0n;

  if (options === undefined) {
    return { step, iterations, tolerance };
  }

  if (typeof options === 'bigint') {
    step = options;
  } else if (
    typeof options === 'object' &&
    options !== null &&
    !Array.isArray(options)
  ) {
    if (options.step !== undefined) {
      if (typeof options.step !== 'bigint') {
        throw new TypeError(
          `options.step must be a bigint, received ${typeof options.step}`,
        );
      }
      step = options.step;
    }
    if (options.iterations !== undefined) {
      if (
        typeof options.iterations !== 'number' ||
        !Number.isInteger(options.iterations)
      ) {
        throw new TypeError('options.iterations must be a positive safe integer');
      }
      if (!Number.isSafeInteger(options.iterations) || options.iterations < 1) {
        throw new RangeError(
          `options.iterations must be a positive safe integer, received ${options.iterations}`,
        );
      }
      iterations = options.iterations;
    }
    if (options.tolerance !== undefined) {
      if (typeof options.tolerance !== 'bigint') {
        throw new TypeError(
          `options.tolerance must be a bigint, received ${typeof options.tolerance}`,
        );
      }
      if (options.tolerance < 0n) {
        throw new RangeError(
          `options.tolerance must be non-negative, received ${options.tolerance}`,
        );
      }
      tolerance = options.tolerance;
    }
  } else {
    throw new TypeError(
      'options must be an options object or a positive bigint step size',
    );
  }

  if (step <= 0n) {
    throw new RangeError(`step must be a positive bigint, received ${step}`);
  }

  return { step, iterations, tolerance };
}

/**
 * Evaluates a 3D vector field at a point and validates its return vector.
 * @param {(p: [bigint, bigint, bigint]) => [bigint, bigint, bigint]} field
 * @param {[bigint, bigint, bigint]} point
 * @returns {[bigint, bigint, bigint]}
 */
function evaluateField(field, point) {
  const result = field(point);
  return validateVector3(result, 'field return value');
}

/**
 * Computes one pass of the 3D curl at `point` using central finite differences
 * with fixed-point step `h`, iterating over the three coordinate axes.
 *
 * For each axis `a` in {0, 1, 2}, evaluates:
 *   delta[a] = F(point + h * e_a) - F(point - h * e_a)
 * Then for each cyclic triple (i, j, k) in {(0,1,2), (1,2,0), (2,0,1)}:
 *   curl[i] = round(((delta[j][k] - delta[k][j]) * SCALE) / (2 * h))
 *
 * Subtracting the raw finite differences before dividing by `2 * h` avoids
 * double rounding and preserves exact zero for symmetric mixed partials.
 *
 * @param {(p: [bigint, bigint, bigint]) => [bigint, bigint, bigint]} field
 * @param {[bigint, bigint, bigint]} point
 * @param {bigint} h
 * @returns {[bigint, bigint, bigint]}
 */
function computeCurlAtStep(field, point, h) {
  /** @type {[[bigint, bigint, bigint], [bigint, bigint, bigint], [bigint, bigint, bigint]]} */
  const deltas = [
    [0n, 0n, 0n],
    [0n, 0n, 0n],
    [0n, 0n, 0n],
  ];

  for (let axis = 0; axis < 3; axis += 1) {
    /** @type {[bigint, bigint, bigint]} */
    const plusPoint = [point[0], point[1], point[2]];
    /** @type {[bigint, bigint, bigint]} */
    const minusPoint = [point[0], point[1], point[2]];
    plusPoint[axis] += h;
    minusPoint[axis] -= h;

    const fPlus = evaluateField(field, plusPoint);
    const fMinus = evaluateField(field, minusPoint);

    for (let comp = 0; comp < 3; comp += 1) {
      if (comp === axis) continue;
      deltas[axis][comp] = fPlus[comp] - fMinus[comp];
    }
  }

  const twoH = 2n * h;
  /** @type {[bigint, bigint, bigint]} */
  const curl = [0n, 0n, 0n];

  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const numerator = (deltas[j][k] - deltas[k][j]) * SCALE;
    curl[i] = divRound(numerator, twoH);
  }

  return curl;
}

/**
 * Computes the 3D curl (∇ × F) of a fixed-point BigInt vector field `F([x, y, z])`
 * at a 3D point using a straightforward iterative central finite-difference scheme.
 *
 * All coordinates and vector components are fixed-point `BigInt` values scaled by
 * `SCALE = 10n ** 18n` (so `1.0` is `1000000000000000000n`).
 *
 * Definition:
 *   (∇ × F)(x, y, z) = [
 *     ∂F_z/∂y - ∂F_y/∂z,
 *     ∂F_x/∂z - ∂F_z/∂x,
 *     ∂F_y/∂x - ∂F_x/∂y,
 *   ]
 *
 * @param {(point: [bigint, bigint, bigint]) => [bigint, bigint, bigint]} field
 *   3D vector field mapping a fixed-point `[x, y, z]` BigInt tuple to `[Fx, Fy, Fz]`.
 * @param {[bigint, bigint, bigint]} point
 *   Evaluation point `[x, y, z]` in fixed-point BigInt units (scaled by `10^18`).
 * @param {bigint | { step?: bigint, iterations?: number, tolerance?: bigint }} [options]
 *   Optional positive BigInt step size `h`, or an options object:
 *   - `step` (default `10n ** 12n`): initial finite-difference step in fixed-point units.
 *   - `iterations` (default `1`): maximum number of iterative step-halving passes (`h, h/2, ...`).
 *   - `tolerance` (default `0n`): early-stop threshold on the max component delta between consecutive passes.
 * @returns {[bigint, bigint, bigint]}
 *   The curl vector `[curlX, curlY, curlZ]` in fixed-point BigInt units (scaled by `10^18`).
 * @throws {TypeError} If `field` is not a function, vectors contain non-BigInt values, or option types are invalid.
 * @throws {RangeError} If vectors do not have length 3, or numeric options are out of range.
 *
 * @example
 * const S = 10n ** 18n;
 * const rotational = ([x, y]) => [-y, x, 0n];
 * curlBigIntIterative(rotational, [1n * S, 2n * S, 3n * S]);
 * // => [0n, 0n, 2000000000000000000n]
 */
export function curlBigIntIterative(field, point, options) {
  if (typeof field !== 'function') {
    throw new TypeError(`field must be a function, received ${typeof field}`);
  }
  const validatedPoint = validateVector3(point, 'point');
  const { step, iterations, tolerance } = parseOptions(options);

  let currentStep = step;
  /** @type {[bigint, bigint, bigint] | null} */
  let prevCurl = null;
  /** @type {[bigint, bigint, bigint]} */
  let currentCurl = [0n, 0n, 0n];

  for (let iter = 0; iter < iterations; iter += 1) {
    currentCurl = computeCurlAtStep(field, validatedPoint, currentStep);

    if (prevCurl !== null) {
      let maxDiff = 0n;
      for (let i = 0; i < 3; i += 1) {
        const diff = absBigInt(currentCurl[i] - prevCurl[i]);
        if (diff > maxDiff) {
          maxDiff = diff;
        }
      }
      if (maxDiff <= tolerance) {
        break;
      }
    }

    prevCurl = currentCurl;
    const nextStep = currentStep / 2n;
    if (nextStep < 1n) {
      break;
    }
    currentStep = nextStep;
  }

  return currentCurl;
}
