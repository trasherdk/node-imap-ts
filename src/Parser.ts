import { Buffer } from "buffer";
import { EventEmitter } from "events";
import { Readable as ReadableStream } from "stream";
import { imap as utf7 } from "utf7";
import { inspect } from "util";

const CH_LF = 10;
const LITPLACEHOLDER = String.fromCharCode(0);
// tslint:disable-next-line:no-empty
const EMPTY_READCB = (n) => {};
const RE_INTEGER = /^\d+$/;
const RE_PRECEDING = /^(?:\* |A\d+ |\+ ?)/;
const RE_BODYLITERAL = /BODY\[(.*)\] \{(\d+)\}$/i;
const RE_BODYINLINEKEY = /^BODY\[(.*)\]$/i;
const RE_SEQNO = /^\* (\d+)/;
const RE_LISTCONTENT = /^\((.*)\)$/;
const RE_LITERAL = /\{(\d+)\}$/;
const RE_UNTAGGED = /^\* (?:(OK|NO|BAD|BYE|FLAGS|ID|LIST|XLIST|LSUB|SEARCH|STATUS|CAPABILITY|NAMESPACE|PREAUTH|SORT|THREAD|ESEARCH|QUOTA|QUOTAROOT)|(\d+) (EXPUNGE|FETCH|RECENT|EXISTS))(?:(?: \[([^\]]+)\])?(?: (.+))?)?$/i;
const RE_TAGGED = /^A(\d+) (OK|NO|BAD) ?(?:\[([^\]]+)\] )?(.*)$/i;
const RE_CONTINUE = /^\+(?: (?:\[([^\]]+)\] )?(.+))?$/i;
const RE_CRLF = /\r\n/g;
const RE_HDR = /^([^:]+):[ \t]?(.+)?$/;
const RE_ENCWORD = /=\?([^?*]*?)(?:\*.*?)?\?([qb])\?(.*?)\?=/gi;
const RE_ENCWORD_END = /=\?([^?*]*?)(?:\*.*?)?\?([qb])\?(.*?)\?=$/i;
const RE_ENCWORD_BEGIN = /^[ \t]=\?([^?*]*?)(?:\*.*?)?\?([qb])\?(.*?)\?=/i;
const RE_QENC = /(?:=([a-fA-F0-9]{2}))|_/g;
const RE_SEARCH_MODSEQ = /^(.+) \(MODSEQ (.+?)\)$/i;
const RE_LWS_ONLY = /^[ \t]*$/;

