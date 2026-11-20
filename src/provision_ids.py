"""The tree structure of AI Act provision ids.

An id is a root (an article or an annex) followed by a path of components, read from the id itself:
  Art 5(1)(h)              -> Art 5      / 1, h
  Annex III(4)(a)          -> Annex III  / 4, a
  Annex VII(3.1)           -> Annex VII  / 3, 1          (a dotted number nests under its prefix)
  Annex VIII Section A(1)  -> Annex VIII / Section A, 1
  Art 43(1) subpara 2(a)   -> Art 43     / 1, subpara 2, a
One id is within another when both have the same root and the other's path is a prefix of its path.
Ids that do not follow this structure (e.g. curated-KB ids such as 'Recital-minimal') match only themselves.
"""

import re

_ROOT = re.compile(r"(Art \d+|Annex [IVXL]+)")
_PART = re.compile(r"\s+(Section [A-Z0-9]+|subpara \d+)|\(([^()]+)\)")


def parse(cid):
    """Return (root, path) for a structured id, or None if the id does not follow the structure."""
    m = _ROOT.match(cid)
    if not m:
        return None
    path, pos = [], m.end()
    while pos < len(cid):
        p = _PART.match(cid, pos)
        if not p:
            return None
        path += [p.group(1)] if p.group(1) else p.group(2).split(".")
        pos = p.end()
    return m.group(1), tuple(path)


def within(cid, ancestor):
    """True if cid equals ancestor or is a descendant of it in the id tree."""
    if cid == ancestor:
        return True
    a, b = parse(cid), parse(ancestor)
    return bool(a and b) and a[0] == b[0] and a[1][:len(b[1])] == b[1]
