import { parseExpr } from "./common";
import { parseFetchEnvelope } from "./fetch";

export function parseBodyStructure(cur, literals, prefix, partID) {
	let ret = [];
	let i;
	let len;
	if (prefix === undefined) {
		const result = Array.isArray(cur) ? cur : parseExpr(cur, literals);
		if (result.length) {
			ret = parseBodyStructure(result, literals, "", 1);
		}
	} else {
		let part;
		let partLen = cur.length;
		let next;
		if (Array.isArray(cur[0])) {
			// multipart
			next = -1;
			while (Array.isArray(cur[++next])) {
				ret.push(
					parseBodyStructure(
						cur[next],
						literals,
						prefix +
							(prefix !== "" ? "." : "") +
							(partID++).toString(),
						1,
					),
				);
			}
			part = { type: cur[next++].toLowerCase() };
			if (partLen > next) {
				if (Array.isArray(cur[next])) {
					part.params = {};
					for (i = 0, len = cur[next].length; i < len; i += 2) {
						part.params[cur[next][i].toLowerCase()] =
							cur[next][i + 1];
					}
				} else {
					part.params = cur[next];
				}
				++next;
			}
		} else {
			// single part
			next = 7;
			if (typeof cur[1] === "string") {
				part = {
					// the path identifier for this part, useful for fetching specific
					// parts of a message
					partID: prefix !== "" ? prefix : "1",

					// required fields as per RFC 3501 -- null or otherwise
					description: cur[4],
					encoding: cur[5],
					id: cur[3],
					params: null,
					size: cur[6],
					subtype: cur[1].toLowerCase(),
					type: cur[0].toLowerCase(),
				};
			} else {
				// type information for malformed multipart body
				part = {
					params: null,
					type: cur[0] ? cur[0].toLowerCase() : null,
				};
				cur.splice(1, 0, null);
				++partLen;
				next = 2;
			}
			if (Array.isArray(cur[2])) {
				part.params = {};
				for (i = 0, len = cur[2].length; i < len; i += 2) {
					part.params[cur[2][i].toLowerCase()] = cur[2][i + 1];
				}
				if (cur[1] === null) {
					++next;
				}
			}
			if (part.type === "message" && part.subtype === "rfc822") {
				// envelope
				if (partLen > next && Array.isArray(cur[next])) {
					part.envelope = parseFetchEnvelope(cur[next]);
				} else {
					part.envelope = null;
				}
				++next;

				// body
				if (partLen > next && Array.isArray(cur[next])) {
					part.body = parseBodyStructure(
						cur[next],
						literals,
						prefix,
						1,
					);
				} else {
					part.body = null;
				}
				++next;
			}
			if (
				(part.type === "text" ||
					(part.type === "message" && part.subtype === "rfc822")) &&
				partLen > next
			) {
				part.lines = cur[next++];
			}
			if (typeof cur[1] === "string" && partLen > next) {
				part.md5 = cur[next++];
			}
		}
		// add any extra fields that may or may not be omitted entirely
		parseStructExtra(part, partLen, cur, next);
		ret.unshift(part);
	}
	return ret;
}

export function parseStructExtra(part, partLen, cur, next) {
	if (partLen > next) {
		// disposition
		// null or a special k/v list with these kinds of values:
		// e.g.: ['Foo', null]
		//       ['Foo', ['Bar', 'Baz']]
		//       ['Foo', ['Bar', 'Baz', 'Bam', 'Pow']]
		const disposition = { type: null, params: null };
		if (Array.isArray(cur[next])) {
			disposition.type = cur[next][0];
			if (Array.isArray(cur[next][1])) {
				disposition.params = {};
				for (
					let i = 0, len = cur[next][1].length, key;
					i < len;
					i += 2
				) {
					key = cur[next][1][i].toLowerCase();
					disposition.params[key] = cur[next][1][i + 1];
				}
			}
		} else if (cur[next] !== null) {
			disposition.type = cur[next];
		}

		if (disposition.type === null) {
			part.disposition = null;
		} else {
			part.disposition = disposition;
		}

		++next;
	}
	if (partLen > next) {
		// language can be a string or a list of one or more strings, so let's
		// make this more consistent ...
		if (cur[next] !== null) {
			part.language = Array.isArray(cur[next]) ? cur[next] : [cur[next]];
		} else {
			part.language = null;
		}
		++next;
	}
	if (partLen > next) {
		part.location = cur[next++];
	}
	if (partLen > next) {
		// extension stuff introduced by later RFCs
		// this can really be any value: a string, number, or (un)nested list
		// let's not parse it for now ...
		part.extensions = cur[next];
	}
}
