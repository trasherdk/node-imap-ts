// Capability Objects
//
// From the spec:
// capability-data = "CAPABILITY" *(SP capability) SP "IMAP4rev1"
//                   *(SP capability)
//                   ; Servers MUST implement the STARTTLS, AUTH=PLAIN,
//                   ; and LOGINDISABLED capabilities
//                   ; Servers which offer RFC 1730 compatibility MUST
//                   ; list "IMAP4" as the first capability.
// capability      = ("AUTH=" auth-type) / atom
//                   ; New capabilities MUST begin with "X" or be
//                   ; registered with IANA as standard or
//                   ; standards-track
import { ParsingError } from "../../errors";

export interface ICapability {
	readonly kind: string;
	readonly value: string;
	readonly fullValue: string;
	readonly isExtension: boolean;
	readonly isUnknown?: boolean;
}

const kindValueStandardCapabilityNames = [
	"AUTH",
	"CONTEXT",
	"I18NLEVEL",
	"IMAPSIEVE",
	"RIGHTS",
	"SEARCH",
	"SORT",
	"STATUS",
	"URLAUTH",
	"UTF8",
] as const;
type KindValueStandardCapabilityNames = typeof kindValueStandardCapabilityNames[number];

function isKindValueStandardCapability(
	capability: string,
): capability is KindValueStandardCapabilityNames {
	return kindValueStandardCapabilityNames.includes(
		capability as KindValueStandardCapabilityNames,
	);
}

// From: https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
const standardCapabilityNames = [
	"ACL",
	"ANNOTATE-EXPERIMENT-1",
	"APPENDLIMIT",
	"AUTH=",
	"BINARY",
	"CATENATE",
	"CHILDREN",
	"COMPRESS=DEFLATE",
	"CONDSTORE",
	"CONTEXT=SEARCH",
	"CONTEXT=SORT",
	"CONVERT",
	"CREATE-SPECIAL-USE",
	"ENABLE",
	"ESEARCH",
	"ESORT",
	"FILTERS",
	"I18NLEVEL=1",
	"I18NLEVEL=2",
	"ID",
	"IDLE",
	"IMAPSIEVE=",
	"LANGUAGE",
	"LIST-EXTENDED",
	"LIST-MYRIGHTS",
	"LIST-STATUS",
	"LITERAL+",
	"LITERAL-",
	"LOGIN-REFERRALS",
	"LOGINDISABLED",
	"MAILBOX-REFERRALS",
	"METADATA",
	"METADATA-SERVER",
	"MOVE",
	"MULTIAPPEND",
	"MULTISEARCH",
	"NAMESPACE",
	"NOTIFY",
	"OBJECTID",
	"PREVIEW",
	"QRESYNC",
	"QUOTA",
	"REPLACE",
	"RIGHTS=",
	"SASL-IR",
	"SAVEDATE",
	"SEARCH=FUZZY",
	"SEARCHRES",
	"SORT",
	"SORT=DISPLAY",
	"SPECIAL-USE",
	"STARTTLS",
	"STATUS=SIZE",
	"THREAD",
	"UIDPLUS",
	"UNAUTHENTICATE",
	"UNSELECT",
	"URL-PARTIAL",
	"URLAUTH",
	"URLAUTH=BINARY",
	"UTF8=ACCEPT",
	"UTF8=ALL",
	"UTF8=APPEND",
	"UTF8=ONLY",
	"UTF8=USER",
	"WITHIN",
] as const;
type StandardCapabilityNames = typeof standardCapabilityNames[number];

function isStandardCapability(
	capability: string,
): capability is StandardCapabilityNames {
	return standardCapabilityNames.includes(
		capability as StandardCapabilityNames,
	);
}

export class StandardCapability implements ICapability {
	public readonly kind: string;
	public readonly value: string;
	public readonly isExtension: boolean = false;

	constructor(public readonly fullValue: StandardCapabilityNames) {
		// Kind === Value === Full Value here
		this.kind = fullValue;
		this.value = fullValue;
	}
}

export class KindValueCapability implements ICapability {
	public readonly kind: string;
	public readonly value: string;
	public readonly isExtension: boolean;
	public readonly isUnknown: boolean;

	constructor(public readonly fullValue: string) {
		const [kind, ...rest] = fullValue.split("=");
		const value = rest.join("=");

		if (kind === fullValue || value === "") {
			// We don't have a value in this, so we aren't a kind/value pair
			throw new ParsingError(
				"Capability could not be split into kind/value pair",
				fullValue,
			);
		}

		// We mark this kind as unknown if we don't know about it in our list
		// of standard defined values
		this.isExtension = kind.startsWith("X");
		this.isUnknown = !isKindValueStandardCapability(kind);

		this.kind = kind;
		this.value = value;
	}
}

export class ExtensionCapability implements ICapability {
	public readonly kind: string;
	public readonly value: string;
	public readonly isExtension: boolean = true;

	constructor(public readonly fullValue: string) {
		this.kind = fullValue;
		this.value = fullValue;
	}
}

// To be spec compliant we don't really HAVE to implement this. But to
// be an actual library that exists in the real world, we should. So
// we have a type for capabilities we get that we just don't understand
export class UnknownCapability implements ICapability {
	public readonly kind: string;
	public readonly value: string;
	public readonly isExtension: boolean = false;
	public readonly isUnknown: boolean = true;

	constructor(public readonly fullValue: string) {
		this.kind = fullValue;
		this.value = fullValue;
	}
}

export function createCapabilityFromString(capabilityStr: string): ICapability {
	if (capabilityStr.includes("=")) {
		return new KindValueCapability(capabilityStr);
	} else if (capabilityStr.startsWith("X")) {
		return new ExtensionCapability(capabilityStr);
	} else if (isStandardCapability(capabilityStr)) {
		return new StandardCapability(capabilityStr);
	} else {
		return new UnknownCapability(capabilityStr);
	}
}
