extends SceneTree
# A small fixed interpreter accepts ONLY verified declarative material-swap verbs.
# Input is the candidate extracted from two real Minecraft donor action + observer logs.
# This sandbox rehearsal does NOT accept a candidate into a receiving real-world service.

func _initialize() -> void:
    call_deferred("_execute")

func _abort(message: String) -> void:
    push_error("WF005 REHEARSAL REFUSED: " + message)
    quit(2)

func _material(token: String) -> Color:
    match token:
        "minecraft:moss_block":
            return Color(0.20, 0.46, 0.18, 1.0)
        "minecraft:cut_copper":
            return Color(0.67, 0.42, 0.21, 1.0)
        "minecraft:polished_blackstone":
            return Color(0.10, 0.09, 0.11, 1.0)
        "minecraft:gold_block":
            return Color(0.83, 0.65, 0.18, 1.0)
        _:
            return Color(-1.0, -1.0, -1.0, 1.0)

func _resolve(slot: String, base_material: String, impact_material: String) -> String:
    match slot:
        "$BASE":
            return base_material
        "$IMPACT":
            return impact_material
        _:
            return "INVALID_SLOT"

func _execute() -> void:
    var path: String = "res://replay/cartridge.json"
    if not FileAccess.file_exists(path):
        _abort("cartridge not present")
        return
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
    if not parsed is Dictionary:
        _abort("invalid JSON")
        return
    var cartridge: Dictionary = parsed
    if cartridge.get("format", "") != "world-forge/recovery-candidate/v0" or cartridge.get("disposition", "") != "HOLD":
        _abort("unrecognized candidate or not held")
        return
    if cartridge.get("execution_permission", true) != false or cartridge.get("signature") != null:
        _abort("cartridge permission/sig escalation")
        return
    var grammar: Dictionary = cartridge["grammar"]
    var environment: Dictionary = cartridge["replay_env"]
    if grammar.get("family","") != "bounded-restore-original-surface/v0":
        _abort("unknown grammar")
        return
    if environment.get("instance","") != "gamma" or environment.get("engine","") != "godot-4.4.1":
        _abort("unknown sandbox")
        return
    if environment.get("position",[]) != [37,90,22]:
        _abort("unexpected sandbox geometry")
        return
    var base_material: String = str(environment.get("base_material",""))
    var impact_material: String = str(grammar.get("impact_material",""))
    if base_material != "minecraft:gold_block" or impact_material != "minecraft:polished_blackstone":
        _abort("out of bounded material palette")
        return
    var operations: Array = grammar["operations"]
    if operations.size() != 2:
        _abort("expected exactly two learned steps")
        return
    var level := Node3D.new()
    level.name = "FreshGammaWorld"
    root.add_child(level)
    var pad := MeshInstance3D.new()
    pad.name = "ReproducedPad"
    pad.mesh = BoxMesh.new()
    var box: BoxMesh = pad.mesh as BoxMesh
    box.size = Vector3(2, 1, 2)
    level.add_child(pad)
    pad.owner = level
    pad.position = Vector3(37, 90, 22)
    var stages: Array[String] = ["build", "impact", "repair"]
    var current: String = base_material
    for index in range(stages.size()):
        var stage: String = stages[index]
        if index > 0:
            var step: Dictionary = operations[index - 1]
            var verb: String = str(step.get("verb",""))
            if index == 1 and verb != "REPLACE" or index == 2 and verb != "RESTORE":
                _abort("disallowed procedure verb")
                return
            var expected: String = _resolve(str(step.get("expected","")),base_material,impact_material)
            var target: String = _resolve(str(step.get("produce","")),base_material,impact_material)
            if current != expected or target == "INVALID_SLOT":
                _abort("learned precondition failed at " + stage)
                return
            current = target
        var color: Color = _material(current)
        if color.r < 0.0:
            _abort("unrecognized material")
            return
        var material := StandardMaterial3D.new()
        material.albedo_color = color
        pad.material_override = material
        await process_frame
        var packed := PackedScene.new()
        if packed.pack(level) != OK:
            _abort("could not serialize stage")
            return
        var snapshot_path: String = "res://snapshots/gamma-" + stage + ".tscn"
        if ResourceSaver.save(packed, snapshot_path) != OK:
            _abort("could not save snapshot")
            return
        print("WF005_ACTUAL_GODOT_STEP=" + JSON.stringify({
            "stage":stage,"verb": "SET_INITIAL_BASE" if index == 0 else operations[index-1]["verb"],
            "material":current,"sandbox_position":[37,90,22]
        }))
    quit(0)
