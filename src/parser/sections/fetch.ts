import { Readable as ReadableStream } from "stream";

import { EMPTY_READCB } from "../constants";
import { decodeWords } from "../encoding";
import { RE_BODYINLINEKEY } from "../matchers";
import { parseBodyStructure } from "./body";
import { parseExpr } from "./common";

export function parseFetch(text, literals, seqno) {
	const list = parseExpr(text, literals)[0];
	const attrs = {};
	let m;
	let body;
	// list is [KEY1, VAL1, KEY2, VAL2, .... KEYn, VALn]
	for (let i = 0, len = list.length, key, val; i < len; i += 2) {
		key = list[i].toLowerCase();
		val = list[i + 1];
		if (key === "envelope") {
			val = parseFetchEnvelope(val);
		} else if (key === "internaldate") {
			val = new Date(val);
		} else if (key === "modseq") {
			// always a list of one value
			val = "" + val[0];
		} else if (key === "body" || key === "bodystructure") {
			val = parseBodyStructure(val);
		} else if ((m = RE_BODYINLINEKEY.exec(list[i]))) {
			// a body was sent as a non-literal
			val = Buffer.from("" + val);
			body = new ReadableStream();
			body._readableState.sync = false;
			body._read = EMPTY_READCB;
			this.emit("body", body, {
				seqno,
				size: val.length,
				which: m[1],
			});
			body.push(val);
			body.push(null);
			continue;
		}
		attrs[key] = val;
	}
	return attrs;
}

export function parseFetchEnvelope(list) {
	return {
		bcc: parseEnvelopeAddresses(list[7]),
		cc: parseEnvelopeAddresses(list[6]),
		date: new Date(list[0]),
		from: parseEnvelopeAddresses(list[2]),
		inReplyTo: list[8],
		messageId: list[9],
		replyTo: parseEnvelopeAddresses(list[4]),
		sender: parseEnvelopeAddresses(list[3]),
		subject: decodeWords(list[1]),
		to: parseEnvelopeAddresses(list[5]),
	};
}

function parseEnvelopeAddresses(list) {
	let addresses = null;
	if (Array.isArray(list)) {
		addresses = [];
		let inGroup = false;
		let curGroup;
		for (let i = 0, len = list.length, addr; i < len; ++i) {
			addr = list[i];
			if (addr[2] === null) {
				// end of group addresses
				inGroup = false;
				if (curGroup) {
					addresses.push(curGroup);
					curGroup = undefined;
				}
			} else if (addr[3] === null) {
				// start of group addresses
				inGroup = true;
				curGroup = {
					addresses: [],
					group: addr[2],
				};
			} else {
				// regular user address
				const info = {
					host: addr[3],
					mailbox: addr[2],
					name: decodeWords(addr[0]),
				};
				if (inGroup) {
					curGroup.addresses.push(info);
				} else if (!inGroup) {
					addresses.push(info);
				}
			}
			list[i] = addr;
		}
		if (inGroup) {
			// no end of group found, assume implicit end
			addresses.push(curGroup);
		}
	}
	return addresses;
}
