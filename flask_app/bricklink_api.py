import os
import html
import logging
from urllib.parse import quote
from requests_oauthlib import OAuth1Session

_category_cache: dict[int, str] = {}
_category_parent: dict[int, int] = {}
_categories_loaded = False
_colors_cache: list = []
_colors_loaded = False


def get_session():
    return OAuth1Session(
        client_key=os.environ["BRICKLINK_API_KEY"],
        client_secret=os.environ["BRICKLINK_API_SECRET"],
        resource_owner_key=os.environ["BRICKLINK_TOKEN"],
        resource_owner_secret=os.environ["BRICKLINK_TOKEN_SECRET"],
        signature_type="auth_header",
    )


BASE_URL = "https://api.bricklink.com/api/store/v1"
logger = logging.getLogger(__name__)


def _q(value):
    """URL-koda en sökvägsdel, t.ex. artikelnummer som innehåller / eller mellanslag."""
    return quote(str(value), safe="")


def _data(resp, default):
    """Packa upp BrickLinks svar till "data", med begripliga fel istället för JSON-krascher."""
    where = f"{resp.request.method} {resp.url}" if resp.request is not None else resp.url
    # Under underhåll skickar BrickLink vidare alla anrop till en HTML-sida
    if "maintenance.bricklink.com" in (resp.url or ""):
        logger.warning("BrickLink har underhåll (omdirigerad till %s)", resp.url)
        raise RuntimeError("BrickLink har underhåll just nu och API:et svarar inte. Försök igen senare.")
    body = (resp.text or "").strip()
    if not body:
        if resp.ok:
            return default
        raise RuntimeError(f"BrickLink {resp.status_code} (tomt svar) för {where}")
    try:
        payload = resp.json()
    except ValueError:
        snippet = " ".join(body.split())[:200]
        logger.error("BrickLink svarade inte med JSON: %s -> HTTP %s: %s", where, resp.status_code, snippet)
        raise RuntimeError(
            f"BrickLink svarade inte med JSON (HTTP {resp.status_code}) för {where}: {snippet}"
        )
    meta = payload.get("meta") or {}
    code = meta.get("code", resp.status_code)
    if not resp.ok or (isinstance(code, int) and code >= 400):
        detail = " ".join(x for x in (meta.get("message"), meta.get("description")) if x)
        logger.error("BrickLink-fel %s för %s: %s", code, where, detail)
        raise RuntimeError(f"BrickLink {code}: {detail or resp.reason} ({where})")
    data = payload.get("data")
    return default if data is None else data


def _load_all_categories():
    global _categories_loaded
    if _categories_loaded:
        return
    try:
        session = get_session()
        resp = session.get(f"{BASE_URL}/categories")
        for cat in _data(resp, []):
            _category_cache[cat["category_id"]] = html.unescape(cat["category_name"])
            _category_parent[cat["category_id"]] = cat.get("parent_id") or 0
        _categories_loaded = True
    except Exception:
        pass


def category_theme(category_id):
    """(tema, underkategori) för en kategori: tema är toppkategorin, t.ex. "Star Wars"."""
    _load_all_categories()
    if not category_id or category_id not in _category_cache:
        return "Övrigt", ""
    chain, cid, seen = [], category_id, set()
    while cid and cid in _category_cache and cid not in seen:
        seen.add(cid)
        chain.append(_category_cache[cid])
        cid = _category_parent.get(cid, 0)
    theme = chain[-1]
    sub = " / ".join(reversed(chain[:-1]))
    return theme, sub


def enrich_with_category_names(inventory: list) -> None:
    """Adds category_name field in-place. Fetches all categories in one API call."""
    _load_all_categories()
    for item in inventory:
        cid = item.get("item", {}).get("category_id", 0)
        item["category_name"] = _category_cache.get(cid, "Övrigt")


def get_item(item_type, item_no):
    session = get_session()
    resp = session.get(f"{BASE_URL}/items/{item_type}/{_q(item_no)}")
    return _data(resp, {})


def get_supersets(item_type, item_no, color_id=None):
    """Vilka artiklar (set, minifigurer …) en artikel ingår i."""
    session = get_session()
    params = {}
    if color_id is not None:
        params["color_id"] = color_id
    resp = session.get(f"{BASE_URL}/items/{item_type}/{_q(item_no)}/supersets", params=params)
    return _data(resp, [])


