const KNOWN_FLAG_NAMES = [
	"\\Answered",
	"\\Flagged",
	"\\Deleted",
	"\\Seen",
	"\\Draft",
	"\\Recent",
];

const WILDCARD_FLAG_NAME = "\\*";

export default class Flag {
	public readonly isKnownName: boolean;
	public readonly isWildcard: boolean;

	constructor(public readonly name: string) {
		this.isKnownName = KNOWN_FLAG_NAMES.includes(name);
		this.isWildcard = name === WILDCARD_FLAG_NAME;
	}
}
