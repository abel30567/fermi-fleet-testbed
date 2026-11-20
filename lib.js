export function add(a, b) {
	return a + b
}

export function newton2DOptimize(f, x0, y0, maxIter = 50, tol = 1e-8) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
		throw new RangeError('x0 and y0 must be finite numbers')
	}
	if (!Number.isFinite(maxIter) || maxIter < 0) {
		throw new RangeError('maxIter must be a non-negative finite number')
	}
	if (!Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('tol must be a positive finite number')
	}

	let x = x0
	let y = y0
	let fx = f(x, y)

	for (let iter = 0; iter < maxIter; iter++) {
		const hx1 = 1e-6 * Math.max(1, Math.abs(x))
		const hy1 = 1e-6 * Math.max(1, Math.abs(y))

		const gx = (f(x + hx1, y) - f(x - hx1, y)) / (2 * hx1)
		const gy = (f(x, y + hy1) - f(x, y - hy1)) / (2 * hy1)

		if (Math.hypot(gx, gy) <= tol) {
			break
		}

		const hx2 = 1e-4 * Math.max(1, Math.abs(x))
		const hy2 = 1e-4 * Math.max(1, Math.abs(y))

		const hxx = (f(x + hx2, y) - 2 * fx + f(x - hx2, y)) / (hx2 * hx2)
		const hyy = (f(x, y + hy2) - 2 * fx + f(x, y - hy2)) / (hy2 * hy2)
		const hxy =
			(f(x + hx2, y + hy2) -
				f(x + hx2, y - hy2) -
				f(x - hx2, y + hy2) +
				f(x - hx2, y - hy2)) /
			(4 * hx2 * hy2)

		let a = hxx
		let d = hyy
		let b = hxy
		let det = a * d - b * b

		// Regularize Hessian if not positive definite so step is a descent direction
		if (a <= 0 || det <= 1e-12) {
			const trace = a + d
			const disc = Math.hypot(a - d, 2 * b)
			const minEig = 0.5 * (trace - disc)
			const shift = Math.max(1e-6, -minEig + 1e-4)
			a += shift
			d += shift
			det = a * d - b * b
		}

		let dx = -(d * gx - b * gy) / det
		let dy = -(-b * gx + a * gy) / det

		let dirDeriv = gx * dx + gy * dy
		if (!Number.isFinite(dirDeriv) || dirDeriv >= 0) {
			dx = -gx
			dy = -gy
			dirDeriv = -(gx * gx + gy * gy)
		}

		// Backtracking Armijo line search starting with full Newton step
		let alpha = 1
		let nx = x + alpha * dx
		let ny = y + alpha * dy
		let nfx = f(nx, ny)
		const c1 = 1e-4

		for (let ls = 0; ls < 30; ls++) {
			if (Number.isFinite(nfx) && nfx <= fx + c1 * alpha * dirDeriv) {
				break
			}
			alpha *= 0.5
			nx = x + alpha * dx
			ny = y + alpha * dy
			nfx = f(nx, ny)
		}

		const stepNorm = Math.hypot(nx - x, ny - y)
		x = nx
		y = ny
		fx = nfx

		if (stepNorm <= tol) {
			break
		}
	}

	return { x, y, fx }
}
