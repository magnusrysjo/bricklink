import os
from requests_oauthlib import OAuth1Session

_category_cache: dict[int, str] = {}
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


def _load_all_categories():
    global _categories_loaded
    if _categories_loaded:
        return
    try:
        session = get_session()
        resp = session.get(f"{BASE_URL}/categories")
        resp.raise_for_status()
        for cat in resp.json().get("data", []):
            _category_cache[cat["category_id"]] = cat["category_name"]
        _categories_loaded = True
    except Exception:
        pass


def enrich_with_category_names(inventory: list) -> None:
    """Adds category_name field in-place. Fetches all categories in one API call."""
    _load_all_categories()
    for item in inventory:
        cid = item.get("item", {}).get("category_id", 0)
        item["category_name"] = _category_cache.get(cid, "Övrigt")


def get_item(item_type, item_no):
    session = get_session()
    resp = session.get(f"{BASE_URL}/items/{item_type}/{item_no}")
    resp.raise_for_status()
    return resp.json().get("data", {})


def get_price_guide(item_type, item_no, color_id, condition="N"):
    session = get_session()
    params = {"guide_type": "sold", "new_or_used": condition}
    if color_id:
        params["color_id"] = color_id
    resp = session.get(f"{BASE_URL}/items/{item_type}/{item_no}/price", params=params)
    resp.raise_for_status()
    return resp.json().get("data", {})


def get_colors():
    global _colors_loaded
    if _colors_loaded:
        return _colors_cache
    try:
        session = get_session()
        resp = session.get(f"{BASE_URL}/colors")
        resp.raise_for_status()
        _colors_cache.extend(
            sorted(resp.json().get("data", []), key=lambda c: c.get("color_name", ""))
        )
        _colors_loaded = True
    except Exception:
        pass
    return _colors_cache


def get_inventory(item_type=None):
    session = get_session()
    params = {}
    if item_type:
        params["item_type"] = item_type
    resp = session.get(f"{BASE_URL}/inventories", params=params)
    resp.raise_for_status()
    return resp.json().get("data", [])


def get_inventory_item(inventory_id):
    session = get_session()
    resp = session.get(f"{BASE_URL}/inventories/{inventory_id}")
    resp.raise_for_status()
    return resp.json().get("data", {})


def update_inventory_item(inventory_id, quantity=None, unit_price=None, description=None,
                          remarks=None, new_or_used=None):
    session = get_session()
    body = {}
    if quantity is not None:
        body["quantity"] = quantity
    if unit_price is not None:
        body["unit_price"] = str(unit_price)
    if description is not None:
        body["description"] = description
    if remarks is not None:
        body["remarks"] = remarks
    if new_or_used is not None:
        body["new_or_used"] = new_or_used
    resp = session.put(f"{BASE_URL}/inventories/{inventory_id}", json=body)
    resp.raise_for_status()
    return resp.json().get("data", {})


def delete_inventory_item(inventory_id):
    session = get_session()
    resp = session.delete(f"{BASE_URL}/inventories/{inventory_id}")
    resp.raise_for_status()
    return True


def create_inventory_item(item_no, item_type, color_id, quantity, unit_price,
                           condition="N", description="", remarks=""):
    session = get_session()
    body = {
        "item": {"no": item_no, "type": item_type},
        "color_id": color_id,
        "quantity": quantity,
        "unit_price": str(unit_price),
        "new_or_used": condition,
        "description": description,
        "remarks": remarks,
    }
    resp = session.post(f"{BASE_URL}/inventories", json=body)
    resp.raise_for_status()
    return resp.json().get("data", {})
