import os
import hmac
from collections import defaultdict
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from dotenv import load_dotenv
import bricklink_api as bl

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# Bakom nginx: lita på X-Forwarded-For/-Proto så att Flask vet att det är HTTPS
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Sätt SECURE_COOKIES=1 när appen körs bakom HTTPS
if os.environ.get("SECURE_COOKIES") == "1":
    app.config.update(
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )

APP_PASSWORD = os.environ.get("APP_PASSWORD", "")


@app.before_request
def require_login():
    if not APP_PASSWORD:
        return  # ingen inloggning konfigurerad (t.ex. lokal utveckling)
    if request.endpoint in ("login", "static"):
        return
    if not session.get("logged_in"):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Ej inloggad"}), 401
        return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        password = request.form.get("password", "")
        if APP_PASSWORD and hmac.compare_digest(password, APP_PASSWORD):
            session["logged_in"] = True
            session.permanent = True
            target = request.args.get("next", "")
            if not target.startswith("/") or target.startswith("//"):
                target = url_for("index")
            return redirect(target)
        flash("Fel lösenord.", "danger")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


TYPE_ORDER = ["PART", "SET", "MINIFIG", "BOOK", "GEAR", "CATALOG", "INSTRUCTION", "UNSORTED_LOT", "ORIGINAL_BOX"]


def _group_inventory(inventory: list) -> dict:
    """Returns {item_type: {category_name: {item_no: [entries]}}} sorted alphabetically."""
    result: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for entry in inventory:
        itype = entry.get("item", {}).get("type", "ÖVRIGT")
        cat = entry.get("category_name", "Övrigt")
        item_no = entry.get("item", {}).get("no", "")
        result[itype][cat][item_no].append(entry)

    # Sortera färgvarianter per artikel efter färgnamn
    for t in result:
        for cat in result[t]:
            for entries in result[t][cat].values():
                entries.sort(key=lambda e: e.get("color_name") or "")

    ordered = {}
    for t in TYPE_ORDER:
        if t not in result:
            continue
        ordered[t] = {}
        for cat in sorted(result[t]):
            ordered[t][cat] = dict(sorted(result[t][cat].items()))
    for t in sorted(result):
        if t not in ordered:
            ordered[t] = {}
            for cat in sorted(result[t]):
                ordered[t][cat] = dict(sorted(result[t][cat].items()))
    return ordered


def credentials_ok():
    required = ["BRICKLINK_API_KEY", "BRICKLINK_API_SECRET", "BRICKLINK_TOKEN", "BRICKLINK_TOKEN_SECRET"]
    return all(os.environ.get(k) for k in required)


@app.route("/")
def index():
    if not credentials_ok():
        flash("API-uppgifter saknas. Skapa en .env-fil baserat på .env.example.", "warning")
        return render_template("index.html", grouped={}, total=0, item_type="", error=None)
    try:
        item_type = request.args.get("item_type", "")
        inventory = bl.get_inventory(item_type or None)
        bl.enrich_with_category_names(inventory)
        grouped = _group_inventory(inventory)
        return render_template("index.html", grouped=grouped, total=len(inventory),
                               item_type=item_type, error=None)
    except Exception as e:
        return render_template("index.html", grouped={}, total=0, item_type=item_type, error=str(e))


@app.route("/item/<int:inventory_id>")
def item_detail(inventory_id):
    try:
        item = bl.get_inventory_item(inventory_id)
        return render_template("item.html", item=item)
    except Exception as e:
        flash(f"Kunde inte hämta item: {e}", "danger")
        return redirect(url_for("index"))


@app.route("/item/<int:inventory_id>/edit", methods=["GET", "POST"])
def edit_item(inventory_id):
    try:
        item = bl.get_inventory_item(inventory_id)
    except Exception as e:
        flash(f"Kunde inte hämta item: {e}", "danger")
        return redirect(url_for("index"))

    if request.method == "POST":
        try:
            quantity = int(request.form["quantity"]) if request.form.get("quantity") else None
            unit_price = request.form.get("unit_price") or None
            description = request.form.get("description")
            remarks = request.form.get("remarks")
            bl.update_inventory_item(inventory_id, quantity=quantity, unit_price=unit_price,
                                     description=description, remarks=remarks)
            flash("Inventory uppdaterat!", "success")
            return redirect(url_for("index"))
        except Exception as e:
            flash(f"Fel vid uppdatering: {e}", "danger")

    return render_template("edit_item.html", item=item)


