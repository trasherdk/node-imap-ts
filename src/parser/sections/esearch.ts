import { parseExpr } from "./common";

export function parseESearch(text, literals) {
	const parsed = parseExpr(text.toUpperCase().replace("UID", ""), literals);
	const attrs = {};

	// RFC4731 unfortunately is lacking on documentation, so we're going to
	// assume that the response text always begins with (TAG "A123") and skip that
	// part ...

	for (let i = 1, len = parsed.length, key, val; i < len; i += 2) {
		// We should always get a string, but convert just in case
		const key = `${parsed[i]}`.toLowerCase();
		let val = parsed[i + 1];
		if (key === "all") {
			val = val.toString().split(",");
		}
		attrs[key] = val;
	}

	return attrs;
}
