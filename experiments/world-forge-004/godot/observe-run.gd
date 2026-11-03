extends SceneTree
# Launched as a separate, fresh Godot process AFTER author process exits.
# Reads serialized BoxMesh scene files without importing or calling operator-run.gd.
# This is independent artifact inspection, NOT live multiuser observation.

func _initialize() -> void:
    call_deferred("_observe")

func _fail(message: String) -> void:
    push_error("WF004 OBSERVER: " + message)
    quit(2)

func _near(actual: Color, expected: Color) -> bool:
    return absf(actual.r - expected.r) < 0.008 and absf(actual.g - expected.g) < 0.008 and absf(actual.b - expected.b) < 0.008

func _classify(color: Color, world: String) -> String:
    if _near(color, Color(0.10, 0.09, 0.11, 1.0)):
        return "minecraft:polished_blackstone"
    if world == "alpha" and _near(color, Color(0.20, 0.46, 0.18, 1.0)):
        return "minecraft:moss_block"
    if world == "beta" and _near(color, Color(0.67, 0.42, 0.21, 1.0)):
        return "minecraft:cut_copper"
    return "UNKNOWN_COLOR"

func _observe() -> void:
    var world: String = OS.get_environment("WF_WORLD")
    if world != "alpha" and world != "beta":
        _fail("unknown world")
        return
    var readings: Array = []
    for stage in ["build", "impact", "repair"]:
        var path := "res://snapshots/" + world + "-" + stage + ".tscn"
        var resource := load(path) as PackedScene
        if resource == null:
            _fail("snapshot missing " + path)
            return
        var level := resource.instantiate()
        if level == null:
            _fail("snapshot did not instantiate")
            return
        root.add_child(level)
        var tile := level.get_node_or_null("ObservedPad") as MeshInstance3D
        if tile == null or not(tile.mesh is BoxMesh) or not(tile.material_override is StandardMaterial3D):
            _fail("not a proper mesh and surface material")
            return
        var mesh := tile.mesh as BoxMesh
        if mesh.size.distance_to(Vector3(2.0, 1.0, 2.0)) > 0.001:
            _fail("unexpected mesh size")
            return
        var material := tile.material_override as StandardMaterial3D
        var value := _classify(material.albedo_color, world)
        if value == "UNKNOWN_COLOR":
            _fail("unknown actual observed material")
            return
        readings.append({"stage":stage, "block":value})
        level.queue_free()
        await process_frame
    print("WF004_GODOT_OBSERVER=" + JSON.stringify({
        "world":world,
        "observer":"GodotSnapshotReader",
        "observer_class":"FRESH_PROCESS_SERIALIZED_SCENE_READ",
        "observations":readings,
        "receiver":"HOLD"
    }))
    quit(0)
