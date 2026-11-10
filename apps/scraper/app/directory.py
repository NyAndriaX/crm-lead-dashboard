"""Sites sectoriels (S-05) : annuaires professionnels de branche, listes de membres de fédérations…

L'utilisateur fournit des URL de pages-listes dans sa mission. Le scraper les visite
(robots.txt respecté), en extrait les établissements (nom, site, email, téléphone) puis
les passe dans le même pipeline que les fiches Google Maps (visite du site, analyse IA,
dédoublonnage).

Extraction (fonction pure ``extract_directory_entries``, testable sans navigateur) :
1. données structurées JSON-LD schema.org (Organization, LocalBusiness…, y compris ItemList) ;
2. microdonnées ``itemscope`` schema.org ;
3. heuristique des blocs répétés : le plus grand bloc (li, article, tr, div…) qui contient
   un nom et au plus un email / un site externe, et dont le parent en contient plusieurs.
Les zones de navigation (nav, header, footer, aside) sont ignorées.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

from app.contacts import extract_phones
from app.email_extractor import _extract_from_text, _is_junk

_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
_SKIP_TEXT = {"script", "style", "noscript", "template", "svg"}
_AUTO_CLOSE = {"li": {"ul", "ol"}, "tr": {"table", "tbody", "thead"}, "td": {"tr"}, "th": {"tr"},
               "dd": {"dl"}, "dt": {"dl"}, "p": set(), "option": {"select"}}
_BLOCK_TAGS = {"li", "article", "tr", "div", "section", "dd", "p", "address", "td", "dl", "figure"}
_NOISE_TAGS = {"nav", "header", "footer", "aside", "form"}
_HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6")

_NON_SITE_HOSTS = re.compile(
    r"(^|\.)(facebook\.com|fb\.com|linkedin\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|"
    r"tiktok\.com|pinterest\.[a-z]+|google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|apple\.com|wa\.me|whatsapp\.com|"
    r"bit\.ly|t\.co)$",
    re.I,
)
_GENERIC_LINK_TEXT = re.compile(
    r"^(site( web| internet)?|voir( le)?( site| fiche| plus| la fiche)?|en savoir plus|plus d'infos?|d[ée]tails?|"
    r"website|visit|more|lire la suite|contact(er)?|e-?mail|t[ée]l[ée]phone|appeler|www\..*|https?://.*)$",
    re.I,
)
_NEXT_TEXT = re.compile(r"^\s*(suivant(e)?|page suivante|next|›|»|>)\s*$", re.I)
_ORG_TYPES = re.compile(
    r"Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService|Agent|Office|Company|"
    r"Hotel|Dentist|Physician|Attorney|Notary|Shop|Business|Contractor|Service|Club|NGO",
    re.I,
)
_WS = re.compile(r"\s+")
_POSTAL_LINE = re.compile(r"[^\n]*\b\d{5}\s+[A-ZÀ-Ÿa-zà-ÿ][^\n]*")


@dataclass
class DirectoryEntry:
    name: str
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    source_url: str | None = None


class _Node:
    __slots__ = ("tag", "attrs", "children", "parent", "text")

    def __init__(self, tag: str, attrs: dict[str, str], parent: _Node | None) -> None:
        self.tag = tag
        self.attrs = attrs
        self.children: list[_Node | str] = []
        self.parent = parent

    def iter(self):
        yield self
        for c in self.children:
            if isinstance(c, _Node):
                yield from c.iter()

    def get_text(self) -> str:
        parts: list[str] = []

        def walk(n: _Node) -> None:
            if n.tag in _SKIP_TEXT:
                return
            for c in n.children:
                if isinstance(c, str):
                    parts.append(c)
                else:
                    block = c.tag in ("br", "p", "div", "li", "tr", "td", "dd", "dt") or c.tag in _HEADINGS
                    parts.append("\n" if block else " ")
                    walk(c)
                    parts.append("\n" if block else " ")

        walk(self)
        return "".join(parts)


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Node("#root", {}, None)
        self.cur = self.root
        self.scripts: list[tuple[dict[str, str], str]] = []
        self._script_attrs: dict[str, str] | None = None
        self._script_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag in _AUTO_CLOSE:
            # <li> sans </li> : ferme le précédent du même niveau.
            n: _Node | None = self.cur
            while n is not None and n.tag != "#root" and n.tag not in _AUTO_CLOSE[tag]:
                if n.tag == tag:
                    self.cur = n.parent or self.root
                    break
                n = n.parent
        node = _Node(tag, a, self.cur)
        self.cur.children.append(node)
        if tag == "script":
            self._script_attrs = a
            self._script_buf = []
        if tag not in _VOID:
            self.cur = node

    def handle_startendtag(self, tag: str, attrs) -> None:
        self.cur.children.append(_Node(tag, {k: (v or "") for k, v in attrs}, self.cur))

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script_attrs is not None:
            self.scripts.append((self._script_attrs, "".join(self._script_buf)))
            self._script_attrs = None
        n: _Node | None = self.cur
        while n is not None and n.tag != "#root":
            if n.tag == tag:
                self.cur = n.parent or self.root
                return
            n = n.parent

    def handle_data(self, data: str) -> None:
        if self._script_attrs is not None:
            self._script_buf.append(data)
            return
        self.cur.children.append(data)


def _clean(text: str | None, max_len: int = 160) -> str | None:
    if not text:
        return None
    flat = _WS.sub(" ", text).strip(" \t\n-–—|·:")
    if not flat:
        return None
    return flat[:max_len]


def _host(url: str) -> str:
    h = urlparse(url).netloc.lower().split("@")[-1].split(":")[0]
    return h[4:] if h.startswith("www.") else h


def _external_site(href: str, base_url: str) -> str | None:
    absolute = urljoin(base_url, href.strip())
    p = urlparse(absolute)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    host = _host(absolute)
    if not host or host == _host(base_url) or _NON_SITE_HOSTS.search(host):
        return None
    return f"{p.scheme}://{p.netloc}{p.path if p.path not in ('', '/') else ''}"


def _in_noise(node: _Node) -> bool:
    n: _Node | None = node
    while n is not None:
        if n.tag in _NOISE_TAGS:
            return True
        cls = (n.attrs.get("class", "") + " " + n.attrs.get("id", "") + " " + n.attrs.get("role", "")).lower()
        if re.search(r"\b(navbar|menu|breadcrumb|footer|header|cookie|pagination|navigation)\b", cls):
            return True
        n = n.parent
    return False


@dataclass
class _Signals:
    emails: set[str]
    sites: set[str]
    phones: list[str]


def _signals(node: _Node, base_url: str) -> _Signals:
    emails: set[str] = set()
    sites: set[str] = set()
    tels: list[str] = []
    for n in node.iter():
        if n.tag != "a":
            continue
        href = n.attrs.get("href", "")
        if href.startswith("mailto:"):
            addr = href[7:].split("?")[0].strip().lower()
            if addr and "@" in addr and not _is_junk(addr):
                emails.add(addr)
        elif href.startswith("tel:"):
            tels.append(href)
        else:
            site = _external_site(href, base_url)
            if site:
                sites.add(site)
    text = node.get_text()
    emails |= _extract_from_text(text)
    phones = [p["display"] for p in extract_phones(text, tels, source="annuaire")]
    if not phones:
        phones = [t[4:].strip() for t in tels if len(re.sub(r"\D", "", t)) >= 8]
    return _Signals(emails=emails, sites=sites, phones=phones)


def _block_name(node: _Node, base_url: str) -> str | None:
    for n in node.iter():
        if n.attrs.get("itemprop") == "name":
            name = _clean(n.attrs.get("content") or n.get_text(), 120)
            if name:
                return name
    for tags in (_HEADINGS, ("strong", "b")):
        for n in node.iter():
            if n.tag in tags:
                name = _clean(n.get_text(), 120)
                if name and len(name) >= 2 and not _GENERIC_LINK_TEXT.match(name):
                    return name
    for n in node.iter():
        if n.tag == "a":
            href = n.attrs.get("href", "")
            if href.startswith(("mailto:", "tel:", "#", "javascript:")):
                continue
            name = _clean(n.get_text(), 120)
            if name and len(name) >= 2 and not _GENERIC_LINK_TEXT.match(name) and "@" not in name:
                return name
    first = _clean(node.get_text().strip().split("\n")[0], 120)
    if first and "@" not in first and not re.search(r"\d{2}[\s.]\d{2}[\s.]\d{2}", first):
        return first
    return None


def _from_jsonld(scripts: list[tuple[dict[str, str], str]], base_url: str) -> list[DirectoryEntry]:
    out: list[DirectoryEntry] = []

    def visit(obj) -> None:
        if isinstance(obj, list):
            for o in obj:
                visit(o)
            return
        if not isinstance(obj, dict):
            return
        if "@graph" in obj:
            visit(obj["@graph"])
        types = obj.get("@type")
        types = " ".join(types) if isinstance(types, list) else str(types or "")
        if "ItemList" in types:
            for el in obj.get("itemListElement") or []:
                visit(el.get("item", el) if isinstance(el, dict) else el)
            return
        if _ORG_TYPES.search(types) and obj.get("name"):
            addr = obj.get("address")
            if isinstance(addr, dict):
                addr = ", ".join(
                    str(addr.get(k)) for k in ("streetAddress", "postalCode", "addressLocality", "addressCountry")
                    if addr.get(k) and isinstance(addr.get(k), str)
                )
            url = obj.get("url") or obj.get("sameAs")
            if isinstance(url, list):
                url = next((u for u in url if isinstance(u, str) and _external_site(u, base_url)), None)
            site = _external_site(url, base_url) if isinstance(url, str) else None
            email = str(obj.get("email") or "").replace("mailto:", "").strip().lower() or None
            if email and (_is_junk(email) or "@" not in email):
                email = None
            phone = _clean(str(obj.get("telephone") or ""), 40)
            out.append(DirectoryEntry(name=_clean(str(obj["name"]), 120) or "", website=site, email=email,
                                      phone=phone, address=_clean(addr if isinstance(addr, str) else None, 200)))

    for attrs, body in scripts:
        if "ld+json" not in attrs.get("type", ""):
            continue
        try:
            visit(json.loads(body))
        except (json.JSONDecodeError, TypeError):
            continue
    return [e for e in out if e.name]


def extract_directory_entries(html: str, base_url: str, max_entries: int = 200) -> list[DirectoryEntry]:
    """Établissements listés sur une page d'annuaire / liste de membres."""
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    root = builder.root

    entries = _from_jsonld(builder.scripts, base_url)

    # Microdonnées schema.org.
    for n in root.iter():
        itemtype = n.attrs.get("itemtype", "")
        if "itemscope" in n.attrs and _ORG_TYPES.search(itemtype) and not _in_noise(n):
            name = _block_name(n, base_url)
            if not name:
                continue
            sig = _signals(n, base_url)
            site = None
            for c in n.iter():
                if c.attrs.get("itemprop") == "url":
                    site = _external_site(c.attrs.get("href") or c.attrs.get("content", ""), base_url)
            addr = next((_clean(c.get_text(), 200) for c in n.iter() if c.attrs.get("itemprop") == "address"), None)
            entries.append(DirectoryEntry(name=name, website=site or next(iter(sorted(sig.sites)), None),
                                          email=next(iter(sorted(sig.emails)), None),
                                          phone=sig.phones[0] if sig.phones else None, address=addr))

    if not entries:
        # Heuristique des blocs répétés.
        cache: dict[int, tuple[bool, _Signals | None]] = {}

        def qualifies(n: _Node) -> bool:
            key = id(n)
            if key not in cache:
                ok = False
                sig = None
                if n.tag in _BLOCK_TAGS and not _in_noise(n):
                    sig = _signals(n, base_url)
                    has_signal = bool(sig.emails or sig.sites or sig.phones)
                    single = len(sig.emails) <= 1 and len(sig.sites) <= 1 and len(set(sig.phones)) <= 2
                    ok = has_signal and single
                cache[key] = (ok, sig)
            return cache[key][0]

        for n in root.iter():
            if not qualifies(n):
                continue
            parent = n.parent
            # On garde le plus grand bloc : on remonte tant que le parent est encore un bloc unique.
            if parent is not None and parent.tag in _BLOCK_TAGS and qualifies(parent):
                continue
            name = _block_name(n, base_url)
            if not name:
                continue
            sig = cache[id(n)][1]
            assert sig is not None
            postal = _POSTAL_LINE.search(n.get_text())
            entries.append(DirectoryEntry(
                name=name,
                website=next(iter(sig.sites), None),
                email=next(iter(sig.emails), None),
                phone=sig.phones[0] if sig.phones else None,
                address=_clean(postal.group(0), 200) if postal else None,
            ))

    # Dédoublonnage (nom + site) et identification de la page source.
    seen: set[str] = set()
    unique: list[DirectoryEntry] = []
    for e in entries:
        key = f"{e.name.lower()}|{_host(e.website) if e.website else ''}"
        if key in seen:
            continue
        seen.add(key)
        e.source_url = base_url
        unique.append(e)
        if len(unique) >= max_entries:
            break
    return unique


def find_next_page(html: str, base_url: str) -> str | None:
    """Lien « page suivante » (rel=next ou libellé Suivant / Next / ») sur le même site."""
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    for n in builder.root.iter():
        if n.tag not in ("a", "link"):
            continue
        href = n.attrs.get("href", "")
        if not href or href.startswith(("#", "javascript:", "mailto:")):
            continue
        rel = n.attrs.get("rel", "").lower()
        label = n.attrs.get("aria-label", "") or n.get_text()
        if "next" in rel.split() or _NEXT_TEXT.match(label or "") or re.match(r"^\s*page suivante", label or "", re.I):
            absolute = urljoin(base_url, href)
            if _host(absolute) == _host(base_url) and absolute.split("#")[0] != base_url.split("#")[0]:
                return absolute
    return None
