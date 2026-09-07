export function add(a, b) {
	return a + b
}

// curvature3: curvature of a 3D parametric curve r(t) = (rx(t), ry(t), rz(t))
// via |r' x r''| / |r'|^3, using central-difference derivatives.
export function curvature3(rx, ry, rz, t, h = 1e-4) {
	const point = (fn, dt) => fn(t + dt)

	const d1 = (fn) => (point(fn, h) - point(fn, -h)) / (2 * h)
	const d2 = (fn) => (point(fn, h) - 2 * fn(t) + point(fn, -h)) / (h * h)

	const r1 = [d1(rx), d1(ry), d1(rz)]
	const r2 = [d2(rx), d2(ry), d2(rz)]

	const cross = [
		r1[1] * r2[2] - r1[2] * r2[1],
		r1[2] * r2[0] - r1[0] * r2[2],
		r1[0] * r2[1] - r1[1] * r2[0],
	]

	const crossNorm = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
	const r1Norm = Math.sqrt(r1[0] ** 2 + r1[1] ** 2 + r1[2] ** 2)

	return crossNorm / r1Norm ** 3
}
