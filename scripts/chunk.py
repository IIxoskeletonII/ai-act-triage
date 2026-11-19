"""Parse data/ai_act_source.txt into citation-ID chunks. Deterministic; text is copied, never generated.

Ids:
  Art N             whole article            Annex III            whole annex
  Art N(p)          numbered paragraph       Annex III(4)         numbered point (Annex VII(3.1) for dotted)
  Art N(p)(x)       point in a paragraph     Annex III(4)(a)      lettered point under a numbered point
  Art N(x)          point, no paragraphs     Annex XIII(a)        lettered point, no numbered points
  Annexes divided into sections (I, VIII, XI) carry the section: Annex VIII Section A(1).
Sub-points such as (i), (ii) stay inside their parent point's text.
If a later subparagraph restarts a point list, those points carry the subparagraph: Art 43(1) subpara 2(a).
A chunk's text is every source line in its scope, indentation stripped.
Usage: python chunk.py SOURCE.txt CHUNKS.json INDEX.json
"""

import json
import re
import sys

ART = re.compile(r"^Article (\d+)$")
ANNEX = re.compile(r"^ANNEX ([IVXL]+)$")
HEADING = re.compile(r"^(CHAPTER [IVXL]+|SECTION \d+)$")
PARA = re.compile(r"^(\d+)\.(\s|$)")
NUM = re.compile(r"^(\d+(?:\.\d+)*)\.(\s|$)")
POINT = re.compile(r"^\(([a-z]+|\d+)\)(\s|$)")
SECTION = re.compile(r"^Section ([A-Z0-9]+)\b")


def lines_of(path):
    for raw in open(path, encoding="utf-8").read().splitlines():
        if raw.strip():
            yield (len(raw) - len(raw.lstrip(" "))) // 4, raw.strip()


class Builder:
    def __init__(self):
        self.chunks, self.order = {}, []

    def open(self, cid, title, kind):
        if cid in self.chunks:
            raise SystemExit(f"duplicate id {cid}")
        self.chunks[cid] = {"id": cid, "title": title, "text": [], "kind": kind}
        self.order.append(cid)

    def add(self, ids, text):
        for cid in ids:
            self.chunks[cid]["text"].append(text)

    def result(self):
        return [dict(self.chunks[c], text="\n".join(self.chunks[c]["text"])) for c in self.order]


def parse_articles(lines, b):
    expected, i = 1, 0
    art = title = None
    para = point = None  # (id, depth)
    sub, skipping = 0, False
    while i < len(lines):
        depth, text = lines[i]
        if text.startswith("This Regulation shall be binding in its entirety"):
            return i
        m = ART.match(text)
        if m and depth == 0 and int(m.group(1)) == expected:
            art, title = f"Art {expected}", lines[i + 1][1]
            b.open(art, title, "article")
            b.add([art], text)
            b.add([art], title)
            expected, para, point, sub, skipping, i = expected + 1, None, None, 0, False, i + 2
            continue
        if HEADING.match(text) and depth == 0:
            skipping = True
        if skipping or art is None:
            i += 1
            continue
        if point and depth < point[1]:
            point = None
        if depth == 0 and (m := PARA.match(text)):
            para, point, sub = (f"{art}({m.group(1)})", 0), None, 1
            b.open(para[0], title, "article")
        elif depth == 0:
            sub += 1
        elif (m := POINT.match(text)) and (point is None or depth <= point[1]) and (para is None or depth > para[1]):
            base = para[0] if para else art
            cid = f"{base}({m.group(1)})"
            point = (cid if cid not in b.chunks else f"{base} subpara {sub}({m.group(1)})", depth)
            b.open(point[0], title, "article")
        b.add([art] + [x[0] for x in (para, point) if x], text)
        i += 1
    raise SystemExit("closing formula not found")


def parse_annexes(lines, b):
    sectioned = set()
    annex = title = section = None
    nums, letter = [], None  # nums: [(id, number, depth)], letter: (id, depth)
    i = 0
    while i < len(lines):
        depth, text = lines[i]
        if text.startswith("ELI: http://data.europa.eu/eli/"):
            break
        m = ANNEX.match(text)
        if m and depth == 0:
            annex, title = f"Annex {m.group(1)}", lines[i + 1][1]
            b.open(annex, title, "annex")
            b.add([annex], text)
            b.add([annex], title)
            section, nums, letter, i = None, [], None, i + 2
            continue
        if depth == 0 and (m := SECTION.match(text)):
            section, nums, letter = m.group(1), [], None
            sectioned.add(annex)
        prefix = f"{annex} Section {section}" if section else annex
        if letter and depth < letter[1]:
            letter = None
        nums = [n for n in nums if depth >= n[2]] if not NUM.match(text) else nums
        if (m := NUM.match(text)) and not SECTION.match(text):
            number = m.group(1)
            nums = [n for n in nums if number.startswith(n[1] + ".")]
            nums.append((f"{prefix}({number})", number, depth))
            letter = None
            b.open(nums[-1][0], title, "annex")
        elif (m := POINT.match(text)) and (letter is None or depth <= letter[1]):
            base = nums[-1][0] if nums else prefix
            letter = (f"{base}({m.group(1)})", depth)
            b.open(letter[0], title, "annex")
        b.add([annex] + [n[0] for n in nums] + ([letter[0]] if letter else []), text)
        i += 1
    return sectioned


def natural(cid):
    roman = {"I": 1, "V": 5, "X": 10, "L": 50}

    def rv(s):
        total = 0
        for a, c in zip(s, s[1:] + " "):
            total += -roman[a] if c != " " and roman.get(c, 0) > roman[a] else roman[a]
        return total

    head, _, rest = cid.partition(" ")
    first = re.match(r"([0-9]+|[IVXL]+)", rest).group(1)
    key = [0 if head == "Art" else 1, int(first) if first.isdigit() else rv(first)]
    key += [(0, int(t), "") if t.isdigit() else (1, 0, t) for t in re.findall(r"\d+|[A-Za-z]+", rest[len(first):])]
    return key


def main(src, chunks_path, index_path):
    lines = list(lines_of(src))
    start = next(i for i, (d, t) in enumerate(lines) if d == 0 and t == "Article 1")
    annex_start = next(i for i, (d, t) in enumerate(lines) if d == 0 and t == "ANNEX I")
    b = Builder()
    parse_articles(lines[start:annex_start], b)
    parse_annexes(lines[annex_start:], b)
    chunks = b.result()
    json.dump(chunks, open(chunks_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    json.dump(sorted(b.order, key=natural), open(index_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
