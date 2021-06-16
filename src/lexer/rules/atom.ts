import { AtomToken } from "../tokens/atom";
import { ILexerRule } from "../types";

// From the spec, an atom is any character except a set of
// special characters
//
// atom            = 1*ATOM-CHAR
// ATOM-CHAR       = <any CHAR except atom-specials>
// atom-specials   = "(" / ")" / "{" / SP / CTL / list-wildcards /
//                   quoted-specials / resp-specials
// SP              = " "
// CTL             = \x00-\x1F
// list-wildcards  = "%" / "*"
// quoted-specials = "\"" / "\"
// resp-specials   = "]"
// (From https://datatracker.ietf.org/doc/html/rfc3501#section-9)
//
// This regexp will match any character that begins an atom
// and go until it sees an invalid character.
const RE_ATOM_MATCH = /^[^ \(\)\{\x00-\x1F%\*"\\\]]+/;
const RE_BEGIN_LINE_CONTROL = /^[\+\*]/;

export class AtomRule implements ILexerRule<string> {
	public match(content: string, originalPos: number): null | AtomToken {
		const matched = content.match(RE_ATOM_MATCH);
		const beginControl = content.match(RE_BEGIN_LINE_CONTROL);
		if (matched && (originalPos > 0 || !beginControl)) {
			const [atom] = matched;
			return new AtomToken(atom);
		}

		return null;
	}
}
