from datetime import date

import re

from flask import Flask, abort, jsonify, redirect, render_template, request, url_for
from markupsafe import Markup, escape

from articles import (
    ARTICLES,
    CATEGORIES,
    ENDINGS,
    SEARCH_ALIASES,
    article_of_the_day,
    articles_in_category,
    get_article,
)

app = Flask(__name__)
# Русские буквы в JSON пишем как есть, а не кодами а: файл поиска выходит вдвое меньше
app.json.ensure_ascii = False


# Линейки iPad, Mac, Apple Watch, iPod и AirPods в том порядке, в каком они идут в меню.
# Линейку статьи узнаём по началу её адреса; первое совпадение выигрывает
FAMILIES = {
    "ipad": [("ipad-mini-", "iPad mini"), ("ipad-pro-", "iPad Pro"), ("ipad-air-", "iPad Air"), ("ipad-", "iPad")],
    "mac": [
        ("macbook-air-", "MacBook Air"), ("macbook-pro-", "MacBook Pro"), ("macbook", "MacBook"), ("imac", "iMac"),
        ("mac-mini-", "Mac mini"), ("mac-studio", "Mac Studio"), ("mac-pro-", "Mac Pro"),
        ("emac", "iMac"), ("power-mac", "Power Mac"), ("powerbook-", "PowerBook и iBook"), ("ibook-", "PowerBook и iBook"),
        ("macintosh-", "Macintosh"), ("display-", "Мониторы"),
    ],
    "watch": [
        ("watch-se-", "Apple Watch SE"), ("watch-ultra-", "Apple Watch Ultra"),
        ("watch-edition", "Особые серии"), ("watch-hermes", "Особые серии"), ("watch-nike", "Особые серии"),
        ("watch-sport", "Особые серии"), ("watch-", "Apple Watch"),
    ],
    "ipod": [
        ("ipod-mini", "iPod mini"), ("ipod-nano-", "iPod nano"), ("ipod-shuffle-", "iPod shuffle"),
        ("ipod-touch-", "iPod touch"), ("ipod-", "iPod"),
    ],
    "airpods": [("airpods-pro-", "AirPods Pro"), ("airpods-max", "AirPods Max"), ("airpods-", "AirPods")],
}
FAMILY_ORDER = {
    "ipad": ["iPad", "iPad mini", "iPad Pro", "iPad Air"],
    "mac": [
        "MacBook", "MacBook Air", "MacBook Pro", "iMac", "Mac mini", "Mac Studio", "Mac Pro",
        "Power Mac", "PowerBook и iBook", "Macintosh", "Мониторы",
    ],
    "watch": ["Apple Watch", "Apple Watch SE", "Apple Watch Ultra", "Особые серии"],
    "ipod": ["iPod", "iPod mini", "iPod nano", "iPod shuffle", "iPod touch"],
    "airpods": ["AirPods", "AirPods Pro", "AirPods Max"],
}


# Общая статья раздела («iPhone», «Mac»…): в меню она идёт отдельным пунктом «Обзор»,
# а на странице раздела — первой
OVERVIEW = {"iphone": "iphone", "ipad": "ipad", "mac": "mac", "watch": "watch", "ipod": "ipod", "airpods": "airpods"}


def is_overview(category, a):
    return OVERVIEW.get(category) == a["slug"]


def family(category, a):
    for prefix, name in FAMILIES[category]:
        if a["slug"].startswith(prefix):
            return name
    return FAMILY_ORDER[category][0]


# Линейки iPhone в порядке меню
IPHONE_ORDER = ["iPhone", "iPhone Plus", "iPhone mini", "iPhone Pro", "iPhone Duo", "iPhone SE", "iPhone e"]


def iphone_entries(a):
    # Пункты меню для одной статьи. Общая статья вроде «iPhone 6 и 6 Plus»
    # даёт два пункта: «iPhone 6» в обычных и «iPhone 6 Plus» в линейке Plus
    slug, title = a["slug"], a["title"]
    if slug == "iphone-duo":
        return [("iPhone Duo", title)]
    if slug.startswith("iphone-se"):
        return [("iPhone SE", title)]
    if slug.endswith("e") and slug[-2].isdigit():
        return [("iPhone e", title)]
    if "-pro" in slug:
        return [("iPhone Pro", title)]
    base, _, second = title.partition(" и ")
    entries = [("iPhone", base)]
    if second:
        family = "iPhone mini" if "mini" in second else "iPhone Plus"
        entries.append((family, "iPhone " + second))
    return entries


