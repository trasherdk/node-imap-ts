import { Buffer } from "buffer";
import { EventEmitter } from "events";
import { Socket } from "net";
import * as tls from "tls";
import { imap as utf7 } from "utf7";
import { inspect, isDate } from "util";

import { parseExpr, parseHeader, Parser } from "./Parser";

const MAX_INT = 9007199254740992;
const KEEPALIVE_INTERVAL = 10000;
const MAX_IDLE_WAIT = 300000; // 5 minute
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const FETCH_ATTR_MAP = {
	BODY: "struct",
	BODYSTRUCTURE: "struct",
	ENVELOPE: "envelope",
	INTERNALDATE: "date",
	"RFC822.SIZE": "size",
};
const SPECIAL_USE_ATTRIBUTES = [
	"\\All",
	"\\Archive",
	"\\Drafts",
	"\\Flagged",
	"\\Important",
	"\\Junk",
	"\\Sent",
	"\\Trash",
];
const CRLF = "\r\n";
const RE_CMD = /^([^ ]+)(?: |$)/;
const RE_UIDCMD_HASRESULTS = /^UID (?:FETCH|SEARCH|SORT)/;
const RE_IDLENOOPRES = /^(IDLE|NOOP) /;
const RE_OPENBOX = /^EXAMINE|SELECT$/;
const RE_BODYPART = /^BODY\[/;
const RE_INVALID_KW_CHARS = /[\(\)\{\\\"\]\%\*\x00-\x20\x7F]/;
const RE_NUM_RANGE = /^(?:[\d]+|\*):(?:[\d]+|\*)$/;
const RE_BACKSLASH = /\\/g;
const RE_DBLQUOTE = /"/g;
const RE_ESCAPE = /\\\\/g;
const RE_INTEGER = /^\d+$/;

class IMAPError extends Error {
	public source: string;
}

export interface IConfig {
	authTimeout?: number;
	autotls?: "never" | "always" | "required";
	connTimeout?: number;
	host: string;
	keepalive:
		| boolean
		| { interval?: number; idleInterval?: number; forceNoop?: boolean };
	localAddres: string;
	password: string;
	port: number;
	socket?: Socket;
	socketTimeout?: number;
	tls?: boolean;
	tlsOptions?: tls.ConnectionOptions;
	user: string;
	xoauth: string;
	xoauth2: string;
}

interface ICommand<T> {
	bodyEmitter?: EventEmitter;
	cb: (...T) => void;
	cbArgs: T[];
	data?: any;
	fetchCache: any;
	fetching: string[];
	fullcmd: string;
	lines?: string[];
	literalAppendData?: any;
	type: string;
}

interface IBox {
	name: string;
	flags: string[];
	readOnly: boolean;
	uidvalidity: number;
	uidnext: number;
	permFlags: string[];
	keywords: string[];
	newKeywords: boolean;
	persistentUIDs: boolean;
	nomodseq: boolean;
	highestmodseq?: string;
	messages: {
		total: number;
		new: number;
	};
}

interface INamespaces {
	personal: string[];
	other: string[];
	shared: string[];
}

export default class Connection extends EventEmitter {
	// END Extension methods =======================================================

	// Namespace for seqno-based commands
	get seq() {
		return {
			addKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "+", keywords }, cb);
			},
			delKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "-", keywords }, cb);
			},
			setKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "", keywords }, cb);
			},

			addFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "+", flags }, cb);
			},
			delFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "-", flags }, cb);
			},
			setFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "", flags }, cb);
			},

			copy: (seqnos, boxTo, cb) => {
				this._copy("", seqnos, boxTo, cb);
			},
			fetch: (seqnos, options) => {
				return this._fetch("", seqnos, options);
			},
			move: (seqnos, boxTo, cb) => {
				this._move("", seqnos, boxTo, cb);
			},
			search: (options, cb) => {
				this._search("", options, cb);
			},

			// Extensions ==============================================================
			addLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "+", cb);
			},
			delLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "-", cb);
			},
			setLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "", cb);
			},

			esearch: (criteria, options, cb) => {
				this._esearch("", criteria, options, cb);
			},

			sort: (sorts, options, cb) => {
				this._sort("", sorts, options, cb);
			},
			thread: (algorithm, criteria, cb) => {
				this._thread("", algorithm, criteria, cb);
			},

			addKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "+", keywords, modseq }, cb);
			},
			delKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "-", keywords, modseq }, cb);
			},
			setKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "", keywords, modseq }, cb);
			},

			addFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "+", flags, modseq }, cb);
			},
			delFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "-", flags, modseq }, cb);
			},
			setFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "", flags, modseq }, cb);
			},
		};
	}

	public static parseHeader = parseHeader; // from Parser.js

	private static getDefaultBox(): IBox {
		return {
			flags: [],
			keywords: [],
			messages: {
				new: 0,
				total: 0,
			},
			name: "",
			newKeywords: false,
			nomodseq: false,
			permFlags: [],
			persistentUIDs: true,
			readOnly: false,
			uidnext: 0,
			uidvalidity: 0,
		};
	}

	public delimiter: void | string;
	public namespaces: void | INamespaces;
	public state: "disconnected" | "connected" | "authenticated";

	private debug: (msg: string) => void;
	private box: void | IBox;
	private caps: void | string[];
	private config: IConfig;
	private curReq: void | ICommand;
	private idle: { started: void | number; enabled: boolean };
	private parser: void | Parser;
	private queue: ICommand[];
	private sock: void | Socket;
	private tagcount: number;
	private tmrAuth: void | Timeout;
	private tmrConn: void | Timeout;
	private tmrKeepalive: void | Timeout;

	private onError: (err: Error) => void;
	private onSocketTimeout: () => void;

	constructor(config: IConfig) {
		super();
		config = config || {};

		this.config = {
			authTimeout: config.authTimeout || 5000,
			autotls: config.autotls,
			connTimeout: config.connTimeout || 10000,
			host: config.host || "localhost",
			keepalive:
				config.keepalive === undefined || config.keepalive === null
					? true
					: config.keepalive,
			localAddress: config.localAddress,
			password: config.password,
			port: config.port || 143,
			socket: config.socket,
			socketTimeout: config.socketTimeout || 0,
			tls: config.tls,
			tlsOptions: config.tlsOptions,
			user: config.user,
			xoauth: config.xoauth,
			xoauth2: config.xoauth2,
		};

		this.sock = config.socket || undefined;
		this.tagcount = 0;
		this.tmrConn = undefined;
		this.tmrKeepalive = undefined;
		this.tmrAuth = undefined;
		this.queue = [];
		this.box = undefined;
		this.idle = { started: undefined, enabled: false };
		this.parser = undefined;
		this.curReq = undefined;
		this.delimiter = undefined;
		this.namespaces = undefined;
		this.state = "disconnected";
		// Fallback to no-op
		// tslint:disable-next-line:no-empty
		this.debug = config.debug || (() => {});
	}

	public connect() {
		const config = this.config;
		let socket: Socket;
		let parser: Parser;
		let tlsOptions: tls.ConnectionOptions;

		socket = config.socket || new Socket();
		socket.setKeepAlive(true);
		this.sock = undefined;
		this.tagcount = 0;
		this.tmrConn = undefined;
		this.tmrKeepalive = undefined;
		this.tmrAuth = undefined;
		this.queue = [];
		this.box = undefined;
		this.idle = { started: undefined, enabled: false };
		this.parser = undefined;
		this.curReq = undefined;
		this.delimiter = undefined;
		this.namespaces = undefined;
		this.state = "disconnected";

		if (config.tls) {
			tlsOptions = {};
			tlsOptions.host = config.host;
			// Host name may be overridden the tlsOptions
			Object.assign(tlsOptions, config.tlsOptions);
			tlsOptions.socket = socket;
		}

		const onconnect = () => {
			clearTimeout(this.tmrConn);
			this.state = "connected";
			this.debug("[connection] Connected to host");
			this.tmrAuth = setTimeout(function() {
				const err = new Error(
					"Timed out while authenticating with server",
				);
				err.source = "timeout-auth";
				this.emit("error", err);
				socket.destroy();
			}, config.authTimeout);
		};

		if (config.tls) {
			this.sock = tls.connect(tlsOptions, onconnect);
		} else {
			socket.once("connect", onconnect);
			this.sock = socket;
		}

		this.onError = (err) => {
			clearTimeout(this.tmrConn);
			clearTimeout(this.tmrAuth);
			this.debug("[connection] Error: " + err);
			err.source = "socket";
			this.emit("error", err);
		};
		this.sock.on("error", this.onError);

		this.onSocketTimeout = () => {
			clearTimeout(this.tmrConn);
			clearTimeout(this.tmrAuth);
			clearTimeout(this.tmrKeepalive);
			this.state = "disconnected";
			this.debug("[connection] Socket timeout");

			const err = new Error("Socket timed out while talking to server");
			err.source = "socket-timeout";
			this.emit("error", err);
			socket.destroy();
		};
		this.sock.on("timeout", this.onSocketTimeout);
		socket.setTimeout(config.socketTimeout);

		socket.once("close", (hadErr) => {
			clearTimeout(this.tmrConn);
			clearTimeout(this.tmrAuth);
			clearTimeout(this.tmrKeepalive);
			this.state = "disconnected";
			this.debug("[connection] Closed");
			this.emit("close", hadErr);
		});

		socket.once("end", () => {
			clearTimeout(this.tmrConn);
			clearTimeout(this.tmrAuth);
			clearTimeout(this.tmrKeepalive);
			this.state = "disconnected";
			this.debug("[connection] Ended");
			this.emit("end");
		});

		this.parser = parser = new Parser(this.sock, this.debug);

		parser.on("untagged", (info) => {
			this.resUntagged(info);
		});
		parser.on("tagged", (info) => {
			this.resTagged(info);
		});
		parser.on("body", (stream, info) => {
			let msg = this.curReq.fetchCache[info.seqno];
			let toget;

			if (msg === undefined) {
				msg = this.curReq.fetchCache[info.seqno] = {
					attrs: {},
					ended: false,
					msgEmitter: new EventEmitter(),
					toget: this.curReq.fetching.slice(0),
				};

				this.curReq.bodyEmitter.emit(
					"message",
					msg.msgEmitter,
					info.seqno,
				);
			}

			toget = msg.toget;

			// here we compare the parsed version of the expression inside BODY[]
			// because 'HEADER.FIELDS (TO FROM)' really is equivalent to
			// 'HEADER.FIELDS ("TO" "FROM")' and some servers will actually send the
			// quoted form even if the client did not use quotes
			const thisbody = parseExpr(info.which);
			for (let i = 0, len = toget.length; i < len; ++i) {
				if (_deepEqual(thisbody, toget[i])) {
					toget.splice(i, 1);
					msg.msgEmitter.emit("body", stream, info);
					return;
				}
			}
			stream.resume(); // a body we didn't ask for?
		});
		parser.on("continue", (info) => {
			const type = this.curReq.type;
			if (type === "IDLE") {
				if (
					this.queue.length &&
					this.idle.started === 0 &&
					this.curReq &&
					this.curReq.type === "IDLE" &&
					this.sock &&
					this.sock.writable &&
					!this.idle.enabled
				) {
					this.debug("=> DONE");
					this.sock.write("DONE" + CRLF);
					return;
				}
				// now idling
				this.idle.started = Date.now();
			} else if (/^AUTHENTICATE XOAUTH/.test(this.curReq.fullcmd)) {
				this.curReq.oauthError = Buffer.from(
					info.text,
					"base64",
				).toString("utf8");
				this.debug("=> " + inspect(CRLF));
				this.sock.write(CRLF);
			} else if (type === "APPEND") {
				this.sockWriteAppendData(this.curReq.appendData);
			} else if (this.curReq.lines && this.curReq.lines.length) {
				const line = this.curReq.lines.shift() + "\r\n";
				this.debug("=> " + inspect(line));
				this.sock.write(line, "binary");
			}
		});
		parser.on("other", (line) => {
			const m = RE_IDLENOOPRES.exec(line);
			if (m) {
				// no longer idling
				this.idle.enabled = false;
				this.idle.started = undefined;
				clearTimeout(this.tmrKeepalive);

				this.curReq = undefined;

				if (
					this.queue.length === 0 &&
					this.config.keepalive &&
					this.state === "authenticated" &&
					!this.idle.enabled
				) {
					this.idle.enabled = true;
					if (m[1] === "NOOP") {
						this.doKeepaliveTimer();
					} else {
						this.doKeepaliveTimer(true);
					}
				}

				this.processQueue();
			}
		});

		this.tmrConn = setTimeout(() => {
			const err = new Error("Timed out while connecting to server");
			err.source = "timeout";
			this.emit("error", err);
			socket.destroy();
		}, config.connTimeout);

		socket.connect({
			host: config.host,
			localAddress: config.localAddress,
			port: config.port,
		});
	}

	public serverSupports(cap) {
		return this.caps && this.caps.indexOf(cap) > -1;
	}

	public destroy() {
		this.queue = [];
		this.curReq = undefined;
		if (this.sock) {
			this.sock.end();
		}
	}

	public end() {
		this.enqueue("LOGOUT", () => {
			this.queue = [];
			this.curReq = undefined;
			this.sock.end();
		});
	}

	public append(data, options, cb) {
		const literal = this.serverSupports("LITERAL+");
		if (typeof options === "function") {
			cb = options;
			options = undefined;
		}
		options = options || {};
		if (!options.mailbox) {
			if (!this.box) {
				throw new Error("No mailbox specified or currently selected");
			} else {
				options.mailbox = this.box.name;
			}
		}
		let cmd = 'APPEND "' + escape(utf7.encode("" + options.mailbox)) + '"';
		if (options.flags) {
			if (!Array.isArray(options.flags)) {
				options.flags = [options.flags];
			}
			if (options.flags.length > 0) {
				for (let i = 0, len = options.flags.length; i < len; ++i) {
					if (
						options.flags[i][0] !== "$" &&
						options.flags[i][0] !== "\\"
					) {
						options.flags[i] = "\\" + options.flags[i];
					}
				}
				cmd += " (" + options.flags.join(" ") + ")";
			}
		}
		if (options.date) {
			if (!isDate(options.date)) {
				throw new Error("`date` is not a Date object");
			}
			cmd += ' "';
			cmd += options.date.getDate();
			cmd += "-";
			cmd += MONTHS[options.date.getMonth()];
			cmd += "-";
			cmd += options.date.getFullYear();
			cmd += " ";
			cmd += ("0" + options.date.getHours()).slice(-2);
			cmd += ":";
			cmd += ("0" + options.date.getMinutes()).slice(-2);
			cmd += ":";
			cmd += ("0" + options.date.getSeconds()).slice(-2);
			cmd += options.date.getTimezoneOffset() > 0 ? " -" : " +";
			cmd += ("0" + -options.date.getTimezoneOffset() / 60).slice(-2);
			cmd += ("0" + (-options.date.getTimezoneOffset() % 60)).slice(-2);
			cmd += '"';
		}
		cmd += " {";
		cmd += Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
		cmd += (literal ? "+" : "") + "}";

		this.enqueue(cmd, cb);

		if (literal) {
			this.queue[this.queue.length - 1].literalAppendData = data;
		} else {
			this.queue[this.queue.length - 1].appendData = data;
		}
	}

	public getSpecialUseBoxes(cb) {
		this.enqueue('XLIST "" "*"', cb);
	}

	public getBoxes(namespace, cb) {
		if (typeof namespace === "function") {
			cb = namespace;
			namespace = "";
		}

		namespace = escape(utf7.encode("" + namespace));

		this.enqueue('LIST "' + namespace + '" "*"', cb);
	}

	public id(identification, cb) {
		if (!this.serverSupports("ID")) {
			throw new Error("Server does not support ID");
		}
		let cmd = "ID";
		if (
			identification === null ||
			Object.keys(identification).length === 0
		) {
			cmd += " NIL";
		} else {
			if (Object.keys(identification).length > 30) {
				throw new Error("Max allowed number of keys is 30");
			}
			const kv = [];
			Object.keys(identification).forEach((k) => {
				if (Buffer.byteLength(k) > 30) {
					throw new Error("Max allowed key length is 30");
				}
				if (Buffer.byteLength(identification[k]) > 1024) {
					throw new Error("Max allowed value length is 1024");
				}
				kv.push('"' + escape(k) + '"');
				kv.push('"' + escape(identification[k]) + '"');
			});
			cmd += " (" + kv.join(" ") + ")";
		}
		this.enqueue(cmd, cb);
	}

	public openBox(name, readOnly, cb) {
		if (this.state !== "authenticated") {
			throw new Error("Not authenticated");
		}

		if (typeof readOnly === "function") {
			cb = readOnly;
			readOnly = false;
		}

		name = "" + name;
		const encname = escape(utf7.encode(name));
		let cmd = readOnly ? "EXAMINE" : "SELECT";

		cmd += ' "' + encname + '"';

		if (this.serverSupports("CONDSTORE")) {
			cmd += " (CONDSTORE)";
		}

		this.enqueue(cmd, (err) => {
			if (err) {
				this.box = undefined;
				cb(err);
			} else {
				this.box.name = name;
				cb(err, this.box);
			}
		});
	}

	public closeBox(shouldExpunge, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		}

		if (typeof shouldExpunge === "function") {
			cb = shouldExpunge;
			shouldExpunge = true;
		}

		if (shouldExpunge) {
			this.enqueue("CLOSE", (err) => {
				if (!err) {
					this.box = undefined;
				}

				cb(err);
			});
		} else {
			if (this.serverSupports("UNSELECT")) {
				// use UNSELECT if available, as it claims to be "cleaner" than the
				// alternative "hack"
				this.enqueue("UNSELECT", (err) => {
					if (!err) {
						this.box = undefined;
					}

					cb(err);
				});
			} else {
				// "HACK": close the box without expunging by attempting to SELECT a
				// non-existent mailbox
				const badbox = "NODEJSIMAPCLOSINGBOX" + Date.now();
				this.enqueue('SELECT "' + badbox + '"', (err) => {
					this.box = undefined;
					cb();
				});
			}
		}
	}

	public addBox(name, cb) {
		this.enqueue('CREATE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public delBox(name, cb) {
		this.enqueue('DELETE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public renameBox(oldname, newname, cb) {
		const encoldname = escape(utf7.encode("" + oldname));
		const encnewname = escape(utf7.encode("" + newname));

		this.enqueue(
			'RENAME "' + encoldname + '" "' + encnewname + '"',
			(err) => {
				if (err) {
					return cb(err);
				}

				if (
					this.box &&
					this.box.name === oldname &&
					oldname.toUpperCase() !== "INBOX"
				) {
					this.box.name = newname;
					cb(err, this.box);
				} else {
					cb();
				}
			},
		);
	}

	public subscribeBox(name, cb) {
		this.enqueue('SUBSCRIBE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public unsubscribeBox(name, cb) {
		this.enqueue(
			'UNSUBSCRIBE "' + escape(utf7.encode("" + name)) + '"',
			cb,
		);
	}

	public getSubscribedBoxes(namespace, cb) {
		if (typeof namespace === "function") {
			cb = namespace;
			namespace = "";
		}

		namespace = escape(utf7.encode("" + namespace));

		this.enqueue('LSUB "' + namespace + '" "*"', cb);
	}

	public status(boxName, cb) {
		if (this.box && this.box.name === boxName) {
			throw new Error("Cannot call status on currently selected mailbox");
		}

		boxName = escape(utf7.encode("" + boxName));

		let info = ["MESSAGES", "RECENT", "UNSEEN", "UIDVALIDITY", "UIDNEXT"];

		if (this.serverSupports("CONDSTORE")) {
			info.push("HIGHESTMODSEQ");
		}

		info = info.join(" ");

		this.enqueue('STATUS "' + boxName + '" (' + info + ")", cb);
	}

	public expunge(uids, cb) {
		if (typeof uids === "function") {
			cb = uids;
			uids = undefined;
		}

		if (uids !== undefined) {
			if (!Array.isArray(uids)) {
				uids = [uids];
			}
			validateUIDList(uids);

			if (uids.length === 0) {
				throw new Error("Empty uid list");
			}

			uids = uids.join(",");

			if (!this.serverSupports("UIDPLUS")) {
				throw new Error(
					"Server does not support this feature (UIDPLUS)",
				);
			}

			this.enqueue("UID EXPUNGE " + uids, cb);
		} else {
			this.enqueue("EXPUNGE", cb);
		}
	}

	public search(criteria, cb) {
		this._search("UID ", criteria, cb);
	}

	public addFlags(uids, flags, cb) {
		this.store("UID ", uids, { mode: "+", flags }, cb);
	}

	public delFlags(uids, flags, cb) {
		this.store("UID ", uids, { mode: "-", flags }, cb);
	}

	public setFlags(uids, flags, cb) {
		this.store("UID ", uids, { mode: "", flags }, cb);
	}

	public addKeywords(uids, keywords, cb) {
		this.store("UID ", uids, { mode: "+", keywords }, cb);
	}

	public delKeywords(uids, keywords, cb) {
		this.store("UID ", uids, { mode: "-", keywords }, cb);
	}

	public setKeywords(uids, keywords, cb) {
		this.store("UID ", uids, { mode: "", keywords }, cb);
	}

	public copy(uids, boxTo, cb) {
		this._copy("UID ", uids, boxTo, cb);
	}

	public move(uids, boxTo, cb) {
		this._move("UID ", uids, boxTo, cb);
	}

	public fetch(uids, options) {
		return this._fetch("UID ", uids, options);
	}

	// Extension methods ===========================================================
	public setLabels(uids, labels, cb) {
		this.storeLabels("UID ", uids, labels, "", cb);
	}

	public addLabels(uids, labels, cb) {
		this.storeLabels("UID ", uids, labels, "+", cb);
	}

	public delLabels(uids, labels, cb) {
		this.storeLabels("UID ", uids, labels, "-", cb);
	}

	public sort(sorts, criteria, cb) {
		this._sort("UID ", sorts, criteria, cb);
	}

	public esearch(criteria, options, cb) {
		this._esearch("UID ", criteria, options, cb);
	}

	public setQuota(quotaRoot, limits, cb) {
		if (typeof limits === "function") {
			cb = limits;
			limits = {};
		}

		let triplets = "";
		Object.keys(limits).forEach((l) => {
			if (triplets) {
				triplets += " ";
			}
			triplets += l + " " + limits[l];
		});

		quotaRoot = escape(utf7.encode("" + quotaRoot));

		this.enqueue(
			'SETQUOTA "' + quotaRoot + '" (' + triplets + ")",
			(err, quotalist) => {
				if (err) {
					return cb(err);
				}

				cb(err, quotalist ? quotalist[0] : limits);
			},
		);
	}

	public getQuota(quotaRoot, cb) {
		quotaRoot = escape(utf7.encode("" + quotaRoot));

		this.enqueue('GETQUOTA "' + quotaRoot + '"', (err, quotalist) => {
			if (err) {
				return cb(err);
			}

			cb(err, quotalist[0]);
		});
	}

	public getQuotaRoot(boxName, cb) {
		boxName = escape(utf7.encode("" + boxName));

		this.enqueue('GETQUOTAROOT "' + boxName + '"', (err, quotalist) => {
			if (err) {
				return cb(err);
			}

			const quotas = {};
			if (quotalist) {
				for (let i = 0, len = quotalist.length; i < len; ++i) {
					quotas[quotalist[i].root] = quotalist[i].resources;
				}
			}

			cb(err, quotas);
		});
	}

	public thread(algorithm, criteria, cb) {
		this._thread("UID ", algorithm, criteria, cb);
	}

	public addFlagsSince(uids, flags, modseq, cb) {
		this.store("UID ", uids, { mode: "+", flags, modseq }, cb);
	}

	public delFlagsSince(uids, flags, modseq, cb) {
		this.store("UID ", uids, { mode: "-", flags, modseq }, cb);
	}

	public setFlagsSince(uids, flags, modseq, cb) {
		this.store("UID ", uids, { mode: "", flags, modseq }, cb);
	}

	public addKeywordsSince(uids, keywords, modseq, cb) {
		this.store("UID ", uids, { mode: "+", keywords, modseq }, cb);
	}

	public delKeywordsSince(uids, keywords, modseq, cb) {
		this.store("UID ", uids, { mode: "-", keywords, modseq }, cb);
	}

	public setKeywordsSince(uids, keywords, modseq, cb) {
		this.store("UID ", uids, { mode: "", keywords, modseq }, cb);
	}

	private _search(which, criteria, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		} else if (!Array.isArray(criteria)) {
			throw new Error("Expected array for search criteria");
		}

		let cmd = which + "SEARCH";
		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let lines;
		if (info.hasUTF8) {
			cmd += " CHARSET UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}
		cmd += query;
		this.enqueue(cmd, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private store(which, uids, cfg, cb) {
		const mode = cfg.mode;
		const isFlags = cfg.flags !== undefined;
		let items = isFlags ? cfg.flags : cfg.keywords;
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		} else if (uids === undefined) {
			throw new Error("No messages specified");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new Error(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		if (
			(!Array.isArray(items) && typeof items !== "string") ||
			(Array.isArray(items) && items.length === 0)
		) {
			throw new Error(
				(isFlags ? "Flags" : "Keywords") +
					" argument must be a string or a non-empty Array",
			);
		}
		if (!Array.isArray(items)) {
			items = [items];
		}
		for (let i = 0, len = items.length; i < len; ++i) {
			if (isFlags) {
				if (items[i][0] !== "\\") {
					items[i] = "\\" + items[i];
				}
			} else {
				// keyword contains any char except control characters (%x00-1F and %x7F)
				// and: '(', ')', '{', ' ', '%', '*', '\', '"', ']'
				if (RE_INVALID_KW_CHARS.test(items[i])) {
					throw new Error(
						'The keyword "' +
							items[i] +
							'" contains invalid characters',
					);
				}
			}
		}

		items = items.join(" ");
		uids = uids.join(",");

		let modifiers = "";
		if (cfg.modseq !== undefined && !this.box.nomodseq) {
			modifiers += "UNCHANGEDSINCE " + cfg.modseq + " ";
		}

		this.enqueue(
			which +
				"STORE " +
				uids +
				" " +
				modifiers +
				mode +
				"FLAGS.SILENT (" +
				items +
				")",
			cb,
		);
	}

	private _copy(which, uids, boxTo, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new Error(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		boxTo = escape(utf7.encode("" + boxTo));

		this.enqueue(which + "COPY " + uids.join(",") + ' "' + boxTo + '"', cb);
	}

	private _move(which, uids, boxTo, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		}

		if (this.serverSupports("MOVE")) {
			if (!Array.isArray(uids)) {
				uids = [uids];
			}
			validateUIDList(uids);

			if (uids.length === 0) {
				throw new Error(
					"Empty " +
						(which === "" ? "sequence number" : "uid") +
						"list",
				);
			}

			uids = uids.join(",");
			boxTo = escape(utf7.encode("" + boxTo));

			this.enqueue(which + "MOVE " + uids + ' "' + boxTo + '"', cb);
		} else if (
			this.box.permFlags.indexOf("\\Deleted") === -1 &&
			this.box.flags.indexOf("\\Deleted") === -1
		) {
			throw new Error(
				"Cannot move message: " +
					"server does not allow deletion of messages",
			);
		} else {
			let deletedUIDs;
			let task = 0;
			const ccb = (err, info) => {
				if (err) {
					return cb(err, info);
				}

				if (task === 0 && which && this.serverSupports("UIDPLUS")) {
					// UIDPLUS gives us a 'UID EXPUNGE n' command to expunge a subset of
					// messages with the \Deleted flag set. This allows us to skip some
					// actions.
					task = 2;
				}
				// Make sure we don't expunge any messages marked as Deleted except the
				// one we are moving
				if (task === 0) {
					this.search(["DELETED"], (e, result) => {
						++task;
						deletedUIDs = result;
						ccb(e, info);
					});
				} else if (task === 1) {
					if (deletedUIDs.length) {
						this.delFlags(deletedUIDs, "\\Deleted", (e) => {
							++task;
							ccb(e, info);
						});
					} else {
						++task;
						ccb(err, info);
					}
				} else if (task === 2) {
					const cbMarkDel = (e) => {
						++task;
						ccb(e, info);
					};
					if (which) {
						this.addFlags(uids, "\\Deleted", cbMarkDel);
					} else {
						this.seq.addFlags(uids, "\\Deleted", cbMarkDel);
					}
				} else if (task === 3) {
					if (which && this.serverSupports("UIDPLUS")) {
						this.expunge(uids, (e) => {
							cb(e, info);
						});
					} else {
						this.expunge((e) => {
							++task;
							ccb(e, info);
						});
					}
				} else if (task === 4) {
					if (deletedUIDs.length) {
						this.addFlags(deletedUIDs, "\\Deleted", (e) => {
							cb(e, info);
						});
					} else {
						cb(err, info);
					}
				}
			};
			this._copy(which, uids, boxTo, ccb);
		}
	}

	private _fetch(which, uids, options) {
		if (
			uids === undefined ||
			uids === null ||
			(Array.isArray(uids) && uids.length === 0)
		) {
			throw new Error("Nothing to fetch");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new Error(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		uids = uids.join(",");

		let cmd = which + "FETCH " + uids + " (";
		const fetching = [];
		let i;
		let len;
		let key;

		if (this.serverSupports("X-GM-EXT-1")) {
			fetching.push("X-GM-THRID");
			fetching.push("X-GM-MSGID");
			fetching.push("X-GM-LABELS");
		}
		if (this.serverSupports("CONDSTORE") && !this.box.nomodseq) {
			fetching.push("MODSEQ");
		}

		fetching.push("UID");
		fetching.push("FLAGS");
		fetching.push("INTERNALDATE");

		let modifiers;

		if (options) {
			modifiers = options.modifiers;
			if (options.envelope) {
				fetching.push("ENVELOPE");
			}
			if (options.struct) {
				fetching.push("BODYSTRUCTURE");
			}
			if (options.size) {
				fetching.push("RFC822.SIZE");
			}
			if (Array.isArray(options.extensions)) {
				options.extensions.forEach((extension) => {
					fetching.push(extension.toUpperCase());
				});
			}
			cmd += fetching.join(" ");
			if (options.bodies !== undefined) {
				let bodies = options.bodies;
				const prefix = options.markSeen ? "" : ".PEEK";
				if (!Array.isArray(bodies)) {
					bodies = [bodies];
				}
				for (i = 0, len = bodies.length; i < len; ++i) {
					fetching.push(parseExpr("" + bodies[i]));
					cmd += " BODY" + prefix + "[" + bodies[i] + "]";
				}
			}
		} else {
			cmd += fetching.join(" ");
		}

		cmd += ")";

		const modkeys =
			typeof modifiers === "object" ? Object.keys(modifiers) : [];
		let modstr = " (";
		for (i = 0, len = modkeys.length, key; i < len; ++i) {
			key = modkeys[i].toUpperCase();
			if (
				key === "CHANGEDSINCE" &&
				this.serverSupports("CONDSTORE") &&
				!this.box.nomodseq
			) {
				modstr += key + " " + modifiers[modkeys[i]] + " ";
			}
		}
		if (modstr.length > 2) {
			cmd += modstr.substring(0, modstr.length - 1);
			cmd += ")";
		}

		this.enqueue(cmd);
		const req = this.queue[this.queue.length - 1];
		req.fetchCache = {};
		req.fetching = fetching;
		return (req.bodyEmitter = new EventEmitter());
	}

	private storeLabels(which, uids, labels, mode, cb) {
		if (!this.serverSupports("X-GM-EXT-1")) {
			throw new Error("Server must support X-GM-EXT-1 capability");
		} else if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		} else if (uids === undefined) {
			throw new Error("No messages specified");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new Error(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		if (
			(!Array.isArray(labels) && typeof labels !== "string") ||
			(Array.isArray(labels) && labels.length === 0)
		) {
			throw new Error(
				"labels argument must be a string or a non-empty Array",
			);
		}

		if (!Array.isArray(labels)) {
			labels = [labels];
		}
		labels = labels
			.map((v) => {
				return '"' + escape(utf7.encode("" + v)) + '"';
			})
			.join(" ");

		uids = uids.join(",");

		this.enqueue(
			which +
				"STORE " +
				uids +
				" " +
				mode +
				"X-GM-LABELS.SILENT (" +
				labels +
				")",
			cb,
		);
	}

	private _sort(which, sorts, criteria, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		} else if (!Array.isArray(sorts) || !sorts.length) {
			throw new Error("Expected array with at least one sort criteria");
		} else if (!Array.isArray(criteria)) {
			throw new Error("Expected array for search criteria");
		} else if (!this.serverSupports("SORT")) {
			throw new Error("Sort is not supported on the server");
		}

		sorts = sorts.map((c) => {
			if (typeof c !== "string") {
				throw new Error(
					"Unexpected sort criteria data type. " +
						"Expected string. Got: " +
						typeof criteria,
				);
			}

			let modifier = "";
			if (c[0] === "-") {
				modifier = "REVERSE ";
				c = c.substring(1);
			}
			switch (c.toUpperCase()) {
				case "ARRIVAL":
				case "CC":
				case "DATE":
				case "FROM":
				case "SIZE":
				case "SUBJECT":
				case "TO":
					break;
				default:
					throw new Error("Unexpected sort criteria: " + c);
			}

			return modifier + c;
		});

		sorts = sorts.join(" ");

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "US-ASCII";
		let lines;
		if (info.hasUTF8) {
			charset = "UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		this.enqueue(which + "SORT (" + sorts + ") " + charset + query, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private _esearch(which, criteria, options, cb) {
		if (this.box === undefined) {
			throw new Error("No mailbox is currently selected");
		} else if (!Array.isArray(criteria)) {
			throw new Error("Expected array for search options");
		}

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "";
		let lines;
		if (info.hasUTF8) {
			charset = " CHARSET UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		if (typeof options === "function") {
			cb = options;
			options = "";
		} else if (!options) {
			options = "";
		}

		if (Array.isArray(options)) {
			options = options.join(" ");
		}

		this.enqueue(
			which + "SEARCH RETURN (" + options + ")" + charset + query,
			cb,
		);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private _thread(which, algorithm, criteria, cb) {
		algorithm = algorithm.toUpperCase();

		if (!this.serverSupports("THREAD=" + algorithm)) {
			throw new Error("Server does not support that threading algorithm");
		}

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "US-ASCII";
		let lines;
		if (info.hasUTF8) {
			charset = "UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		this.enqueue(which + "THREAD " + algorithm + " " + charset + query, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private resUntagged(info) {
		const type = info.type;
		let i;
		let len;
		let box;
		let attrs;
		let key;
		console.log(info);
		if (type === "bye") {
			if (this.sock) {
				this.sock.end();
			}
		} else if (type === "namespace") {
			this.namespaces = info.text;
		} else if (type === "id") {
			this.curReq.cbargs.push(info.text);
		} else if (type === "capability") {
			this.caps = info.text.map((v) => {
				return v.toUpperCase();
			});
		} else if (type === "preauth") {
			this.state = "authenticated";
		} else if (type === "sort" || type === "thread" || type === "esearch") {
			this.curReq.cbargs.push(info.text);
		} else if (type === "search") {
			if (info.text.results !== undefined) {
				// CONDSTORE-modified search results
				this.curReq.cbargs.push(info.text.results);
				this.curReq.cbargs.push(info.text.modseq);
			} else {
				this.curReq.cbargs.push(info.text);
			}
		} else if (type === "quota") {
			const cbargs = this.curReq.cbargs;
			if (!cbargs.length) {
				cbargs.push([]);
			}
			cbargs[0].push(info.text);
		} else if (type === "recent") {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				this.box.messages.new = info.num;
			}
		} else if (type === "flags") {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				this.box.flags = info.text;
			}
		} else if (type === "bad" || type === "no") {
			if (this.state === "connected" && !this.curReq) {
				clearTimeout(this.tmrConn);
				clearTimeout(this.tmrAuth);
				const err = new IMAPError(
					"Received negative welcome: " + info.text,
				);
				err.source = "protocol";
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
			}
		} else if (type === "exists") {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				const prev = this.box.messages.total;
				const now = info.num;
				this.box.messages.total = now;
				if (now > prev && this.state === "authenticated") {
					this.box.messages.new = now - prev;
					this.emit("mail", this.box.messages.new);
				}
			}
		} else if (type === "expunge") {
			if (this.box) {
				if (this.box.messages.total > 0) {
					--this.box.messages.total;
				}
				this.emit("expunge", info.num);
			}
		} else if (type === "ok") {
			if (this.state === "connected" && !this.curReq) {
				this.login();
			} else if (
				typeof info.textCode === "string" &&
				info.textCode.toUpperCase() === "ALERT"
			) {
				this.emit("alert", info.text);
			} else if (
				this.curReq &&
				info.textCode &&
				RE_OPENBOX.test(this.curReq.type)
			) {
				// we're opening a mailbox

				if (!this.box) {
					this.box = Connection.getDefaultBox();
				}

				if (info.textCode.key) {
					key = info.textCode.key.toUpperCase();
				} else {
					key = info.textCode;
				}

				if (key === "UIDVALIDITY") {
					this.box.uidvalidity = info.textCode.val;
				} else if (key === "UIDNEXT") {
					this.box.uidnext = info.textCode.val;
				} else if (key === "HIGHESTMODSEQ") {
					this.box.highestmodseq = "" + info.textCode.val;
				} else if (key === "PERMANENTFLAGS") {
					let permFlags;
					let keywords;
					this.box.permFlags = permFlags = info.textCode.val;
					const idx = this.box.permFlags.indexOf("\\*");
					if (idx > -1) {
						this.box.newKeywords = true;
						permFlags.splice(idx, 1);
					}
					this.box.keywords = keywords = permFlags.filter((f) => {
						return f[0] !== "\\";
					});
					for (i = 0, len = keywords.length; i < len; ++i) {
						permFlags.splice(permFlags.indexOf(keywords[i]), 1);
					}
				} else if (key === "UIDNOTSTICKY") {
					this.box.persistentUIDs = false;
				} else if (key === "NOMODSEQ") {
					this.box.nomodseq = true;
				}
			} else if (
				typeof info.textCode === "string" &&
				info.textCode.toUpperCase() === "UIDVALIDITY"
			) {
				this.emit("uidvalidity", info.text);
			}
		} else if (type === "list" || type === "lsub" || type === "xlist") {
			if (this.delimiter === undefined) {
				this.delimiter = info.text.delimiter;
			} else {
				if (this.curReq.cbargs.length === 0) {
					this.curReq.cbargs.push({});
				}

				box = {
					attribs: info.text.flags,
					children: null,
					delimiter: info.text.delimiter,
					parent: null,
				};

				for (i = 0, len = SPECIAL_USE_ATTRIBUTES.length; i < len; ++i) {
					if (box.attribs.indexOf(SPECIAL_USE_ATTRIBUTES[i]) > -1) {
						box.special_use_attrib = SPECIAL_USE_ATTRIBUTES[i];
					}
				}

				let name = info.text.name;
				let curChildren = this.curReq.cbargs[0];

				if (box.delimiter) {
					const path = name.split(box.delimiter);
					let parent = null;
					name = path.pop();
					for (i = 0, len = path.length; i < len; ++i) {
						if (!curChildren[path[i]]) {
							curChildren[path[i]] = {};
						}
						if (!curChildren[path[i]].children) {
							curChildren[path[i]].children = {};
						}
						parent = curChildren[path[i]];
						curChildren = curChildren[path[i]].children;
					}
					box.parent = parent;
				}
				if (curChildren[name]) {
					box.children = curChildren[name].children;
				}
				curChildren[name] = box;
			}
		} else if (type === "status") {
			box = {
				messages: {
					new: 0,
					total: 0,
					unseen: 0,
				},
				name: info.text.name,
				uidnext: 0,
				uidvalidity: 0,
			};
			attrs = info.text.attrs;

			if (attrs) {
				if (attrs.recent !== undefined) {
					box.messages.new = attrs.recent;
				}
				if (attrs.unseen !== undefined) {
					box.messages.unseen = attrs.unseen;
				}
				if (attrs.messages !== undefined) {
					box.messages.total = attrs.messages;
				}
				if (attrs.uidnext !== undefined) {
					box.uidnext = attrs.uidnext;
				}
				if (attrs.uidvalidity !== undefined) {
					box.uidvalidity = attrs.uidvalidity;
				}
				if (attrs.highestmodseq !== undefined) {
					// CONDSTORE
					box.highestmodseq = "" + attrs.highestmodseq;
				}
			}
			this.curReq.cbargs.push(box);
		} else if (type === "fetch") {
			if (/^(?:UID )?FETCH/.test(this.curReq.fullcmd)) {
				// FETCH response sent as result of FETCH request
				const msg = this.curReq.fetchCache[info.num];
				const keys = Object.keys(info.text);
				const keyslen = keys.length;
				let toget;
				let msgEmitter;
				let j;

				if (msg === undefined) {
					// simple case -- no bodies were streamed
					toget = this.curReq.fetching.slice(0);
					if (toget.length === 0) {
						return;
					}

					msgEmitter = new EventEmitter();
					attrs = {};

					this.curReq.bodyEmitter.emit(
						"message",
						msgEmitter,
						info.num,
					);
				} else {
					toget = msg.toget;
					msgEmitter = msg.msgEmitter;
					attrs = msg.attrs;
				}

				i = toget.length;
				if (i === 0) {
					if (msg && !msg.ended) {
						msg.ended = true;
						process.nextTick(() => {
							msgEmitter.emit("end");
						});
					}
					return;
				}

				if (keyslen > 0) {
					while (--i >= 0) {
						j = keyslen;
						while (--j >= 0) {
							if (keys[j].toUpperCase() === toget[i]) {
								if (!RE_BODYPART.test(toget[i])) {
									if (toget[i] === "X-GM-LABELS") {
										const labels = info.text[keys[j]];
										for (
											let k = 0, lenk = labels.length;
											k < lenk;
											++k
										) {
											labels[k] = (
												"" + labels[k]
											).replace(RE_ESCAPE, "\\");
										}
									}
									key = FETCH_ATTR_MAP[toget[i]];
									if (!key) {
										key = toget[i].toLowerCase();
									}
									attrs[key] = info.text[keys[j]];
								}
								toget.splice(i, 1);
								break;
							}
						}
					}
				}

				if (toget.length === 0) {
					if (msg) {
						msg.ended = true;
					}
					process.nextTick(() => {
						msgEmitter.emit("attributes", attrs);
						msgEmitter.emit("end");
					});
				} else if (msg === undefined) {
					this.curReq.fetchCache[info.num] = {
						attrs,
						ended: false,
						msgEmitter,
						toget,
					};
				}
			} else {
				// FETCH response sent as result of STORE request or sent unilaterally,
				// treat them as the same for now for simplicity
				this.emit("update", info.num, info.text);
			}
		}
	}

	private resTagged(info) {
		const req = this.curReq;
		let err;

		if (!req) {
			return;
		}

		this.curReq = undefined;

		if (info.type === "no" || info.type === "bad") {
			let errtext;
			if (info.text) {
				errtext = info.text;
			} else {
				errtext = req.oauthError;
			}
			err = new Error(errtext);
			err.type = info.type;
			err.textCode = info.textCode;
			err.source = "protocol";
		} else if (this.box) {
			if (req.type === "EXAMINE" || req.type === "SELECT") {
				this.box.readOnly =
					typeof info.textCode === "string" &&
					info.textCode.toUpperCase() === "READ-ONLY";
			}

			// According to RFC 3501, UID commands do not give errors for
			// non-existant user-supplied UIDs, so give the callback empty results
			// if we unexpectedly received no untagged responses.
			if (
				RE_UIDCMD_HASRESULTS.test(req.fullcmd) &&
				req.cbargs.length === 0
			) {
				req.cbargs.push([]);
			}
		}

		if (req.bodyEmitter) {
			const bodyEmitter = req.bodyEmitter;
			if (err) {
				bodyEmitter.emit("error", err);
			}
			process.nextTick(() => {
				bodyEmitter.emit("end");
			});
		} else {
			req.cbargs.unshift(err);
			if (info.textCode && info.textCode.key) {
				const key = info.textCode.key.toUpperCase();
				if (key === "APPENDUID") {
					// [uidvalidity, newUID]
					req.cbargs.push(info.textCode.val[1]);
				} else if (key === "COPYUID") {
					// [uidvalidity, sourceUIDs, destUIDs]
					req.cbargs.push(info.textCode.val[2]);
				}
			}
			if (req.cb) {
				req.cb.apply(this, req.cbargs);
			}
		}

		if (
			this.queue.length === 0 &&
			this.config.keepalive &&
			this.state === "authenticated" &&
			!this.idle.enabled
		) {
			this.idle.enabled = true;
			this.doKeepaliveTimer(true);
		}

		this.processQueue();
	}

	private doKeepaliveTimer(immediate) {
		if (!this.config.keepalive) {
			return;
		}

		const keepalive = {
			interval: KEEPALIVE_INTERVAL,
			idleInterval: MAX_IDLE_WAIT,
			forceNoop: false,
		};
		if (typeof this.config.keepalive === "object") {
			Object.assign(keepalive, this.config.keepalive);
		}

		const timerfn = () => {
			if (this.idle.enabled) {
				// unlike NOOP, IDLE is only a valid command after authenticating
				if (
					!this.serverSupports("IDLE") ||
					this.state !== "authenticated" ||
					keepalive.forceNoop
				) {
					this.enqueue("NOOP", true);
				} else {
					if (typeof this.idle.started !== "number") {
						this.idle.started = 0;
						this.enqueue("IDLE", true);
					} else if (this.idle.started > 0) {
						const timeDiff = Date.now() - this.idle.started;
						if (timeDiff >= keepalive.idleInterval) {
							this.idle.enabled = false;
							this.debug("=> DONE");
							if (this.sock) {
								this.sock.write("DONE" + CRLF);
							}
							return;
						}
					}
					this.tmrKeepalive = setTimeout(timerfn, keepalive.interval);
				}
			}
		};

		if (immediate) {
			timerfn();
		} else {
			this.tmrKeepalive = setTimeout(timerfn, keepalive.interval);
		}
	}

	private login() {
		let checkedNS = false;

		const reentry = (err?: Error) => {
			if (this.tmrAuth) {
				clearTimeout(this.tmrAuth);
			}
			if (err) {
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
				return;
			}

			// 2. Get the list of available namespaces (RFC2342)
			if (!checkedNS && this.serverSupports("NAMESPACE")) {
				checkedNS = true;
				return this.enqueue("NAMESPACE", reentry);
			}

			// 3. Get the top-level mailbox hierarchy delimiter used by the server
			this.enqueue('LIST "" ""', () => {
				this.state = "authenticated";
				this.emit("ready");
			});
		};

		// 1. Get the supported capabilities
		this.enqueue("CAPABILITY", () => {
			// No need to attempt the login sequence if we're on a PREAUTH connection.
			if (this.state === "connected") {
				let err;
				const checkCaps = (error) => {
					if (error) {
						error.source = "authentication";
						return reentry(error);
					}

					if (this.caps === undefined) {
						// Fetch server capabilities if they were not automatically
						// provided after authentication
						return this.enqueue("CAPABILITY", reentry);
					} else {
						reentry();
					}
				};

				if (
					this.serverSupports("STARTTLS") &&
					(this.config.autotls === "always" ||
						(this.config.autotls === "required" &&
							this.serverSupports("LOGINDISABLED")))
				) {
					this.starttls();
					return;
				}

				if (this.serverSupports("LOGINDISABLED")) {
					err = new Error("Logging in is disabled on this server");
					err.source = "authentication";
					return reentry(err);
				}

				let cmd;
				if (this.serverSupports("AUTH=XOAUTH") && this.config.xoauth) {
					this.caps = undefined;
					cmd = "AUTHENTICATE XOAUTH";
					// are there any servers that support XOAUTH/XOAUTH2 and not SASL-IR?
					// if (this.serverSupports('SASL-IR'))
					cmd += " " + escape(this.config.xoauth);
					this.enqueue(cmd, checkCaps);
				} else if (
					this.serverSupports("AUTH=XOAUTH2") &&
					this.config.xoauth2
				) {
					this.caps = undefined;
					cmd = "AUTHENTICATE XOAUTH2";
					// if (this.serverSupports('SASL-IR'))
					cmd += " " + escape(this.config.xoauth2);
					this.enqueue(cmd, checkCaps);
				} else if (this.config.user && this.config.password) {
					this.caps = undefined;
					this.enqueue(
						'LOGIN "' +
							escape(this.config.user) +
							'" "' +
							escape(this.config.password) +
							'"',
						checkCaps,
					);
				} else {
					err = new Error(
						"No supported authentication method(s) available. " +
							"Unable to login.",
					);
					err.source = "authentication";
					return reentry(err);
				}
			} else {
				reentry();
			}
		});
	}

	private starttls() {
		this.enqueue("STARTTLS", (err) => {
			if (err) {
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
				return;
			}

			this.caps = undefined;
			if (this.sock) {
				this.sock.removeAllListeners("error");
			}

			const tlsOptions: tls.ConnectionOptions = {};

			tlsOptions.host = this.config.host;
			// Host name may be overridden the tlsOptions
			Object.assign(tlsOptions, this.config.tlsOptions);
			if (this.sock) {
				tlsOptions.socket = this.sock;
			}

			this.sock = tls.connect(tlsOptions, () => {
				this.login();
			});

			this.sock.on("error", this.onError);
			this.sock.on("timeout", this.onSocketTimeout);
			this.sock.setTimeout(this.config.socketTimeout);

			this.parser.setStream(this.sock);
		});
	}

	private processQueue() {
		if (
			this.curReq ||
			!this.queue.length ||
			!this.sock ||
			!this.sock.writable
		) {
			return;
		}

		this.curReq = this.queue.shift();

		if (this.tagcount === MAX_INT) {
			this.tagcount = 0;
		}

		let prefix;

		if (this.curReq.type === "IDLE" || this.curReq.type === "NOOP") {
			prefix = this.curReq.type;
		} else {
			prefix = "A" + this.tagcount++;
		}

		const out = prefix + " " + this.curReq.fullcmd;
		this.debug("=> " + inspect(out));
		this.sock.write(out + CRLF, "utf8");

		if (this.curReq.literalAppendData) {
			// LITERAL+: we are appending a mesage, and not waiting for a reply
			this.sockWriteAppendData(this.curReq.literalAppendData);
		}
	}

	private sockWriteAppendData(appendData) {
		if (!this.sock) {
			return;
		}

		let val = appendData;
		if (Buffer.isBuffer(appendData)) {
			val = val.toString("utf8");
		}

		this.debug("=> " + inspect(val));
		this.sock.write(val);
		this.sock.write(CRLF);
	}

	// TODO: Function is not specific enough, but cb can be a lot of things
	private enqueue(
		fullcmd: string,
		promote: Function | boolean = false,
		cb?: Function,
	) {
		if (typeof promote === "function") {
			cb = promote;
			promote = false;
		}

		const info = {
			cb,
			cbargs: [],
			fullcmd,
			type: fullcmd.match(RE_CMD)[1],
		};

		if (promote) {
			this.queue.unshift(info);
		} else {
			this.queue.push(info);
		}

		if (!this.curReq && this.state !== "disconnected") {
			// defer until next tick for requests like APPEND and FETCH where access to
			// the request object is needed immediately after enqueueing
			process.nextTick(() => {
				this.processQueue();
			});
		} else if (
			this.curReq &&
			this.curReq.type === "IDLE" &&
			this.sock &&
			this.sock.writable &&
			this.idle.enabled
		) {
			this.idle.enabled = false;
			if (this.tmrKeepalive) {
				clearTimeout(this.tmrKeepalive);
			}
			if (this.idle.started > 0) {
				// we've seen the continuation for our IDLE
				this.debug("=> DONE");
				this.sock.write("DONE" + CRLF);
			}
		}
	}
}

// utilities -------------------------------------------------------------------

function escape(str: string) {
	return str.replace(RE_BACKSLASH, "\\\\").replace(RE_DBLQUOTE, '\\"');
}

function validateUIDList(
	uids: Array<string | number>,
	noThrow: boolean = false,
) {
	for (let i = 0, len = uids.length, intval; i < len; ++i) {
		const uid = uids[i];
		if (typeof uid === "string") {
			if (uid === "*" || uid === "*:*") {
				if (len > 1) {
					uids = ["*"];
				}
				break;
			} else if (RE_NUM_RANGE.test(uid)) {
				continue;
			}
		}
		intval = parseInt("" + uid, 10);
		if (isNaN(intval)) {
			const err = new Error(
				'UID/seqno must be an integer, "*", or a range: ' + uid,
			);
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (intval <= 0) {
			const err = new Error("UID/seqno must be greater than zero");
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (typeof uid !== "number") {
			uids[i] = intval;
		}
	}
}

function hasNonASCII(str: string) {
	for (let i = 0, len = str.length; i < len; ++i) {
		if (str.charCodeAt(i) > 0x7f) {
			return true;
		}
	}
	return false;
}

function buildString(str: string) {
	if (typeof str !== "string") {
		str = "" + str;
	}

	if (hasNonASCII(str)) {
		const buf = Buffer.from(str, "utf8");
		return "{" + buf.length + "}\r\n" + buf.toString("binary");
	} else {
		return '"' + escape(str) + '"';
	}
}

function buildSearchQuery(
	options,
	extensions,
	info,
	isOrChild: boolean = false,
) {
	let searchargs = "";
	let val;
	for (let i = 0, len = options.length; i < len; ++i) {
		let criteria = isOrChild ? options : options[i];
		let args = null;
		let modifier = isOrChild ? "" : " ";
		if (typeof criteria === "string") {
			criteria = criteria.toUpperCase();
		} else if (Array.isArray(criteria)) {
			if (criteria.length > 1) {
				args = criteria.slice(1);
			}
			if (criteria.length > 0) {
				criteria = criteria[0].toUpperCase();
			}
		} else {
			throw new Error(
				"Unexpected search option data type. " +
					"Expected string or array. Got: " +
					typeof criteria,
			);
		}
		if (criteria === "OR") {
			if (args.length !== 2) {
				throw new Error("OR must have exactly two arguments");
			}
			if (isOrChild) {
				searchargs += "OR (";
			} else {
				searchargs += " OR (";
			}
			searchargs += buildSearchQuery(args[0], extensions, info, true);
			searchargs += ") (";
			searchargs += buildSearchQuery(args[1], extensions, info, true);
			searchargs += ")";
		} else {
			if (criteria[0] === "!") {
				modifier += "NOT ";
				criteria = criteria.substr(1);
			}
			switch (criteria) {
				// -- Standard criteria --
				case "ALL":
				case "ANSWERED":
				case "DELETED":
				case "DRAFT":
				case "FLAGGED":
				case "NEW":
				case "SEEN":
				case "RECENT":
				case "OLD":
				case "UNANSWERED":
				case "UNDELETED":
				case "UNDRAFT":
				case "UNFLAGGED":
				case "UNSEEN":
					searchargs += modifier + criteria;
					break;
				case "BCC":
				case "BODY":
				case "CC":
				case "FROM":
				case "SUBJECT":
				case "TEXT":
				case "TO":
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[0]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "BEFORE":
				case "ON":
				case "SENTBEFORE":
				case "SENTON":
				case "SENTSINCE":
				case "SINCE":
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					} else if (!(args[0] instanceof Date)) {
						if (
							(args[0] = new Date(args[0])).toString() ===
							"Invalid Date"
						) {
							throw new Error(
								"Search option argument must be a Date object" +
									" or a parseable date string",
							);
						}
					}
					searchargs +=
						modifier +
						criteria +
						" " +
						args[0].getDate() +
						"-" +
						MONTHS[args[0].getMonth()] +
						"-" +
						args[0].getFullYear();
					break;
				case "KEYWORD":
				case "UNKEYWORD":
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "LARGER":
				case "SMALLER":
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					const num = parseInt(args[0], 10);
					if (isNaN(num)) {
						throw new Error(
							"Search option argument must be a number",
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "HEADER":
					if (!args || args.length !== 2) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[1]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs +=
						modifier +
						criteria +
						' "' +
						escape("" + args[0]) +
						'" ' +
						val;
					break;
				case "UID":
					if (!args) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					validateUIDList(args);
					if (args.length === 0) {
						throw new Error("Empty uid list");
					}
					searchargs += modifier + criteria + " " + args.join(",");
					break;
				// Extensions ==========================================================
				case "X-GM-MSGID": // Gmail unique message ID
				case "X-GM-THRID": // Gmail thread ID
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new Error(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					} else {
						val = "" + args[0];
						if (!RE_INTEGER.test(args[0])) {
							throw new Error("Invalid value");
						}
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "X-GM-RAW": // Gmail search syntax
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new Error(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[0]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "X-GM-LABELS": // Gmail labels
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new Error(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "MODSEQ":
					if (extensions.indexOf("CONDSTORE") === -1) {
						throw new Error(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new Error(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				default:
					// last hope it's a seqno set
					// http://tools.ietf.org/html/rfc3501#section-6.4.4
					const seqnos = args ? [criteria].concat(args) : [criteria];
					if (!validateUIDList(seqnos, true)) {
						if (seqnos.length === 0) {
							throw new Error("Empty sequence number list");
						}
						searchargs += modifier + seqnos.join(",");
					} else {
						throw new Error(
							"Unexpected search option: " + criteria,
						);
					}
			}
		}
		if (isOrChild) {
			break;
		}
	}
	return searchargs;
}

// Pulled from assert.deepEqual:
const pSlice = Array.prototype.slice;
function _deepEqual(actual, expected) {
	// 7.1. All identical values are equivalent, as determined by ===.
	if (actual === expected) {
		return true;
	} else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
		if (actual.length !== expected.length) {
			return false;
		}

		for (let i = 0; i < actual.length; i++) {
			if (actual[i] !== expected[i]) {
				return false;
			}
		}

		return true;

		// 7.2. If the expected value is a Date object, the actual value is
		// equivalent if it is also a Date object that refers to the same time.
	} else if (actual instanceof Date && expected instanceof Date) {
		return actual.getTime() === expected.getTime();

		// 7.3 If the expected value is a RegExp object, the actual value is
		// equivalent if it is also a RegExp object with the same source and
		// properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
	} else if (actual instanceof RegExp && expected instanceof RegExp) {
		return (
			actual.source === expected.source &&
			actual.global === expected.global &&
			actual.multiline === expected.multiline &&
			actual.lastIndex === expected.lastIndex &&
			actual.ignoreCase === expected.ignoreCase
		);

		// 7.4. Other pairs that do not both pass typeof value == 'object',
		// equivalence is determined by ==.
	} else if (typeof actual !== "object" && typeof expected !== "object") {
		// TODO: Figure out if this should be triple equals, or if we want to
		// allow for JS casting.
		// tslint:disable-next-line:triple-equals
		return actual == expected;

		// 7.5 For all other Object pairs, including Array objects, equivalence is
		// determined by having the same number of owned properties (as verified
		// with Object.prototype.hasOwnProperty.call), the same set of keys
		// (although not necessarily the same order), equivalent values for every
		// corresponding key, and an identical 'prototype' property. Note: this
		// accounts for both named and indexed properties on Arrays.
	} else {
		return objEquiv(actual, expected);
	}
}
function isUndefinedOrNull(value) {
	return value === null || value === undefined;
}
function isArguments(object) {
	return Object.prototype.toString.call(object) === "[object Arguments]";
}
function objEquiv(a, b) {
	let ka;
	let kb;
	let key;
	let i;
	if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
		return false;
	}
	// an identical 'prototype' property.
	if (a.prototype !== b.prototype) {
		return false;
	}
	// ~~~I've managed to break Object.keys through screwy arguments passing.
	//   Converting to array solves the problem.
	if (isArguments(a)) {
		if (!isArguments(b)) {
			return false;
		}
		a = pSlice.call(a);
		b = pSlice.call(b);
		return _deepEqual(a, b);
	}
	try {
		ka = Object.keys(a);
		kb = Object.keys(b);
	} catch (e) {
		// happens when one is a string literal and the other isn't
		return false;
	}
	// having the same number of owned properties (keys incorporates
	// hasOwnProperty)
	if (ka.length !== kb.length) {
		return false;
	}
	// the same set of keys (although not necessarily the same order),
	ka.sort();
	kb.sort();
	// ~~~cheap key test
	for (i = ka.length - 1; i >= 0; i--) {
		// TODO: Figure out if this should be triple equals, or if we want to
		// allow for JS casting.
		// tslint:disable-next-line:triple-equals
		if (ka[i] != kb[i]) {
			return false;
		}
	}
	// equivalent values for every corresponding key, and
	// ~~~possibly expensive deep test
	for (i = ka.length - 1; i >= 0; i--) {
		key = ka[i];
		if (!_deepEqual(a[key], b[key])) {
			return false;
		}
	}
	return true;
}
