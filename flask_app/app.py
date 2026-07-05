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
    """Returns {item_type: {category_name: {item_no: [entries]}}} sorted alphabetically."""
    result: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for entry in inventory:
        itype = entry.get("item", {}).get("type", "ÖVRIGT")
        cat = entry.get("category_name", "Övrigt")
        item_no = entry.get("item", {}).get("no", "")
        result[itype][cat][item_no].append(entry)

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
    try:
        data = request.get_json()
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
