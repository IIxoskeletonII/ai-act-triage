"""Convert the official OJ XHTML of Regulation (EU) 2024/1689 to plain text.

Text is taken verbatim from each <p>. Only layout is added:
- one line per paragraph element;
- lines inside tables are indented 4 spaces per table depth;
- a label cell such as "(a)", "1." or "—" is joined to the text that follows it;
- non-breaking spaces become normal spaces and runs of whitespace collapse to one.
Usage: python to_text.py IN.xhtml OUT.txt
"""

import re
import sys
from html.parser import HTMLParser

LABEL = re.compile(r"^(\([0-9a-z]+\)|\d+(\.\d+)*\.?|—|-|•)$")


BLOCKS = {"p", "td", "div", "body"}
SKIP = {"head", "script", "style"}


class Extract(HTMLParser):
    """Collects text per innermost block element (p, td, div), so text placed
    directly in a table cell (e.g. inside a bare <span>) is not lost."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.skip = 0
        self.stack = []
        self.lines = []  # (depth, text)

    def _flush(self):
        if self.stack:
            text = re.sub(r"\s+", " ", "".join(self.stack[-1]).replace("\xa0", " ")).strip()
            if text:
                self.lines.append((self.depth, text))
            self.stack[-1] = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag == "table":
            self._flush()
            self.depth += 1
        elif tag in BLOCKS:
            self._flush()
            self.stack.append([])

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip -= 1
        elif tag == "table":
            self._flush()
            self.depth -= 1
        elif tag in BLOCKS and self.stack:
            self._flush()
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and not self.skip:
            self.stack[-1].append(data)


def main(src, dst):
    p = Extract()
    p.feed(open(src, encoding="utf-8").read())
    out, pending = [], None
    for depth, text in p.lines:
        if pending is not None:
            pdepth, label = pending
            pending = None
            if depth == pdepth:
                out.append("    " * depth + f"{label} {text}")
                continue
            out.append("    " * pdepth + label)
        if depth > 0 and LABEL.match(text):
            pending = (depth, text)
            continue
        out.append("    " * depth + text)
    if pending:
        out.append("    " * pending[0] + pending[1])
    open(dst, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
