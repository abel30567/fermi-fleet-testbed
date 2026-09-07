export function add(a, b) {
	return a + b
}

export function lerp3(p, q, s) {
	return {
		x: p.x + (q.x - p.x) * s,
		y: p.y + (q.y - p.y) * s,
		z: p.z + (q.z - p.z) * s,
	}
}
