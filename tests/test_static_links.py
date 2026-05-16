from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attr in ("href", "src"):
            value = attrs.get(attr)
            if value:
                self.references.append((tag, attr, value))


def local_references(html):
    parser = AssetParser()
    parser.feed(html)
    for tag, attr, value in parser.references:
        parsed = urlparse(value)
        if parsed.scheme or value.startswith(("#", "mailto:", "tel:", "data:")):
            continue
        yield tag, attr, parsed.path


def test_landing_page_links_stay_inside_repo_and_exist():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    assert "{{" not in html
    assert "C:\\" not in html
    assert "D:\\" not in html

    missing = []
    escaped = []
    for tag, attr, ref in local_references(html):
        target = (ROOT / ref).resolve()
        if ROOT not in (target, *target.parents):
            escaped.append(f"{tag} {attr}={ref}")
            continue
        if not target.exists():
            missing.append(f"{tag} {attr}={ref}")

    assert escaped == []
    assert missing == []


def test_validation_links_use_existing_repo_docs():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    assert "docs/validation-report.md" in html
    assert "docs/limitations.md" in html
    assert "r-validation-runner.html" not in html
    assert "../../Living metas/" not in html
