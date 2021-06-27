import { OperatorToken, SPToken } from "../../lexer/tokens";
import { ParsingError } from "../../errors";
import { ILexerToken, TokenTypes } from "../../lexer/types";
import { CapabilityList } from "./capability";
import * as MailboxData from "./mailbox";
import StatusResponse from "./status";

type ContentType = CapabilityList | StatusResponse | MailboxData.ContentType;

// From spec:
// response-data   = "*" SP (resp-cond-state / resp-cond-bye /
//                   mailbox-data / message-data / capability-data) CRLF
//
// Each of those sub items is handled by another structure, so this is
// simply our wrapper
//   StatusResponse     === resp-cond-state / resp-cond-bye
//   MailboxData.*      === mailbox-data
//   CapabilityResponse === capability-data
export default class UntaggedResponse {
	public readonly content: ContentType;
	public readonly type: string;

	constructor(tokens: ILexerToken<unknown>[]) {
		const firstToken = tokens[0];
		const secondToken = tokens[1];
		if (
			!firstToken ||
			!(firstToken instanceof OperatorToken) ||
			firstToken.getTrueValue() !== "*" ||
			!(secondToken instanceof SPToken)
		) {
			throw new ParsingError(
				"Instantiating UntaggedResponse with a response of the wrong format",
				tokens,
			);
		}

		// Content starts after "*" and SP characters
		const contentTokens = tokens.slice(2);
		const contentTypeToken = contentTokens[0];

		if (contentTypeToken.type === TokenTypes.atom) {
			// We have an Atom token, which means we want to search for
			// the matching command for that atom
			this.type = contentTypeToken.getTrueValue() as string;

			const toCheckList = [
				StatusResponse,
				CapabilityList,
				MailboxData,
			] as const;
			for (const check of toCheckList) {
				this.content = check.match(contentTokens);
				if (this.content) {
					break;
				}
			}

			if (!this.content) {
				throw new ParsingError(
					`Parsing for command ${this.type} is not yet supported`,
					tokens,
				);
			}
		}
	}
}
