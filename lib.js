export function add(a, b) {
	return a + b
}

export function nelderMead2D(f, x0, y0, maxIter = 500, tol = 1e-8) {
	if (typeof f !== 'function') {
		throw new TypeError('Objective function f must be a function')
	}
	if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
		throw new TypeError('Initial coordinates x0 and y0 must be finite numbers')
	}
	if (maxIter <= 0) {
		return { x: x0, y: y0, fx: f(x0, y0) }
	}

	const alpha = 1
	const gamma = 2
	const rho = 0.5
	const sigma = 0.5

	const stepX = Math.max(Math.abs(x0) * 0.05, 0.05)
	const stepY = Math.max(Math.abs(y0) * 0.05, 0.05)

	const simplex = [
		{ x: x0, y: y0, fx: f(x0, y0) },
		{ x: x0 + stepX, y: y0, fx: f(x0 + stepX, y0) },
		{ x: x0, y: y0 + stepY, fx: f(x0, y0 + stepY) },
	]

	for (let iter = 0; iter < maxIter; iter++) {
		simplex.sort((a, b) => a.fx - b.fx)
		const [v0, v1, v2] = simplex

		const fSpread = Math.abs(v2.fx - v0.fx)
		const xSpread = Math.max(
			Math.hypot(v1.x - v0.x, v1.y - v0.y),
			Math.hypot(v2.x - v0.x, v2.y - v0.y),
		)
		if (fSpread <= tol && xSpread <= tol) {
			break
		}

		// Centroid of the two best vertices
		const cx = (v0.x + v1.x) * 0.5
		const cy = (v0.y + v1.y) * 0.5

		// Reflection
		const xr = cx + alpha * (cx - v2.x)
		const yr = cy + alpha * (cy - v2.y)
		const fr = f(xr, yr)

		if (fr < v0.fx) {
			// Expansion
			const xe = cx + gamma * (xr - cx)
			const ye = cy + gamma * (yr - cy)
			const fe = f(xe, ye)
			simplex[2] = fe < fr ? { x: xe, y: ye, fx: fe } : { x: xr, y: yr, fx: fr }
		} else if (fr < v1.fx) {
			simplex[2] = { x: xr, y: yr, fx: fr }
		} else {
			let shouldShrink = false
			if (fr < v2.fx) {
				// Outside contraction
				const xc = cx + rho * (xr - cx)
				const yc = cy + rho * (yr - cy)
				const fc = f(xc, yc)
				if (fc <= fr) {
					simplex[2] = { x: xc, y: yc, fx: fc }
				} else {
					shouldShrink = true
				}
			} else {
				// Inside contraction
				const xc = cx + rho * (v2.x - cx)
				const yc = cy + rho * (v2.y - cy)
				const fc = f(xc, yc)
				if (fc < v2.fx) {
					simplex[2] = { x: xc, y: yc, fx: fc }
				} else {
					shouldShrink = true
				}
			}

			if (shouldShrink) {
				const x1 = v0.x + sigma * (v1.x - v0.x)
				const y1 = v0.y + sigma * (v1.y - v0.y)
				const x2 = v0.x + sigma * (v2.x - v0.x)
				const y2 = v0.y + sigma * (v2.y - v0.y)
				simplex[1] = { x: x1, y: y1, fx: f(x1, y1) }
				simplex[2] = { x: x2, y: y2, fx: f(x2, y2) }
			}
		}
	}

	simplex.sort((a, b) => a.fx - b.fx)
	const best = simplex[0]
	return { x: best.x, y: best.y, fx: best.fx }
}