function encodingExists(encoding: string) {
	// From: https://nodejs.org/dist/latest-v14.x/docs/api/util.html#util_whatwg_supported_encodings
	return [
		"ibm866",
		"866",
		"cp866",
		"csibm866",
		"iso-8859-2",
		"csisolatin2",
		"iso-ir-101",
		"iso8859-2",
		"iso88592",
		"iso_8859-2",
		"iso_8859-2:1987",
		"l2",
		"latin2",
		"iso-8859-3",
		"csisolatin3",
		"iso-ir-109",
		"iso8859-3",
		"iso88593",
		"iso_8859-3",
		"iso_8859-3:1988",
		"l3",
		"latin3",
		"iso-8859-4",
		"csisolatin4",
		"iso-ir-110",
		"iso8859-4",
		"iso88594",
		"iso_8859-4",
		"iso_8859-4:1988",
		"l4",
		"latin4",
		"iso-8859-5",
		"csisolatincyrillic",
		"cyrillic",
		"iso-ir-144",
		"iso8859-5",
		"iso88595",
		"iso_8859-5",
		"iso_8859-5:1988",
		"iso-8859-6",
		"arabic",
		"asmo-708",
		"csiso88596e",
		"csiso88596i",
		"csisolatinarabic",
		"ecma-114",
		"iso-8859-6-e",
		"iso-8859-6-i",
		"iso-ir-127",
		"iso8859-6",
		"iso88596",
		"iso_8859-6",
		"iso_8859-6:1987",
		"iso-8859-7",
		"csisolatingreek",
		"ecma-118",
		"elot_928",
		"greek",
		"greek8",
		"iso-ir-126",
		"iso8859-7",
		"iso88597",
		"iso_8859-7",
		"iso_8859-7:1987",
		"sun_eu_greek",
		"iso-8859-8",
		"csiso88598e",
		"csisolatinhebrew",
		"hebrew",
		"iso-8859-8-e",
		"iso-ir-138",
		"iso8859-8",
		"iso88598",
		"iso_8859-8",
		"iso_8859-8:1988",
		"visual",
		"iso-8859-8-i",
		"csiso88598i",
		"logical",
		"iso-8859-10",
		"csisolatin6",
		"iso-ir-157",
		"iso8859-10",
		"iso885910",
		"l6",
		"latin6",
		"iso-8859-13",
		"iso8859-13",
		"iso885913",
		"iso-8859-14",
		"iso8859-14",
		"iso885914",
		"iso-8859-15",
		"csisolatin9",
		"iso8859-15",
		"iso885915",
		"iso_8859-15",
		"l9",
		"koi8-r",
		"cskoi8r",
		"koi",
		"koi8",
		"koi8_r",
		"koi8-u",
		"koi8-ru",
		"macintosh",
		"csmacintosh",
		"mac",
		"x-mac-roman",
		"windows-874",
		"dos-874",
		"iso-8859-11",
		"iso8859-11",
		"iso885911",
		"tis-620",
		"windows-1250",
		"cp1250",
		"x-cp1250",
		"windows-1251",
		"cp1251",
		"x-cp1251",
		"windows-1252",
		"ansi_x3.4-1968",
		"ascii",
		"cp1252",
		"cp819",
		"csisolatin1",
		"ibm819",
		"iso-8859-1",
		"iso-ir-100",
		"iso8859-1",
		"iso88591",
		"iso_8859-1",
		"iso_8859-1:1987",
		"l1",
		"latin1",
		"us-ascii",
		"x-cp1252",
		"windows-1253",
		"cp1253",
		"x-cp1253",
		"windows-1254",
		"cp1254",
		"csisolatin5",
		"iso-8859-9",
		"iso-ir-148",
		"iso8859-9",
		"iso88599",
		"iso_8859-9",
		"iso_8859-9:1989",
		"l5",
		"latin5",
		"x-cp1254",
		"windows-1255",
		"cp1255",
		"x-cp1255",
		"windows-1256",
		"cp1256",
		"x-cp1256",
		"windows-1257",
		"cp1257",
		"x-cp1257",
		"windows-1258",
		"cp1258",
		"x-cp1258",
		"x-mac-cyrillic",
		"x-mac-ukrainian",
		"gbk",
		"chinese",
		"csgb2312",
		"csiso58gb231280",
		"gb2312",
		"gb_2312",
		"gb_2312-80",
		"iso-ir-58",
		"x-gbk",
		"gb18030",
		"big5",
		"big5-hkscs",
		"cn-big5",
		"csbig5",
		"x-x-big5",
		"euc-jp",
		"cseucpkdfmtjapanese",
		"x-euc-jp",
		"iso-2022-jp",
		"csiso2022jp",
		"shift_jis",
		"csshiftjis",
		"ms932",
		"ms_kanji",
		"shift-jis",
		"sjis",
		"windows-31j",
		"x-sjis",
		"euc-kr",
		"cseuckr",
		"csksc56011987",
		"iso-ir-149",
		"korean",
		"ks_c_5601-1987",
		"ks_c_5601-1989",
		"ksc5601",
		"ksc_5601",
		"windows-949",
	].includes(encoding);
}

export class Parser extends EventEmitter {
	private debug: (msg: string) => void;
	private body: void | NodeJS.ReadableStream;
	private buffer: string;
	private ignoreReadable: boolean;
	private literallen: number;
	private literals: string[];
	private stream: NodeJS.ReadableStream;
	private cbReadable: () => void;

