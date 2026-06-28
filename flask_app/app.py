import os
from collections import defaultdict
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from dotenv import load_dotenv
import bricklink_api as bl

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")


TYPE_ORDER = ["PART", "SET", "MINIFIG", "BOOK", "GEAR", "CATALOG", "INSTRUCTION", "UNSORTED_LOT", "ORIGINAL_BOX"]


def _group_inventory(inventory: list) -> dict:
    """Returns {item_type: {category_name: [items]}} sorted alphabetically."""
    result: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for item in inventory:
        itype = item.get("item", {}).get("type", "ÖVRIGT")
        cat = item.get("category_name", "Övrigt")
        result[itype][cat].append(item)
    # Sort each category's items by item number
    for itype in result:
        for cat in result[itype]:
            result[itype][cat].sort(key=lambda x: x.get("item", {}).get("no", ""))
    # Return ordered by TYPE_ORDER, then alphabetically for unknown types
    ordered = {}
    for t in TYPE_ORDER:
        if t in result:
            ordered[t] = dict(sorted(result[t].items()))
    for t in sorted(result):
        if t not in ordered:
            ordered[t] = dict(sorted(result[t].items()))
    return ordered


def credentials_ok():
    required = ["BRICKLINK_API_KEY", "BRICKLINK_API_SECRET", "BRICKLINK_TOKEN", "BRICKLINK_TOKEN_SECRET"]
    return all(os.environ.get(k) for k in required)


@app.route("/")
def index():
    if not credentials_ok():
        flash("API-uppgifter saknas. Skapa en .env-fil baserat på .env.example.", "warning")
        return render_template("index.html", inventory=[], error=None)
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


# JSON API-endpoints för programmatisk åtkomst
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
    app.run(debug=True)