@app.route("/item/<int:inventory_id>/delete", methods=["POST"])
def delete_item(inventory_id):
    try:
        bl.delete_inventory_item(inventory_id)
        flash("Item borttaget.", "success")
    except Exception as e:
        flash(f"Fel vid borttagning: {e}", "danger")
    return redirect(url_for("index"))


@app.route("/item/new", methods=["GET", "POST"])
def new_item():
    if request.method == "POST":
        try:
            bl.create_inventory_item(
                item_no=request.form["item_no"],
                item_type=request.form["item_type"],
                color_id=int(request.form["color_id"]),
                quantity=int(request.form["quantity"]),
                unit_price=request.form["unit_price"],
                condition=request.form.get("condition", "N"),
                description=request.form.get("description", ""),
                remarks=request.form.get("remarks", ""),
            )
            flash("Item tillagt i inventory!", "success")
            return redirect(url_for("index"))
        except Exception as e:
            flash(f"Fel vid skapande: {e}", "danger")

    return render_template("new_item.html")


@app.route("/orders")
def orders():
    try:
        status_filter = request.args.get("status", "")
        order_list = bl.get_orders(direction="in", status=status_filter or None)
        # Nyaste först
        order_list.sort(key=lambda o: o.get("date_ordered", ""), reverse=True)
        return render_template("orders.html", orders=order_list,
                               status_filter=status_filter, error=None)
    except Exception as e:
        return render_template("orders.html", orders=[], status_filter="", error=str(e))


@app.route("/orders/<int:order_id>")
def order_detail(order_id):
    try:
        order = bl.get_order(order_id)
        items = bl.get_order_items(order_id)
        bl.enrich_with_category_names(items)
        grouped_items = defaultdict(list)
        for it in items:
            grouped_items[it.get("category_name", "Övrigt")].append(it)
        grouped_items = dict(sorted(grouped_items.items()))
        return render_template("order_detail.html", order=order, grouped_items=grouped_items)
    except Exception as e:
        flash(f"Kunde inte hämta order: {e}", "danger")
        return redirect(url_for("orders"))


# JSON API-endpoints för programmatisk åtkomst
@app.route("/api/item/<item_type>/<path:item_no>")
def api_get_catalog_item(item_type, item_no):
    try:
        return jsonify(bl.get_item(item_type, item_no))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/price_guide/<item_type>/<path:item_no>")
def api_price_guide(item_type, item_no):
    try:
        color_id = request.args.get("color_id")
        condition = request.args.get("condition", "N")
        data = bl.get_price_guide(item_type, item_no, color_id, condition)
        avg_price = data.get("avg_price", "")
        return jsonify({"avg_price": avg_price})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/colors")
def api_colors():
    try:
        return jsonify(bl.get_colors())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/inventory", methods=["POST"])
def api_create_item():
    data = request.get_json()
    app.logger.info("POST /api/inventory: %s", data)
    try:
        result = bl.create_inventory_item(
            item_no=data["item_no"],
            item_type=data["item_type"],
            color_id=int(data["color_id"]) if data.get("color_id") else 0,
            quantity=int(data["quantity"]),
            unit_price=data["unit_price"],
            condition=data.get("condition", "N"),
            description=data.get("description", ""),
            remarks=data.get("remarks", ""),
        )
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/inventory")
def api_inventory():
    try:
        item_type = request.args.get("item_type")
        return jsonify(bl.get_inventory(item_type))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/inventory/<int:inventory_id>", methods=["GET"])
def api_get_item(inventory_id):
    try:
        return jsonify(bl.get_inventory_item(inventory_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/inventory/<int:inventory_id>", methods=["PUT"])
def api_update_item(inventory_id):
    try:
        data = request.get_json()
        result = bl.update_inventory_item(inventory_id, **data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/inventory/<int:inventory_id>", methods=["DELETE"])
def api_delete_item(inventory_id):
    try:
        bl.delete_inventory_item(inventory_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=True, port=port)
