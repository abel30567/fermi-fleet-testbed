export function add(a, b) {
	return a + b
}

// Unit normal of a parametric planar curve (rx(t), ry(t)) at parameter t.
// The tangent is estimated via central difference with step h, then rotated
// 90deg counterclockwise: (dx, dy) -> (-dy, dx). For a counterclockwise curve
// (e.g. the unit circle rx=cos, ry=sin), this convention points inward,
// toward the center.
export function unitNormal2(rx, ry, t, h = 1e-4) {
	const dx = (rx(t + h) - rx(t - h)) / (2 * h)
	const dy = (ry(t + h) - ry(t - h)) / (2 * h)
	const len = Math.hypot(dx, dy)
	const nx = -dy / len
	const ny = dx / len
	return [nx, ny]
}
