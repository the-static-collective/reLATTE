extends SceneTree
# New headless process, no operator/interpreter invoked.
# Only inspected resources and their material read-back count as Godot evidence.

func _initialize() -> void:
    call_deferred("_inspect")

func _abort(message: String) -> void:
    push_error("WF005 READER FAILED: " + message)
    quit(2)

func _is_color(actual: Color, expected: Color) -> bool:
    return absf(actual.r - expected.r) < 0.008 and absf(actual.g - expected.g) < 0.008 and absf(actual.b - expected.b) < 0.008

func _token(color: Color) -> String:
    if _is_color(color, Color(0.10, 0.09, 0.11, 1.0)):
        return "minecraft:polished_blackstone"
    if _is_color(color, Color(0.83, 0.65, 0.18, 1.0)):
        return "minecraft:gold_block"
    if _is_color(color, Color(0.20, 0.46, 0.18, 1.0)):
        return "minecraft:moss_block"
    if _is_color(color, Color(0.67, 0.42, 0.21, 1.0)):
        return "minecraft:cut_copper"
    return "UNKNOWN_COLOR"

func _inspect() -> void:
    var observations: Array = []
    for stage in ["build","impact","repair"]:
        var path: String = "res://snapshots/gamma-" + stage + ".tscn"
        var resource := load(path) as PackedScene
        if resource == null:
            _abort("snapshot not loaded: " + stage)
            return
        var level: Node3D = resource.instantiate() as Node3D
        if level == null:
            _abort("not a 3D scene")
            return
        root.add_child(level)
        var pad := level.get_node_or_null("ReproducedPad") as MeshInstance3D
        if pad == null or not (pad.mesh is BoxMesh) or not (pad.material_override is StandardMaterial3D):
            _abort("unreadable engine mesh")
            return
        if pad.position.distance_to(Vector3(37, 90, 22)) > 0.001:
            _abort("wrong observed position")
            return
        var material: StandardMaterial3D = pad.material_override as StandardMaterial3D
        var block: String = _token(material.albedo_color)
        if block == "UNKNOWN_COLOR":
            _abort("unknown actual color")
            return
        observations.append({"stage":stage,"block":block})
        level.queue_free()
        await process_frame
    print("WF005_GODOT_REPLAY_OBSERVED=" + JSON.stringify({
        "instance":"gamma","reader":"GammaReadbackProcess",
        "observation_class":"FRESH_PROCESS_PACKEDSCENE_READ",
        "position":[37,90,22],"observations":observations,"receiver":"HOLD"
    }))
    quit(0)