def get_subsets(item_type, item_no):
    """Vilka delar en artikel består av, grupperat med eventuella alternativ."""
    session = get_session()
    resp = session.get(f"{BASE_URL}/items/{item_type}/{_q(item_no)}/subsets")
    return _data(resp, [])


def get_price_guide(item_type, item_no, color_id, condition="N"):
    session = get_session()
    params = {"guide_type": "sold", "new_or_used": condition}
    if color_id:
        params["color_id"] = color_id
    resp = session.get(f"{BASE_URL}/items/{item_type}/{_q(item_no)}/price", params=params)
    return _data(resp, {})


def get_colors():
    global _colors_loaded
    if _colors_loaded:
        return _colors_cache
    try:
        session = get_session()
        resp = session.get(f"{BASE_URL}/colors")
        _colors_cache.extend(
            sorted(_data(resp, []), key=lambda c: c.get("color_name", ""))
        )
        _colors_loaded = True
    except Exception:
        pass
    return _colors_cache


def _unescape_item(entry):
    if "item" in entry:
        entry["item"]["name"] = html.unescape(entry["item"].get("name", ""))
    for field in ("color_name", "description", "remarks"):
        if field in entry:
            entry[field] = html.unescape(entry[field] or "")
    return entry


def get_inventory(item_type=None):
    session = get_session()
    params = {}
    if item_type:
        params["item_type"] = item_type
    resp = session.get(f"{BASE_URL}/inventories", params=params)
    return [_unescape_item(e) for e in _data(resp, [])]


def get_inventory_item(inventory_id):
    session = get_session()
    resp = session.get(f"{BASE_URL}/inventories/{inventory_id}")
    return _data(resp, {})


def update_inventory_item(inventory_id, quantity=None, unit_price=None, description=None,
                          remarks=None, new_or_used=None, is_stock_room=None):
    session = get_session()
    body = {}
    if quantity is not None:
        # BrickLink tolkar quantity i PUT som en RELATIV ändring (+/-),
        # inte ett absolut värde. Hämta nuvarande antal och skicka differensen.
        current = get_inventory_item(inventory_id).get("quantity", 0)
        delta = int(quantity) - int(current)
        if delta != 0:
            body["quantity"] = delta
    if unit_price is not None:
        body["unit_price"] = str(unit_price)
    if description is not None:
        body["description"] = description
    if remarks is not None:
        body["remarks"] = remarks
    if new_or_used is not None:
        body["new_or_used"] = new_or_used
    if is_stock_room is not None:
        body["is_stock_room"] = bool(is_stock_room)
        if is_stock_room:
            body["stock_room_id"] = "A"
    if not body:
        return get_inventory_item(inventory_id)
    resp = session.put(f"{BASE_URL}/inventories/{inventory_id}", json=body)
    return _data(resp, {})


def delete_inventory_item(inventory_id):
    session = get_session()
    resp = session.delete(f"{BASE_URL}/inventories/{inventory_id}")
    _data(resp, None)
    return True


def get_orders(direction="in", status=None):
    session = get_session()
    params = {"direction": direction}
    if status:
        params["status"] = status
    resp = session.get(f"{BASE_URL}/orders", params=params)
    return _data(resp, [])


def get_order(order_id):
    session = get_session()
    resp = session.get(f"{BASE_URL}/orders/{order_id}")
    return _data(resp, {})


def get_order_items(order_id):
    session = get_session()
    resp = session.get(f"{BASE_URL}/orders/{order_id}/items")
    # Svaret är en lista av batchar; platta ut den
    batches = _data(resp, [])
    items = [item for batch in batches for item in batch]
    for item in items:
        _unescape_item(item)
    return items


def create_inventory_item(item_no, item_type, color_id, quantity, unit_price,
                           condition="N", description="", remarks="", stock_room=False):
    session = get_session()
    body = {
        "item": {"no": item_no, "type": item_type},
        "color_id": color_id,
        "quantity": quantity,
        "unit_price": str(unit_price),
        "new_or_used": condition,
        "description": description,
        "remarks": remarks,
        "is_retain": False,
        "is_stock_room": bool(stock_room),
    }
    if stock_room:
        body["stock_room_id"] = "A"
    resp = session.post(f"{BASE_URL}/inventories", json=body)
    return _data(resp, {})