def submenus(menu):
    # Двухуровневое меню для iPhone, iPad и Mac: [(линейка, [(название, slug), ...]), ...]
    iphone = {name: [] for name in IPHONE_ORDER}
    for a in menu["iphone"]:
        if is_overview("iphone", a):
            continue
        for line, label in iphone_entries(a):
            iphone[line].append((label, a["slug"]))
    result = {"iphone": [(k, v) for k, v in iphone.items() if v]}
    for category in FAMILIES:
        groups = {name: [] for name in FAMILY_ORDER[category]}
        for a in menu[category]:
            if not is_overview(category, a):
                groups[family(category, a)].append((a["title"], a["slug"]))
        result[category] = [(k, v) for k, v in groups.items() if v]
    return result


def sort_key(category):
    # Обзорная статья раздела всегда первая
    inner = sort_key_inner(category)
    return lambda a: (not is_overview(category, a), inner(a))


def sort_key_inner(category):
    # Модели iPhone удобнее смотреть по порядку выхода, остальное — по алфавиту.
    # Внутри года сохраняется порядок из iphones.py, он тоже хронологический
    if category == "iphone":
        return lambda a: a["year"]
    # iPad и Mac: по линейкам в порядке меню, внутри линейки — по году выхода.
    # При равном годе остаётся порядок из ipads.py / macs.py
    if category in FAMILIES:
        return lambda a: (FAMILY_ORDER[category].index(family(category, a)), a["year"])
    return lambda a: a["title"]


# --- Ссылки на предшественника и преемника в инфобоксе ---

LINKED_FACTS = ("Предшественник", "Преемник")
# Названия, которые встречаются в фактах, но не совпадают с заголовками статей
EXTRA_NAMES = {
    "macbook (retina)": "macbook-retina",
    "mac studio": "mac-studio-2022",
    "mac mini (2024)": "mac-mini-3",
    "imac (2024, m4)": "imac-2023",
    "macbook air (m1, 2020)": "macbook-air-3",
    "macbook pro (intel, 2019–2020)": "macbook-pro-4",
    "macbook pro (m1, 13 дюймов, 2020)": "macbook-pro-4",
    "macbook pro (m1 pro и m1 max, 2021)": "macbook-pro-2021",
    "macbook pro (m2 pro и m2 max)": "macbook-pro-m2",
    "macbook pro 13 дюймов (m2)": "macbook-pro-m2",
}
SEPARATOR = re.compile(r"\s*(?:;|,|/|\s—\s|\sи\s)\s*")


def norm(name):
    # «iPhone (1-го поколения)» и «iPhone (1-е поколение)» — одно и то же
    name = name.lower().replace("ё", "е")
    name = re.sub(r"-го поколения", "-е поколение", name)
    return re.sub(r"\s+", " ", name).strip()


def build_name_index():
    # Все способы назвать статью: заголовок, заголовок без годов в скобках,
    # обе модели из общих статей («iPhone 6s и 6s Plus» → «iPhone 6s», «iPhone 6s Plus»)
    index = dict(EXTRA_NAMES)
    for a in ARTICLES:
        title = a["title"]
        names = {
            title,
            re.sub(r", [^()]*\)$", ")", title),     # «Mac Pro (2-е поколение, 2013–2019)» → «Mac Pro (2-е поколение)»
            re.sub(r" \([\d–, -]+\)$", "", title),  # «iMac на Intel (2006–2012)» → «iMac на Intel»
        }
        base, _, second = title.partition(" и ")
        if second:
            brand = base.split()[0]
            names |= {base, brand + " " + second}
        for name in names:
            index.setdefault(norm(name), a["slug"])
    return index


NAME_INDEX = build_name_index()


def find_slug(name, brand):
    # «12 Pro Max» после «iPhone 12 Pro» понимаем как «iPhone 12 Pro Max»
    if name[:1].isdigit() and brand:
        name = brand + " " + name
    return NAME_INDEX.get(norm(name))


def split_outside_brackets(value):
    # Режет «iPhone XS (11 Pro); iPhone XS Max (11 Pro Max)» на устройства и разделители.
    # Запятые и «и» внутри скобок не трогаем: «MacBook Air (M3, 2024)» — одно название
    parts, start, depth, i = [], 0, 0, 0
    while i < len(value):
        depth += (value[i] == "(") - (value[i] == ")")
        m = SEPARATOR.match(value, i) if depth == 0 else None
        if m and m.end() > i:
            parts += [(value[start:i], False), (m.group(), True)]
            start = i = m.end()
            continue
        i += 1
    parts.append((value[start:], False))
    return [(p, sep) for p, sep in parts if p]


