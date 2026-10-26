from flask import Blueprint, jsonify, request

from api.services.earworm_service import EarwormService
from api.utils.auth_middleware import get_current_user_id, require_auth


def create_earworm_routes(service: EarwormService):
    bp = Blueprint("earworm", __name__)

    @bp.get("/earworm/music/search")
    @require_auth
    def search_music():
        query = request.args.get("q", "")
        try:
            return jsonify({"results": service.search_music(query)})
        except Exception as exc:
            return jsonify({"error": f"Music search failed: {exc}"}), 502

    @bp.get("/earworm/entries")
    @require_auth
    def list_entries():
        user_id = get_current_user_id()
        if user_id is None:
            return jsonify({"error": "Unauthorized"}), 401
        return jsonify(service.list_entries(user_id, request.args.get("start_date"), request.args.get("end_date")))

    @bp.post("/earworm/entries")
    @require_auth
    def create_entry():
        user_id = get_current_user_id()
        if user_id is None:
            return jsonify({"error": "Unauthorized"}), 401
        try:
            entry_id = service.create_entry(user_id, request.get_json(silent=True) or {})
            return jsonify({"id": entry_id, "status": "created"}), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.put("/earworm/entries/<int:entry_id>")
    @require_auth
    def update_entry(entry_id: int):
        user_id = get_current_user_id()
        if user_id is None:
            return jsonify({"error": "Unauthorized"}), 401
        entry = service.update_entry(user_id, entry_id, request.get_json(silent=True) or {})
        return jsonify(entry) if entry else (jsonify({"error": "Entry not found"}), 404)

    @bp.delete("/earworm/entries/<int:entry_id>")
    @require_auth
    def delete_entry(entry_id: int):
        user_id = get_current_user_id()
        if user_id is None:
            return jsonify({"error": "Unauthorized"}), 401
        return jsonify({"status": "deleted"}) if service.delete_entry(user_id, entry_id) else (jsonify({"error": "Entry not found"}), 404)

    return bp
