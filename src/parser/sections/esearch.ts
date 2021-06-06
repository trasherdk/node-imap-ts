import { parseExpr } from "./common";

export function parseESearch(text, literals) {
	const r = parseExpr(text.toUpperCase().replace("UID", ""), literals);
	const attrs = {};

	// RFC4731 unfortunately is lacking on documentation, so we're going to
	// assume that the response text always begins with (TAG "A123") and skip that
	// part ...

	for (let i = 1, len = r.length, key, val; i < len; i += 2) {
		key = r[i].toLowerCase();
		val = r[i + 1];
		if (key === "all") {
			val = val.toString().split(",");
		}
		attrs[key] = val;
	}

	return attrs;
}