	constructor(stream: NodeJS.ReadableStream, debug: (msg: string) => void) {
		super();

		this.stream = undefined;
		this.body = undefined;
		this.literallen = 0;
		this.literals = [];
		this.buffer = "";
		this.ignoreReadable = false;
		// Fallback to no-op
		// tslint:disable-next-line:no-empty
		this.debug = debug || (() => {});

		this.cbReadable = () => {
			if (this.ignoreReadable) {
				return;
			}
			if (this.literallen > 0 && !this.body) {
				this.tryread(this.literallen);
			} else {
				this.tryread();
			}
		};

		this.setStream(stream);

		process.nextTick(this.cbReadable);
	}

	public setStream(stream: NodeJS.ReadableStream) {
		if (this.stream) {
			this.stream.removeListener("readable", this.cbReadable);
		}

		this.stream = stream;

		this.stream.on("readable", this.cbReadable);
	}

	private tryread(n?: number) {
		if (this.stream.readable) {
			const r = this.stream.read(n);
			if (r) {
				this.parse(r);
			}
		}
	}

	private parse(data: string | Buffer) {
		const datalen = data.length;
		let i = 0;
		let idxlf: number;

		if (this.literallen > 0) {
			if (this.body) {
				const body = this.body;
				if (datalen >= this.literallen) {
					const litlen = this.literallen;
					i = litlen;
					this.literallen = 0;
					this.body = undefined;
					body._read = EMPTY_READCB;
					if (datalen > litlen) {
						body.push(data.slice(0, litlen));
					} else {
						body.push(data);
					}
					body.push(null);
				} else {
					this.literallen -= datalen;
					const r = body.push(data);
					if (!r) {
						body._read = this.cbReadable;
						return;
					}
					i = datalen;
				}
			} else {
				if (datalen > this.literallen) {
					this.literals.push(data.slice(0, this.literallen));
				} else {
					this.literals.push(data);
				}
				i = this.literallen;
				this.literallen = 0;
			}
		}

		while (i < datalen) {
			idxlf = indexOfCh(data, datalen, i, CH_LF);
			if (idxlf === -1) {
				this.buffer += data.toString("utf8", i);
				break;
			} else {
				this.buffer += data.toString("utf8", i, idxlf);
				this.buffer = this.buffer.trim();
				i = idxlf + 1;

				this.debug("<= " + inspect(this.buffer));

				if (RE_PRECEDING.test(this.buffer)) {
					const firstChar = this.buffer[0];
					if (firstChar === "*") {
						this.resUntagged();
					} else if (firstChar === "A") {
						this.resTagged();
					} else if (firstChar === "+") {
						this.resContinue();
					}

					if (this.literallen > 0 && i < datalen) {
						this.ignoreReadable = true;
						// literal data included in this chunk -- put it back onto stream
						this.stream.unshift(data.slice(i));
						this.ignoreReadable = false;
						i = datalen;
						if (!this.body) {
							// check if unshifted contents satisfies non-body literal length
							this.tryread(this.literallen);
						}
					}
				} else {
					this.emit("other", this.buffer);
					this.buffer = "";
				}
			}
		}

		if (this.literallen === 0 || this.body) {
			this.tryread();
		}
	}

	private resTagged() {
		let m: RegExpExecArray;
		if ((m = RE_LITERAL.exec(this.buffer))) {
			// non-BODY literal -- buffer it
			this.buffer = this.buffer.replace(RE_LITERAL, LITPLACEHOLDER);
			this.literallen = parseInt(m[1], 10);
		} else if ((m = RE_TAGGED.exec(this.buffer))) {
			this.buffer = "";
			this.literals = [];

			this.emit("tagged", {
				tagnum: parseInt(m[1], 10),
				text: m[4],
				textCode: m[3] ? parseTextCode(m[3], this.literals) : m[3],
				type: m[2].toLowerCase(),
			});
		} else {
			this.buffer = "";
		}
	}

