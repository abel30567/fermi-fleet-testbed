export function add(a, b) {
	return a + b
}

const GAUSS3_NODES = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)]
const GAUSS3_WEIGHTS = [5 / 9, 8 / 9, 5 / 9]

/**
 * Computes the scalar line integral ∫_C f(r(t)) |r'(t)| dt along a 2D/3D
 * (or N-dimensional) parametric curve r(t) over t in [t0, t1].
 *
 * Uses composite 3-point Gauss-Legendre quadrature with 4th-order central
 * differences for r'(t), keeping all sample points strictly inside (t0, t1).
 *
 * @param {(point: number[]) => number} f Scalar field evaluated at a point r(t)
 * @param {(t: number) => number[]} r Parametric curve returning a coordinate array
 * @param {number} t0 Start parameter
 * @param {number} t1 End parameter
 * @param {number} [n=500] Number of quadrature subintervals
 * @returns {number} Approximate value of the scalar line integral
 */
export function lineIntegralScalar(f, r, t0, t1, n = 500) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (typeof t0 !== 'number' || !Number.isFinite(t0)) {
		throw new TypeError('t0 must be a finite number')
	}
	if (typeof t1 !== 'number' || !Number.isFinite(t1)) {
		throw new TypeError('t1 must be a finite number')
	}
	if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
		throw new RangeError('n must be a positive integer')
	}
	if (t0 === t1) {
		return 0
	}

	const dt = (t1 - t0) / n
	const half = dt / 2
	let total = 0

	for (let i = 0; i < n; i++) {
		const mid = t0 + (i + 0.5) * dt
		let subSum = 0

		for (let k = 0; k < 3; k++) {
			const t = mid + half * GAUSS3_NODES[k]
			const pt = r(t)
			if (!Array.isArray(pt) || pt.length === 0) {
				throw new TypeError('r(t) must return a non-empty coordinate array')
			}

			const scale = Math.max(1, Math.abs(t))
			const distToEdge = Math.min(Math.abs(t - t0), Math.abs(t1 - t))
			const delta = Math.min(1e-4 * scale, 0.25 * distToEdge)

			const rp2 = r(t + 2 * delta)
			const rp1 = r(t + delta)
			const rm1 = r(t - delta)
			const rm2 = r(t - 2 * delta)

			let normSq = 0
			for (let j = 0; j < pt.length; j++) {
				const deriv = (-rp2[j] + 8 * rp1[j] - 8 * rm1[j] + rm2[j]) / (12 * delta)
				normSq += deriv * deriv
			}

			subSum += GAUSS3_WEIGHTS[k] * f(pt) * Math.sqrt(normSq)
		}

		total += subSum * half
	}

	return total
}