@app.template_filter("link_fact")
def link_fact(value, key, current):
    # Делает ссылками устройства в фактах «Предшественник» и «Преемник».
    # Разделители и пояснения в скобках остаются обычным текстом
    if key not in LINKED_FACTS:
        return value
    out, brand = [], ""
    for part, is_separator in split_outside_brackets(value):
        if is_separator:
            out.append(escape(part))
            continue
        name, note = part, ""
        slug = find_slug(name, brand)
        if not slug:
            m = re.match(r"^(.*?)(\s*\([^()]*\))$", part)
            if m:
                name, note = m.groups()
                slug = find_slug(name, brand)
        if slug and slug != current:
            out.append(Markup('<a href="{}">{}</a>').format(url_for("article", slug=slug), name))
        else:
            out.append(escape(name))
        out.append(escape(note))
        if not name[:1].isdigit():
            brand = name.split()[0] if name.split() else brand
    return Markup("").join(out)


@app.context_processor
def common():
    # Это нужно на каждой странице: меню разделов в шапке
    menu = {key: sorted(articles_in_category(key), key=sort_key(key)) for key in CATEGORIES}
    return {
        "categories": CATEGORIES,
        "menu": menu,
        "submenus": submenus(menu),
        "overview": {key: get_article(slug) for key, slug in OVERVIEW.items()},
        "article_count": len(ARTICLES),
    }


@app.route("/")
def index():
    # Старые ссылки на поиск вида /?q=... ведём на страницу поиска
    query = request.args.get("q", "").strip()
    if query:
        return redirect(url_for("search", q=query))

    # Главная: статьи, разложенные по категориям, и биография дня
    sections = {key: articles_in_category(key) for key in CATEGORIES}
    biography = article_of_the_day(date.today(), "people")
    events = sorted((a for a in ARTICLES if a["category"] != "people"), key=lambda a: a["year"])
    featured = article_of_the_day(date.today())
    return render_template("index.html", sections=sections, biography=biography, events=events[-5:], featured=featured)


@app.route("/category/<key>")
def category(key):
    if key not in CATEGORIES:
        abort(404)
    # Как на вики: статьи по алфавиту, сгруппированные по первой букве.
    # У iPhone все названия на одну букву, поэтому там группы — годы выхода, а у iPad — линейки
    groups = {}
    for a in sorted(articles_in_category(key), key=sort_key(key)):
        if is_overview(key, a):
            label = "Обзор"
        elif key == "iphone":
            label = a["year"]
        elif key in FAMILIES:
            label = family(key, a)
        else:
            label = a["title"][0].upper()
        groups.setdefault(label, []).append(a)
    return render_template("category.html", key=key, groups=groups)


@app.route("/timeline")
def timeline():
    # Хронология: события и устройства по годам, люди сюда не попадают
    events = sorted(
        (a for a in ARTICLES if a["category"] != "people"),
        key=lambda a: a["year"],
    )
    return render_template("timeline.html", events=events)


def search_text(a):
    # Весь текст статьи одной строкой: заголовок, описание, факты и разделы.
    # Маленькими буквами и с «е» вместо «ё», как в search_articles
    parts = [a["title"], a["summary"], *a["facts"].values(), *a["body"]]
    for section in a.get("sections", []):
        parts += [section["title"], *section.get("paragraphs", []), *section.get("list", [])]
    return " ".join(parts).lower().replace("ё", "е")


@app.route("/search-index.json")
def search_index():
    # Всё, что нужно для поиска в браузере (static/suggest.js): так поиск работает
    # и здесь, и на GitHub Pages, где нет Python
    items = []
    for a in ARTICLES:
        image = a.get("image")
        items.append({
            "title": a["title"],
            "summary": a["summary"],
            "url": url_for("article", slug=a["slug"]),
            "image": url_for("static", filename=image["file"]) if image else None,
            "logo": bool(image and image.get("logo")),
            "emoji": a["emoji"],
            "category": CATEGORIES[a["category"]],
            "text": search_text(a),
        })
    return jsonify({"endings": ENDINGS, "aliases": SEARCH_ALIASES, "articles": items})


@app.route("/search")
def search():
    # Результаты ищет и рисует скрипт в браузере, страница — только рамка для них
    return render_template("search.html", query=request.args.get("q", "").strip())


@app.route("/random")
def random_article():
    # Статью выбирает браузер, поэтому каждый раз новая, даже на GitHub Pages
    urls = [url_for("article", slug=a["slug"]) for a in ARTICLES]
    return render_template("random.html", urls=urls)


@app.route("/article/<slug>")
def article(slug):
    item = get_article(slug)
    if item is None:
        abort(404)
    # Ссылки на статьи, которых пока нет, пропускаем
    related = [a for a in map(get_article, item["related"]) if a]
    return render_template("article.html", article=item, related=related)


@app.errorhandler(404)
def not_found(error):
    return render_template("404.html"), 404