	private resUntagged() {
		let m: RegExpExecArray;
		if ((m = RE_BODYLITERAL.exec(this.buffer))) {
			// BODY literal -- stream it
			const which = m[1];
			const size = parseInt(m[2], 10);
			this.literallen = size;
			this.body = new ReadableStream();
			this.body._readableState.sync = false;
			this.body._read = EMPTY_READCB;
			m = RE_SEQNO.exec(this.buffer);
			this.buffer = this.buffer.replace(RE_BODYLITERAL, "");
			this.emit("body", this.body, {
				seqno: parseInt(m[1], 10),
				size,
				which,
			});
		} else if ((m = RE_LITERAL.exec(this.buffer))) {
			// non-BODY literal -- buffer it
			this.buffer = this.buffer.replace(RE_LITERAL, LITPLACEHOLDER);
			this.literallen = parseInt(m[1], 10);
		} else if ((m = RE_UNTAGGED.exec(this.buffer))) {
			this.buffer = "";
			// normal single line response

			// m[1] or m[3] = response type
			// if m[3] is set, m[2] = sequence number (for FETCH) or count
			// m[4] = response text code (optional)
			// m[5] = response text (optional)

			let type: string;
			let num: number;
			let textCode: string;
			let val: any;
			if (m[2] !== undefined) {
				num = parseInt(m[2], 10);
			}
			if (m[4] !== undefined) {
				textCode = parseTextCode(m[4], this.literals);
			}

			type = (m[1] || m[3]).toLowerCase();

			if (
				type === "flags" ||
				type === "search" ||
				type === "capability" ||
				type === "sort"
			) {
				if (m[5]) {
					if (type === "search" && RE_SEARCH_MODSEQ.test(m[5])) {
						// CONDSTORE search response
						const p = RE_SEARCH_MODSEQ.exec(m[5]);
						val = {
							modseq: p[2],
							results: p[1].split(" "),
						};
					} else {
						if (m[5][0] === "(") {
							val = RE_LISTCONTENT.exec(m[5])[1].split(" ");
						} else {
							val = m[5].split(" ");
						}

						if (type === "search" || type === "sort") {
							val = val.map((v) => {
								return parseInt(v, 10);
							});
						}
					}
				} else {
					val = [];
				}
			} else if (type === "thread") {
				if (m[5]) {
					val = parseExpr(m[5], this.literals);
				} else {
					val = [];
				}
			} else if (type === "list" || type === "lsub" || type === "xlist") {
				val = parseBoxList(m[5], this.literals);
			} else if (type === "id") {
				val = parseId(m[5], this.literals);
			} else if (type === "status") {
				val = parseStatus(m[5], this.literals);
			} else if (type === "fetch") {
				val = parseFetch.call(this, m[5], this.literals, num);
			} else if (type === "namespace") {
				val = parseNamespaces(m[5], this.literals);
			} else if (type === "esearch") {
				val = parseESearch(m[5], this.literals);
			} else if (type === "quota") {
				val = parseQuota(m[5], this.literals);
			} else if (type === "quotaroot") {
				val = parseQuotaRoot(m[5], this.literals);
			} else {
				val = m[5];
			}

			this.literals = [];

			this.emit("untagged", {
				num,
				text: val,
				textCode,
				type,
			});
		} else {
			this.buffer = "";
		}
	}

	private resContinue() {
		const m: RegExpExecArray = RE_CONTINUE.exec(this.buffer);
		let textCode: string;
		let text: string;

		this.buffer = "";

		if (!m) {
			return;
		}

		text = m[2];

		if (m[1] !== undefined) {
			textCode = parseTextCode(m[1], this.literals);
		}

		this.emit("continue", {
			text,
			textCode,
		});
	}
}

function indexOfCh(buffer, len, i, ch) {
	let r = -1;
	for (; i < len; ++i) {
		if (buffer[i] === ch) {
			r = i;
			break;
		}
	}
	return r;
}

function parseTextCode(text: string, literals: string[]) {
	const r = parseExpr(text, literals);
	if (r.length === 1) {
		return r[0];
	} else {
		return { key: r[0], val: r.length === 2 ? r[1] : r.slice(1) };
	}
}

function parseESearch(text, literals) {
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

function parseId(text, literals) {
	const r = parseExpr(text, literals);
	const id = {};
	if (r[0] === null) {
		return null;
	}
	for (let i = 0, len = r[0].length; i < len; i += 2) {
		id[r[0][i].toLowerCase()] = r[0][i + 1];
	}

	return id;
}

function parseQuota(text, literals) {
	const r = parseExpr(text, literals);
	const resources = {};

	for (let i = 0, len = r[1].length; i < len; i += 3) {
		resources[r[1][i].toLowerCase()] = {
			limit: r[1][i + 2],
			usage: r[1][i + 1],
		};
	}

	return {
		resources,
		root: r[0],
	};
}

function parseQuotaRoot(text, literals) {
	const r = parseExpr(text, literals);

	return {
		mailbox: r[0],
		roots: r.slice(1),
	};
}

function parseBoxList(text, literals) {
	const r = parseExpr(text, literals);
	return {
		delimiter: r[1],
		flags: r[0],
		name: utf7.decode("" + r[2]),
	};
}

function parseNamespaces(text, literals) {
	const r = parseExpr(text, literals);
	let i;
	let len;
	let j;
	let len2;
	let ns;
	let nsobj;
	let namespaces;
	let n;

	for (n = 0; n < 3; ++n) {
		if (r[n]) {
			namespaces = [];
			for (i = 0, len = r[n].length; i < len; ++i) {
				ns = r[n][i];
				nsobj = {
					delimiter: ns[1],
					extensions: undefined,
					prefix: ns[0],
				};
				if (ns.length > 2) {
					nsobj.extensions = {};
				}
				for (j = 2, len2 = ns.length; j < len2; j += 2) {
					nsobj.extensions[ns[j]] = ns[j + 1];
				}
				namespaces.push(nsobj);
			}
			r[n] = namespaces;
		}
	}

	return {
		other: r[1],
		personal: r[0],
		shared: r[2],
	};
}

function parseStatus(text, literals) {
	const r = parseExpr(text, literals);
	const attrs = {};
	// r[1] is [KEY1, VAL1, KEY2, VAL2, .... KEYn, VALn]
	for (let i = 0, len = r[1].length; i < len; i += 2) {
		attrs[r[1][i].toLowerCase()] = r[1][i + 1];
	}
	return {
		attrs,
		name: utf7.decode("" + r[0]),
	};
}

function parseFetch(text, literals, seqno) {
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

function parseStructExtra(part, partLen, cur, next) {
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

function parseFetchEnvelope(list) {
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

export function parseEnvelopeAddresses(list) {
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

export function parseExpr(
	o: string | { str: string },
	literals: string[],
	result?: string[],
	start: number = 0,
	useBrackets: boolean = true,
) {
	let inQuote = false;
	let lastPos = start - 1;
	let isTop = false;
	let isBody = false;
	let escaping = false;
	let val;

	if (!result) {
		result = [];
	}
	if (typeof o === "string") {
		o = { str: o };
		isTop = true;
	}
	for (let i = start, len = o.str.length; i < len; ++i) {
		if (!inQuote) {
			if (isBody) {
				if (o.str[i] === "]") {
					val = convStr(
						o.str.substring(lastPos + 1, i + 1),
						literals,
					);
					result.push(val);
					lastPos = i;
					isBody = false;
				}
			} else if (o.str[i] === '"') {
				inQuote = true;
			} else if (
				o.str[i] === " " ||
				o.str[i] === ")" ||
				(useBrackets && o.str[i] === "]")
			) {
				if (i - (lastPos + 1) > 0) {
					val = convStr(o.str.substring(lastPos + 1, i), literals);
					result.push(val);
				}
				if (
					(o.str[i] === ")" || (useBrackets && o.str[i] === "]")) &&
					!isTop
				) {
					return i;
				}
				lastPos = i;
			} else if (o.str[i] === "(" || (useBrackets && o.str[i] === "[")) {
				if (
					o.str[i] === "[" &&
					i - 4 >= start &&
					o.str.substring(i - 4, i).toUpperCase() === "BODY"
				) {
					isBody = true;
					lastPos = i - 5;
				} else {
					const innerResult = [];
					i = parseExpr(o, literals, innerResult, i + 1, useBrackets);
					lastPos = i;
					result.push(innerResult);
				}
			}
		} else if (o.str[i] === "\\") {
			escaping = !escaping;
		} else if (o.str[i] === '"') {
			if (!escaping) {
				inQuote = false;
			}
			escaping = false;
		}
		if (i + 1 === len && len - (lastPos + 1) > 0) {
			result.push(convStr(o.str.substring(lastPos + 1), literals));
		}
	}
	return isTop ? result : start;
}

function convStr(str: string, literals: string[]) {
	if (str[0] === '"') {
		str = str.substring(1, str.length - 1);
		let newstr = "";
		let isEscaping = false;
		let p = 0;
		for (let i = 0, len = str.length; i < len; ++i) {
			if (str[i] === "\\") {
				if (!isEscaping) {
					isEscaping = true;
				} else {
					isEscaping = false;
					newstr += str.substring(p, i - 1);
					p = i;
				}
			} else if (str[i] === '"') {
				if (isEscaping) {
					isEscaping = false;
					newstr += str.substring(p, i - 1);
					p = i;
				}
			}
		}
		if (p === 0) {
			return str;
		} else {
			newstr += str.substring(p);
			return newstr;
		}
	} else if (str === "NIL") {
		return null;
	} else if (RE_INTEGER.test(str)) {
		// some IMAP extensions utilize large (64-bit) integers, which JavaScript
		// can't handle natively, so we'll just keep it as a string if it's too big
		const val = parseInt(str, 10);
		return val.toString() === str ? val : str;
	} else if (literals && literals.length && str === LITPLACEHOLDER) {
		let l = literals.shift();
		if (Buffer.isBuffer(l)) {
			l = l.toString("utf8");
		}
		return l;
	}

	return str;
}

function decodeBytes(
	buf: Buffer,
	encoding: string,
	offset: number,
	mlen: number,
	pendoffset: number,
	state,
	nextBuf,
) {
	if (encodingExists(encoding)) {
		if (state.buffer !== undefined) {
			if (state.encoding === encoding && state.consecutive) {
				// concatenate buffer + current bytes in hopes of finally having
				// something that's decodable
				const newbuf = Buffer.alloc(state.buffer.length + buf.length);
				state.buffer.copy(newbuf, 0);
				buf.copy(newbuf, state.buffer.length);
				buf = newbuf;
			} else {
				// either:
				//   - the current encoded word is not separated by the previous partial
				//     encoded word by linear whitespace, OR
				//   - the current encoded word and the previous partial encoded word
				//     use different encodings
				state.buffer = state.encoding = undefined;
				state.curReplace = undefined;
			}
		}
		let ret;
		let isPartial = false;
		if (state.remainder !== undefined) {
			// use cached remainder from the previous lookahead
			ret = state.remainder;
			state.remainder = undefined;
		} else {
			try {
				ret = new TextDecoder(encoding).decode(buf);
			} catch (e) {
				if (e.message.indexOf("Seeking") === 0) {
					isPartial = true;
				}
			}
		}
		if (!isPartial && nextBuf) {
			// try to decode a lookahead buffer (current buffer + next buffer)
			// and see if it starts with the decoded value of the current buffer.
			// if not, the current buffer is partial
			let lookahead;
			const lookaheadBuf = Buffer.alloc(buf.length + nextBuf.length);
			buf.copy(lookaheadBuf);
			nextBuf.copy(lookaheadBuf, buf.length);
			try {
				lookahead = new TextDecoder(encoding).decode(lookaheadBuf);
			} catch (e) {
				// cannot decode the lookahead, do nothing
			}
			if (lookahead !== undefined) {
				if (lookahead.indexOf(ret) === 0) {
					// the current buffer is whole, cache the lookahead's remainder
					state.remainder = lookahead.substring(ret.length);
				} else {
					isPartial = true;
					ret = undefined;
				}
			}
		}
		if (ret !== undefined) {
			if (state.curReplace) {
				// we have some previous partials which were finally "satisfied" by the
				// current encoded word, so replace from the beginning of the first
				// partial to the end of the current encoded word
				state.replaces.push({
					fromOffset: state.curReplace[0].fromOffset,
					toOffset: offset + mlen,
					val: ret,
				});
				state.replaces.splice(
					state.replaces.indexOf(state.curReplace),
					1,
				);
				state.curReplace = undefined;
			} else {
				// normal case where there are no previous partials and we successfully
				// decoded a single encoded word
				state.replaces.push({
					// we ignore linear whitespace between consecutive encoded words
					fromOffset: state.consecutive ? pendoffset : offset,
					toOffset: offset + mlen,
					val: ret,
				});
			}
			state.buffer = state.encoding = undefined;
			return;
		} else if (isPartial) {
			// RFC2047 says that each decoded encoded word "MUST represent an integral
			// number of characters. A multi-octet character may not be split across
			// adjacent encoded-words." However, some MUAs appear to go against this,
			// so we join broken encoded words separated by linear white space until
			// we can successfully decode or we see a change in encoding
			state.encoding = encoding;
			state.buffer = buf;
			if (!state.curReplace) {
				state.replaces.push((state.curReplace = []));
			}
			state.curReplace.push({
				fromOffset: offset,
				toOffset: offset + mlen,
				// the value we replace this encoded word with if it doesn't end up
				// becoming part of a successful decode
				val: "\uFFFD".repeat(buf.length),
			});
			return;
		}
	}
	// in case of unexpected error or unsupported encoding, just substitute the
	// raw bytes
	state.replaces.push({
		fromOffset: offset,
		toOffset: offset + mlen,
		val: buf.toString("binary"),
	});
}

function qEncReplacer(match, byte) {
	if (match === "_") {
		return " ";
	} else {
		return String.fromCharCode(parseInt(byte, 16));
	}
}

interface ISequence {
	buf: void | Buffer;
	consecutive: boolean;
	charset: string;
	chunk: string;
	index: number;
	encoding: string;
	length: number;
	pendoffset: void | number;
}
interface IState {
	buffer: void | Buffer;
	consecutive: boolean;
	curReplace?: void | ISequence;
	encoding: void | string;
	remainder: void | undefined;
	replaces: any[];
}
function decodeWords(str: string, state?: decodeState) {
	let pendoffset = -1;

	if (!state) {
		state = {
			buffer: undefined,
			consecutive: false,
			curReplace: undefined,
			encoding: undefined,
			remainder: undefined,
			replaces: undefined,
		};
	}

	state.replaces = [];

	let bytes: Buffer;
	let m: RegExpExecArray;
	let next: ISequence;
	let i: number;
	let j: number;
	let leni: number;
	let lenj: number;
	let seq: ISequence;
	const replaces = [];
	let lastReplace = {};

	// join consecutive q-encoded words that have the same charset first
	while ((m = RE_ENCWORD.exec(str))) {
		seq = {
			buf: undefined,
			charset: m[1].toLowerCase(),
			chunk: m[3],
			consecutive:
				pendoffset > -1
					? RE_LWS_ONLY.test(str.substring(pendoffset, m.index))
					: false,
			encoding: m[2].toLowerCase(),
			index: m.index,
			length: m[0].length,
			pendoffset,
		};
		lastReplace = replaces.length && replaces[replaces.length - 1];
		if (
			seq.consecutive &&
			seq.charset === lastReplace.charset &&
			seq.encoding === lastReplace.encoding &&
			seq.encoding === "q"
		) {
			lastReplace.length += seq.length + seq.index - pendoffset;
			lastReplace.chunk += seq.chunk;
		} else {
			replaces.push(seq);
			lastReplace = seq;
		}
		pendoffset = m.index + m[0].length;
	}

	// generate replacement substrings and their positions
	for (i = 0, leni = replaces.length; i < leni; ++i) {
		m = replaces[i];
		state.consecutive = m.consecutive;
		if (m.encoding === "q") {
			// q-encoding, similar to quoted-printable
			bytes = Buffer.from(
				m.chunk.replace(RE_QENC, qEncReplacer),
				"binary",
			);
			next = undefined;
		} else {
			// base64
			bytes = m.buf || Buffer.from(m.chunk, "base64");
			next = replaces[i + 1];
			if (
				next &&
				next.consecutive &&
				next.encoding === m.encoding &&
				next.charset === m.charset
			) {
				// we use the next base64 chunk, if any, to determine the integrity
				// of the current chunk
				next.buf = Buffer.from(next.chunk, "base64");
			}
		}
		decodeBytes(
			bytes,
			m.charset,
			m.index,
			m.length,
			m.pendoffset,
			state,
			next && next.buf,
		);
	}

	// perform the actual replacements
	for (i = state.replaces.length - 1; i >= 0; --i) {
		seq = state.replaces[i];
		if (Array.isArray(seq)) {
			for (j = 0, lenj = seq.length; j < lenj; ++j) {
				str =
					str.substring(0, seq[j].fromOffset) +
					seq[j].val +
					str.substring(seq[j].toOffset);
			}
		} else {
			str =
				str.substring(0, seq.fromOffset) +
				seq.val +
				str.substring(seq.toOffset);
		}
	}

	return str;
}

export function parseHeader(str: string, noDecode: boolean = false) {
	const lines = str.split(RE_CRLF);
	let len = lines.length;
	const header: { [string]: string[] } = {};
	const state: IState = {
		buffer: undefined,
		consecutive: false,
		curReplace: undefined,
		encoding: undefined,
		remainder: undefined,
		replaces: undefined,
	};
	let m: RegExpExecArray;
	let h: string;
	let i: number;
	let val: string;

	for (i = 0; i < len; ++i) {
		if (lines[i].length === 0) {
			break;
		} // empty line separates message's header and body
		if (lines[i][0] === "\t" || lines[i][0] === " ") {
			if (!Array.isArray(header[h])) {
				continue;
			} // ignore invalid first line
			// folded header content
			val = lines[i];
			if (!noDecode) {
				if (
					RE_ENCWORD_END.test(lines[i - 1]) &&
					RE_ENCWORD_BEGIN.test(val)
				) {
					// RFC2047 says to *ignore* leading whitespace in folded header values
					// for adjacent encoded-words ...
					val = val.substring(1);
				}
			}
			header[h][header[h].length - 1] += val;
		} else {
			m = RE_HDR.exec(lines[i]);
			if (m) {
				h = m[1].toLowerCase().trim();
				if (m[2]) {
					if (header[h] === undefined) {
						header[h] = [m[2]];
					} else {
						header[h].push(m[2]);
					}
				} else {
					header[h] = [""];
				}
			} else {
				break;
			}
		}
	}
	if (!noDecode) {
		let hvs;
		Object.keys(header).forEach((hdr) => {
			hvs = header[hdr];
			for (i = 0, len = header[hdr].length; i < len; ++i) {
				hvs[i] = decodeWords(hvs[i], state);
			}
		});
	}

	return header;
}
